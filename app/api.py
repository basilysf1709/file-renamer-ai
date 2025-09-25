from fastapi import FastAPI, UploadFile, File, Body
from fastapi.responses import JSONResponse
import boto3, uuid, json
from settings import settings


app = FastAPI(title="Renamer AI API")
sqs = boto3.client("sqs", region_name=settings.aws_region)


@app.post("/v1/jobs/rename")
def create_job(user_prompt: str = Body("", embed=True), files: list[UploadFile] = File(default=[])):
    job_id = f"jr_{uuid.uuid4().hex[:8]}"
    # Upload files to input bucket under clientless demo prefix
    s3 = boto3.client("s3", region_name=settings.aws_region)
    keys = []
    for f in files:
        key = f"demo/{job_id}/{f.filename}"
        s3.upload_fileobj(f.file, settings.s3_in_bucket, key)
        keys.append(key)
    # Enqueue batches of keys
    payload = {"job_id": job_id, "prompt": user_prompt, "keys": keys}
    sqs.send_message(QueueUrl=settings.sqs_queue_url, MessageBody=json.dumps(payload))
    return {"job_id": job_id, "status": "queued", "count": len(keys)}


@app.get("/health")
def health():
    return {"ok": True} 