#!/usr/bin/env python3
"""
Simple test script for the Renamer AI API
Usage: python test_api.py <api_url> [image_files...]
"""

import sys
import requests
import time
from pathlib import Path


def test_health(api_url):
    """Test the health endpoint"""
    print(f"Testing health endpoint: {api_url}/health")
    try:
        response = requests.get(f"{api_url}/health", timeout=10)
        if response.status_code == 200:
            print("✅ Health check passed")
            return True
        else:
            print(f"❌ Health check failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Health check error: {e}")
        return False


def submit_rename_job(api_url, image_paths, user_prompt=""):
    """Submit a rename job with image files"""
    print(f"\nSubmitting rename job to: {api_url}/v1/jobs/rename")
    print(f"Images: {[str(p) for p in image_paths]}")
    print(f"Prompt: '{user_prompt}'")
    
    files = []
    try:
        # Prepare files for upload
        for img_path in image_paths:
            if not img_path.exists():
                print(f"❌ Image not found: {img_path}")
                return None
            files.append(('files', (img_path.name, open(img_path, 'rb'), 'image/jpeg')))
        
        # Submit job
        data = {'user_prompt': user_prompt}
        response = requests.post(
            f"{api_url}/v1/jobs/rename", 
            files=files, 
            data=data,
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Job submitted successfully")
            print(f"   Job ID: {result['job_id']}")
            print(f"   Status: {result['status']}")
            print(f"   File count: {result['count']}")
            return result['job_id']
        else:
            print(f"❌ Job submission failed: {response.status_code}")
            print(f"   Response: {response.text}")
            return None
            
    except Exception as e:
        print(f"❌ Job submission error: {e}")
        return None
    finally:
        # Close file handles
        for _, (_, file_obj, _) in files:
            file_obj.close()


def main():
    if len(sys.argv) < 2:
        print("Usage: python test_api.py <api_url> [image_files...]")
        print("Example: python test_api.py http://3.238.123.45 photo1.jpg photo2.jpg")
        sys.exit(1)
    
    api_url = sys.argv[1].rstrip('/')
    image_files = [Path(f) for f in sys.argv[2:]]
    
    print(f"🚀 Testing Renamer AI API at: {api_url}")
    
    # Test health endpoint
    if not test_health(api_url):
        print("\n❌ API not responding, check if services are running")
        sys.exit(1)
    
    # Test rename job submission if images provided
    if image_files:
        user_prompt = "include date and primary subject in kebab-case"
        job_id = submit_rename_job(api_url, image_files, user_prompt)
        
        if job_id:
            print(f"\n📝 Job {job_id} submitted successfully!")
            print("💡 To check results:")
            print(f"   1. Check SQS queue for processing")
            print(f"   2. Look in S3 output bucket under: demo/jobs/{job_id}/")
            print(f"   3. Download manifest.jsonl for rename mapping")
    else:
        print("\n💡 No image files provided, only tested health endpoint")
        print("   To test with images: python test_api.py <api_url> image1.jpg image2.jpg")


if __name__ == "__main__":
    main() 