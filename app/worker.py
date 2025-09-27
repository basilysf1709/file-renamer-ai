import json
import boto3
import time
import asyncio
from typing import Dict, Any, List
from concurrent.futures import ThreadPoolExecutor
from settings import settings
from inference import get_vlm
from naming import dedupe
from websocket_manager import send_job_update
from datetime import datetime

# AWS clients with optimized configuration
from botocore.config import Config

config = Config(
    retries={'max_attempts': 3},
    max_pool_connections=50
)
sqs = boto3.client("sqs", region_name=settings.aws_region, config=config)
s3 = boto3.client("s3", region_name=settings.aws_region, config=config)

# Global VLM instance - load once at startup
vlm = None

def init_vlm():
    """Initialize VLM model once at startup"""
    global vlm
    if vlm is None:
        print("🤖 Loading VLM model...")
        vlm = get_vlm()
        print("✅ VLM model loaded successfully")

async def process_single_file(file_key: str, index: int, user_prompt: str, job_id: str, existing_names: set) -> Dict[str, Any]:
    """Process a single file with error handling"""
    try:
        # Send processing update
        await send_job_update(job_id, "item_processing", {
            "index": index,
            "filename": file_key.split('/')[-1],
            "status": "downloading"
        })
        
        # Download image from S3
        print(f"📥 Processing file {index+1}: {file_key}")
        response = s3.get_object(Bucket=settings.s3_in_bucket, Key=file_key)
        
        # Stream the file content instead of loading all into memory
        image_bytes = response['Body'].read()
        
        # Send AI processing update
        await send_job_update(job_id, "item_processing", {
            "index": index,
            "filename": file_key.split('/')[-1],
            "status": "ai_processing"
        })
        
        # Generate filename using AI
        start_time = time.time()
        suggested_name = vlm.predict_single(image_bytes, user_prompt)
        processing_time = time.time() - start_time
        
        # Handle deduplication (thread-safe)
        final_name = dedupe(suggested_name, existing_names)
        
        # Determine file extension from original
        original_filename = file_key.split('/')[-1]
        original_ext = original_filename.split('.')[-1] if '.' in original_filename else 'jpg'
        final_filename = f"{final_name}.{original_ext}"
        
        # Create result
        result = {
            "index": index,
            "original": original_filename,
            "suggested": final_filename,
            "processing_time_ms": int(processing_time * 1000),
            "status": "completed",
            "timestamp": datetime.now().isoformat()
        }
        
        print(f"✅ Completed {index+1}: {original_filename} → {final_filename}")
        return result
        
    except Exception as e:
        error_msg = str(e)
        print(f"❌ Error processing file {index+1}: {error_msg}")
        
        return {
            "index": index,
            "original": file_key.split('/')[-1],
            "suggested": None,
            "error": error_msg,
            "status": "error",
            "timestamp": datetime.now().isoformat()
        }

async def process_job_with_progress(job_data: Dict[str, Any]):
    """Process job with parallel file processing and real-time progress updates"""
    job_id = job_data["job_id"]
    file_keys = job_data["file_keys"]
    user_prompt = job_data.get("user_prompt", "")
    total_files = len(file_keys)
    
    # Configure concurrency based on file count and system resources
    max_concurrent = min(5, max(1, total_files // 2))  # Dynamic concurrency
    
    print(f"🔄 Starting job {job_id} with {total_files} files (max concurrent: {max_concurrent})")
    
    # Send job started update
    await send_job_update(job_id, "job_started", {
        "total_files": total_files,
        "completed": 0,
        "status": "processing",
        "max_concurrent": max_concurrent
    })
    
    # Ensure VLM is loaded
    if vlm is None:
        init_vlm()
    
    # Track processed names for deduplication (thread-safe set)
    existing_names = set()
    results = []
    completed_count = 0
    
    # Create semaphore to limit concurrent processing
    semaphore = asyncio.Semaphore(max_concurrent)
    
    async def process_with_semaphore(file_key: str, index: int) -> Dict[str, Any]:
        """Process file with concurrency control"""
        nonlocal completed_count
        
        async with semaphore:
            result = await asyncio.get_event_loop().run_in_executor(
                None,  # Use default thread pool
                lambda: asyncio.run(process_single_file(file_key, index, user_prompt, job_id, existing_names))
            )
            
            # Update progress atomically
            completed_count += 1
            
            # Send individual completion update
            await send_job_update(job_id, "item_complete", {
                "result": result,
                "progress": {"completed": completed_count, "total": total_files}
            })
            
            return result
    
    # Create tasks for all files
    tasks = [
        process_with_semaphore(file_key, index) 
        for index, file_key in enumerate(file_keys)
    ]
    
    # Process all files concurrently with progress tracking
    try:
        print(f"🚀 Starting parallel processing of {total_files} files...")
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Handle any exceptions in results
        processed_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                error_result = {
                    "index": i,
                    "original": file_keys[i].split('/')[-1],
                    "suggested": None,
                    "error": str(result),
                    "status": "error",
                    "timestamp": datetime.now().isoformat()
                }
                processed_results.append(error_result)
            else:
                processed_results.append(result)
        
        results = processed_results
        
    except Exception as e:
        print(f"❌ Error in parallel processing: {e}")
        # Send error update for the entire job
        await send_job_update(job_id, "job_error", {
            "error": f"Parallel processing failed: {str(e)}"
        })
        return
    
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
            "manifest_url": f"s3://{settings.s3_out_bucket}/demo/jobs/{job_id}/manifest.jsonl",
            "processing_stats": {
                "max_concurrent": max_concurrent,
                "total_processing_time": sum(r.get("processing_time_ms", 0) for r in results if "processing_time_ms" in r)
            }
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
    
    # Initialize VLM model at startup
    init_vlm()
    
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
                
                # Process job with parallel processing
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
