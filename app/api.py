from fastapi import FastAPI, UploadFile, File, Body, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import JSONResponse
import boto3, uuid, json, time
from typing import Optional, List
from settings import settings
from inference import get_vlm
from websocket_manager import ws_manager, send_job_update

app = FastAPI(title="Renamer AI API")
sqs = boto3.client("sqs", region_name=settings.aws_region)
s3 = boto3.client("s3", region_name=settings.aws_region)

@app.get("/health")
async def health():
    return {"status": "ok", "timestamp": time.time()}

@app.post("/v1/preview")
async def preview_rename(file: UploadFile = File(...), prompt: str = Body("", embed=True)):
    """Fast preview endpoint for instant feedback"""
    try:
        # Read file
        image_bytes = await file.read()
        
        # Get VLM and process single image (optimized path)
        vlm = get_vlm()
        suggested_name = vlm.predict_single(image_bytes, prompt)
        
        return {
            "original": file.filename,
            "suggested": suggested_name,
            "processing_time": "preview"
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Preview failed: {str(e)}")

@app.post("/v1/jobs/rename")
async def create_job(user_prompt: str = Body("", embed=True), files: list[UploadFile] = File(default=[])):
    job_id = f"jr_{uuid.uuid4().hex[:8]}"
    
    # Upload files to S3 input bucket
    file_keys = []
    for i, file in enumerate(files):
        file_key = f"demo/{job_id}/{i:03d}_{file.filename}"
        s3.put_object(
            Bucket=settings.s3_in_bucket,
            Key=file_key,
            Body=await file.read()
        )
        file_keys.append(file_key)
    
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
        "status": "queued"
    })
    
    return {
        "job_id": job_id,
        "status": "queued",
        "file_count": len(files)
    }

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
    """Get all completed results for a job"""
    try:
        # Check if results exist in S3
        response = s3.get_object(
            Bucket=settings.s3_out_bucket,
            Key=f"demo/jobs/{job_id}/manifest.jsonl"
        )
        
        # Parse manifest
        manifest_content = response['Body'].read().decode('utf-8')
        results = []
        for line in manifest_content.strip().split('\n'):
            if line:
                results.append(json.loads(line))
        
        return {
            "job_id": job_id,
            "status": "completed",
            "results": results
        }
    except s3.exceptions.NoSuchKey:
        return {
            "job_id": job_id,
            "status": "processing",
            "results": []
        }
