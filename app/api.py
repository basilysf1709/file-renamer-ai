from fastapi import FastAPI, UploadFile, File, Body, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
import boto3, uuid, json, time, asyncio
from typing import Optional, List
from concurrent.futures import ThreadPoolExecutor
from botocore.config import Config
from settings import settings
from inference import get_vlm
from websocket_manager import ws_manager, send_job_update
import io

# Optimized AWS configuration with connection pooling
aws_config = Config(
    retries={'max_attempts': 3},
    max_pool_connections=50,
    tcp_keepalive=True
)

# Global AWS clients with optimized configuration
sqs = boto3.client("sqs", region_name=settings.aws_region, config=aws_config)
s3 = boto3.client("s3", region_name=settings.aws_region, config=aws_config)

# Global VLM instance - load once at startup
vlm_instance = None
upload_executor = ThreadPoolExecutor(max_workers=10)  # For parallel S3 uploads

app = FastAPI(title="Renamer AI API")

@app.on_event("startup")
async def startup_event():
    """Initialize VLM model at startup for optimal performance"""
    global vlm_instance
    import os
    
    # Temporarily disable model loading to fix memory issues
    # TODO: Re-enable once memory optimization is complete
    print("⚠️ VLM model loading temporarily disabled due to memory constraints")
    print("📋 API will start without inference capabilities")
    vlm_instance = None
    return
    
    # Skip model loading in testing/minimal environments
    if os.getenv("SKIP_MODEL_LOAD", "").lower() in ("true", "1"):
        print("⚠️ Skipping VLM model loading (SKIP_MODEL_LOAD=true)")
        vlm_instance = None
        return
        
    print("🤖 Loading VLM model at startup...")
    try:
        vlm_instance = get_vlm()
        print("✅ VLM model loaded successfully - API ready!")
    except Exception as e:
        print(f"❌ Failed to load VLM model: {e}")
        print("⚠️ API starting without VLM model - inference will fail")
        vlm_instance = None

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup resources on shutdown"""
    upload_executor.shutdown(wait=True)
    print("🛑 API shutdown complete")

def upload_single_file(file_content: bytes, filename: str, job_id: str, index: int) -> str:
    """Upload a single file to S3 (synchronous for thread pool)"""
    file_key = f"demo/{job_id}/{index:03d}_{filename}"
    s3.put_object(
        Bucket=settings.s3_in_bucket,
        Key=file_key,
        Body=file_content,
        ContentType="image/*"
    )
    return file_key

async def upload_files_parallel(files: List[UploadFile], job_id: str) -> List[str]:
    """Upload multiple files to S3 in parallel"""
    print(f"📤 Uploading {len(files)} files in parallel...")
    
    # Read all files first (async)
    file_data = []
    for i, file in enumerate(files):
        content = await file.read()
        file_data.append((content, file.filename, i))
    
    # Upload in parallel using thread pool
    tasks = []
    for content, filename, index in file_data:
        task = asyncio.get_event_loop().run_in_executor(
            upload_executor,
            upload_single_file,
            content, filename, job_id, index
        )
        tasks.append(task)
    
    file_keys = await asyncio.gather(*tasks)
    print(f"✅ All {len(files)} files uploaded successfully")
    return file_keys

@app.get("/health")
async def health():
    """Health check with VLM status"""
    vlm_ready = vlm_instance is not None
    return {
        "status": "ok", 
        "timestamp": time.time(),
        "vlm_ready": vlm_ready,
        "model_loaded": vlm_ready
    }

@app.post("/v1/preview")
async def preview_rename(file: UploadFile = File(...), prompt: str = Body("", embed=True)):
    """Fast preview endpoint with pre-loaded model"""
    try:
        # Check if model is ready
        if vlm_instance is None:
            raise HTTPException(status_code=503, detail="Model not ready yet, please wait")
        
        # Read file
        image_bytes = await file.read()
        
        # Process with pre-loaded model (much faster!)
        start_time = time.time()
        suggested_name = vlm_instance.predict_single(image_bytes, prompt)
        processing_time = time.time() - start_time
        
        return {
            "original": file.filename,
            "suggested": suggested_name,
            "processing_time_ms": int(processing_time * 1000)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Preview failed: {str(e)}")

@app.post("/v1/jobs/rename")
async def create_job(user_prompt: str = Body("", embed=True), files: list[UploadFile] = File(default=[])):
    """Create rename job with parallel S3 uploads"""
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")
    
    job_id = f"jr_{uuid.uuid4().hex[:8]}"
    
    try:
        # Upload files in parallel (much faster for multiple files)
        start_time = time.time()
        file_keys = await upload_files_parallel(files, job_id)
        upload_time = time.time() - start_time
        
        print(f"⚡ Parallel upload completed in {upload_time:.2f}s for {len(files)} files")
        
        # Create job message for SQS
        job_message = {
            "job_id": job_id,
            "file_keys": file_keys,
            "user_prompt": user_prompt,
            "total_files": len(files)
        }
        
        # Send to SQS queue
        sqs.send_message(
            QueueUrl=settings.sqs_queue_url,
            MessageBody=json.dumps(job_message)
        )
        
        # Send initial WebSocket update
        await send_job_update(job_id, "job_started", {
            "total_files": len(files),
            "completed": 0,
            "status": "queued",
            "upload_time_ms": int(upload_time * 1000)
        })
        
        return {
            "job_id": job_id,
            "status": "queued",
            "file_count": len(files),
            "upload_time_ms": int(upload_time * 1000)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Job creation failed: {str(e)}")

@app.websocket("/ws/jobs/{job_id}")
async def websocket_endpoint(websocket: WebSocket, job_id: str):
    await ws_manager.connect(websocket, job_id)
    try:
        # Send job history to newly connected client
        history = await ws_manager.get_job_history(job_id)
        if history:
            await websocket.send_text(json.dumps({
                "type": "history",
                "updates": history
            }))
        
        # Keep connection alive
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, job_id)

@app.get("/v1/jobs/{job_id}/progress")
async def get_job_progress(job_id: str):
    """Polling fallback for clients without WebSocket support"""
    history = await ws_manager.get_job_history(job_id, limit=10)
    
    # Calculate current progress from history
    completed = 0
    total = 0
    latest_results = []
    
    for update in history:
        if update.get("type") == "job_started":
            total = update.get("total_files", 0)
        elif update.get("type") == "item_complete":
            completed += 1
            latest_results.append(update.get("result", {}))
    
    return {
        "job_id": job_id,
        "completed": completed,
        "total": total,
        "latest_results": latest_results[-5:],  # Last 5 results
        "progress_percent": (completed / total * 100) if total > 0 else 0
    }

@app.get("/v1/jobs/{job_id}/results")
async def get_job_results(job_id: str):
    """Get job results with streaming for large datasets"""
    try:
        # Check if results exist in S3
        response = s3.get_object(
            Bucket=settings.s3_out_bucket,
            Key=f"demo/jobs/{job_id}/manifest.jsonl"
        )
        
        # Get content length for small files
        content_length = response.get('ContentLength', 0)
        
        # For small files (< 1MB), return directly
        if content_length < 1024 * 1024:  # 1MB threshold
            manifest_content = response['Body'].read().decode('utf-8')
            results = []
            for line in manifest_content.strip().split('\n'):
                if line:
                    results.append(json.loads(line))
            
            return {
                "job_id": job_id,
                "status": "completed",
                "results": results,
                "total_results": len(results)
            }
        else:
            # For large files, use streaming response
            return StreamingResponse(
                stream_job_results(job_id, response['Body']),
                media_type="application/json",
                headers={
                    "X-Job-ID": job_id,
                    "X-Content-Type": "streaming"
                }
            )
            
    except s3.exceptions.NoSuchKey:
        return {
            "job_id": job_id,
            "status": "processing",
            "results": []
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get results: {str(e)}")

async def stream_job_results(job_id: str, s3_body):
    """Stream large job results to avoid memory issues"""
    try:
        # Start JSON response
        yield '{"job_id": "' + job_id + '", "status": "completed", "results": ['
        
        first_item = True
        buffer = ""
        
        # Stream and parse line by line
        for chunk in s3_body.iter_chunks(chunk_size=8192):
            buffer += chunk.decode('utf-8')
            
            # Process complete lines
            while '\n' in buffer:
                line, buffer = buffer.split('\n', 1)
                if line.strip():
                    if not first_item:
                        yield ','
                    yield line.strip()
                    first_item = False
        
        # Process remaining buffer
        if buffer.strip():
            if not first_item:
                yield ','
            yield buffer.strip()
        
        # Close JSON
        yield ']}'
        
    except Exception as e:
        # Stream error response
        yield f'{{"error": "Streaming failed: {str(e)}"}}'

@app.get("/v1/jobs/{job_id}/results/stream")
async def stream_job_results_endpoint(job_id: str):
    """Explicit streaming endpoint for large job results"""
    try:
        response = s3.get_object(
            Bucket=settings.s3_out_bucket,
            Key=f"demo/jobs/{job_id}/manifest.jsonl"
        )
        
        return StreamingResponse(
            stream_job_results(job_id, response['Body']),
            media_type="application/json",
            headers={
                "X-Job-ID": job_id,
                "X-Streaming": "true"
            }
        )
        
    except s3.exceptions.NoSuchKey:
        raise HTTPException(status_code=404, detail="Job results not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Streaming failed: {str(e)}")
