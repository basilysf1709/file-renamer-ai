import os, json, io
import boto3
from botocore.config import Config
from settings import settings
from inference import get_vlm
from naming import dedupe


s3 = boto3.client("s3", region_name=settings.aws_region, config=Config(max_pool_connections=50))
sqs = boto3.client("sqs", region_name=settings.aws_region)


MANIFEST_PART_SIZE = 5 * 1024 * 1024


def process_job(job):
    job_id   = job["job_id"]
    prompt   = job.get("prompt", "")
    keys     = job["keys"]

    out_prefix = f"demo/jobs/{job_id}/"
    manifest_key = out_prefix + "manifest.jsonl"
    mp = s3.create_multipart_upload(Bucket=settings.s3_out_bucket, Key=manifest_key, ContentType="application/json")
    parts, part_no = [], 1
    buf = io.BytesIO()

    existing = set()

    vlm = get_vlm()

    BATCH = settings.batch_size
    for i in range(0, len(keys), BATCH):
        batch = keys[i:i+BATCH]
        images = []
        metas  = []
        for key in batch:
            obj = s3.get_object(Bucket=settings.s3_in_bucket, Key=key)
            b = obj["Body"].read()
            images.append(b)
            metas.append({"old": key.split("/")[-1], "path": "/".join(key.split("/")[:-1]) + "/"})
        names = vlm.predict_names(images, prompt)
        for meta, name, bytes_ in zip(metas, names, images):
            safe = dedupe(name, existing) + ".jpg"
            out_key = out_prefix + "output/" + meta["path"].split("demo/")[-1] + safe
            s3.put_object(Bucket=settings.s3_out_bucket, Key=out_key, Body=bytes_)
            line = json.dumps({
                "old": meta["old"], "new": safe, "path": meta["path"], "status": "ok"
            }) + "\n"
            lb = line.encode("utf-8")
            if buf.tell() + len(lb) >= MANIFEST_PART_SIZE:
                resp = s3.upload_part(Bucket=settings.s3_out_bucket, Key=manifest_key, PartNumber=part_no, UploadId=mp["UploadId"], Body=buf.getvalue())
                parts.append({"ETag": resp["ETag"], "PartNumber": part_no})
                part_no += 1
                buf = io.BytesIO()
            buf.write(lb)
    if buf.tell():
        resp = s3.upload_part(Bucket=settings.s3_out_bucket, Key=manifest_key, PartNumber=part_no, UploadId=mp["UploadId"], Body=buf.getvalue())
        parts.append({"ETag": resp["ETag"], "PartNumber": part_no})
    s3.complete_multipart_upload(Bucket=settings.s3_out_bucket, Key=manifest_key, UploadId=mp["UploadId"], MultipartUpload={"Parts": parts})


def poll_loop():
    while True:
        resp = sqs.receive_message(QueueUrl=settings.sqs_queue_url, MaxNumberOfMessages=1, WaitTimeSeconds=10)
        for m in resp.get("Messages", []):
            body = json.loads(m["Body"])
            try:
                process_job(body)
                sqs.delete_message(QueueUrl=settings.sqs_queue_url, ReceiptHandle=m["ReceiptHandle"])
            except Exception as e:
                print("ERROR:", e, flush=True)
                # let visibility timeout expire → DLQ if retries exceed max


if __name__ == "__main__":
    poll_loop() 