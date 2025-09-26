import json
import boto3
import time
import asyncio
from typing import Dict, Any
from settings import settings
from inference import get_vlm
from naming import dedupe
from websocket_manager import send_job_update
from datetime import datetime

# AWS clients
sqs = boto3.client("sqs", region_name=settings.aws_region)
s3 = boto3.client("s3", region_name=settings.aws_region)

async def process_job_with_progress(job_data: Dict[str, Any]):
    """Process job with real-time progress updates"""
    job_id = job_data["job_id"]
    file_keys = job_data["file_keys"]
    user_prompt = job_data.get("user_prompt", "")
    total_files = len(file_keys)
    
    print(f"🔄 Starting job {job_id} with {total_files} files")
    
    # Send job started update
    await send_job_update(job_id, "job_started", {
        "total_files": total_files,
        "completed": 0,
        "status": "processing"
    })
    
    # Get VLM instance
    vlm = get_vlm()
    
    # Track processed names for deduplication
    existing_names = set()
    results = []
    
    # Process each file individually for real-time feedback
    for i, file_key in enumerate(file_keys):
        try:
            # Send processing update
            await send_job_update(job_id, "item_processing", {
                "index": i,
                "filename": file_key.split('/')[-1],
                "progress": {"completed": i, "total": total_files}
            })
            
            # Download image from S3
            print(f"📥 Processing file {i+1}/{total_files}: {file_key}")
            response = s3.get_object(Bucket=settings.s3_in_bucket, Key=file_key)
            image_bytes = response['Body'].read()
            
            # Generate filename using AI
            start_time = time.time()
            suggested_name = vlm.predict_single(image_bytes, user_prompt)
            processing_time = time.time() - start_time
            
            # Handle deduplication
            final_name = dedupe(suggested_name, existing_names)
            
            # Determine file extension from original
            original_filename = file_key.split('/')[-1]
            original_ext = original_filename.split('.')[-1] if '.' in original_filename else 'jpg'
            final_filename = f"{final_name}.{original_ext}"
            
            # Create result
            result = {
                "index": i,
                "original": original_filename,
                "suggested": final_filename,
                "processing_time_ms": int(processing_time * 1000),
                "status": "completed",
                "timestamp": datetime.now().isoformat()
            }
            
            results.append(result)
            
            # Send individual completion update
            await send_job_update(job_id, "item_complete", {
                "result": result,
                "progress": {"completed": i + 1, "total": total_files}
            })
            
            print(f"✅ Completed {i+1}/{total_files}: {original_filename} → {final_filename}")
            
        except Exception as e:
            error_msg = str(e)
            print(f"❌ Error processing file {i+1}/{total_files}: {error_msg}")
            
            # Send error update
            await send_job_update(job_id, "item_error", {
                "index": i,
                "filename": file_key.split('/')[-1],
                "error": error_msg,
                "progress": {"completed": i + 1, "total": total_files}
            })
            
            # Add error result
            results.append({
                "index": i,
                "original": file_key.split('/')[-1],
                "suggested": None,
                "error": error_msg,
                "status": "error",
                "timestamp": datetime.now().isoformat()
            })
    
    # Upload results to S3
    try:
        # Create manifest file
        manifest_lines = [json.dumps(result) for result in results]
        manifest_content = '\n'.join(manifest_lines)
        
        # Upload manifest
        s3.put_object(
            Bucket=settings.s3_out_bucket,
            Key=f"demo/jobs/{job_id}/manifest.jsonl",
            Body=manifest_content.encode('utf-8'),
            ContentType='application/jsonl'
        )
        
        # Send job completion update
        successful_results = [r for r in results if r.get("status") == "completed"]
        await send_job_update(job_id, "job_complete", {
            "total_files": total_files,
            "completed": len(successful_results),
            "errors": total_files - len(successful_results),
            "results": results,
            "manifest_url": f"s3://{settings.s3_out_bucket}/demo/jobs/{job_id}/manifest.jsonl"
        })
        
        print(f"🎉 Job {job_id} completed: {len(successful_results)}/{total_files} successful")
        
    except Exception as e:
        print(f"❌ Error uploading results for job {job_id}: {e}")
        await send_job_update(job_id, "job_error", {
            "error": f"Failed to upload results: {str(e)}"
        })

def main():
    """Main worker loop"""
    print("🚀 Worker starting...")
    
    while True:
        try:
            # Poll SQS for messages
            response = sqs.receive_message(
                QueueUrl=settings.sqs_queue_url,
                MaxNumberOfMessages=1,
                WaitTimeSeconds=10
            )
            
            messages = response.get('Messages', [])
            if not messages:
                continue
                
            message = messages[0]
            receipt_handle = message['ReceiptHandle']
            
            try:
                # Parse job data
                job_data = json.loads(message['Body'])
                print(f"📨 Received job: {job_data.get('job_id', 'unknown')}")
                
                # Process job with progress updates
                asyncio.run(process_job_with_progress(job_data))
                
                # Delete message from queue on success
                sqs.delete_message(
                    QueueUrl=settings.sqs_queue_url,
                    ReceiptHandle=receipt_handle
                )
                
            except Exception as e:
                print(f"❌ Error processing job: {e}")
                # Message will return to queue for retry
                
        except KeyboardInterrupt:
            print("🛑 Worker stopping...")
            break
        except Exception as e:
            print(f"❌ Worker error: {e}")
            time.sleep(5)

if __name__ == "__main__":
    main()
