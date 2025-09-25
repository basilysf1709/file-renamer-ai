# Quick Deployment Guide

## 🚀 5-Minute Setup

### Prerequisites Check
```bash
# Verify you have these installed
terraform --version  # >= 1.6
docker --version
aws configure list   # AWS credentials configured
```

### 1. Deploy Infrastructure (3 minutes)
```bash
cd terraform
terraform init
terraform apply -auto-approve
```

**Important**: Save the outputs that appear:
- `bucket_in`: Your input S3 bucket
- `bucket_out`: Your output S3 bucket  
- `queue_url`: Your SQS queue URL

### 2. Update Repository URL (30 seconds)
```bash
# Edit terraform/userdata.sh line ~23
# Replace: https://github.com/placeholder/renamer-ai.git
# With: https://github.com/YOUR_USERNAME/YOUR_REPO.git
```

### 3. Commit & Push Code (1 minute)
```bash
cd ..
git add .
git commit -m "Complete backend rewrite with Terraform + GPU worker"
git push origin main
```

### 4. Redeploy with Updated Repo (1 minute)
```bash
cd terraform
terraform apply -auto-approve
```

Your EC2 instance will:
- ✅ Install NVIDIA drivers + Docker
- ✅ Clone your repository  
- ✅ Build containers with GPU support
- ✅ Start API + Worker services

### 5. Test Your API (30 seconds)
```bash
# Get your EC2 public IP from AWS console
python test_api.py http://YOUR_EC2_IP

# Test with images
python test_api.py http://YOUR_EC2_IP image1.jpg image2.jpg
```

## 🔍 Quick Verification

**Health Check:**
```bash
curl http://YOUR_EC2_IP/health
# Should return: {"ok": true}
```

**Submit Test Job:**
```bash
curl -F "files=@test.jpg" \
     -F 'user_prompt=kebab-case with date and subject' \
     -X POST "http://YOUR_EC2_IP/v1/jobs/rename"
```

**Check Results:**
- S3 Console → `YOUR_OUTPUT_BUCKET` → `demo/jobs/jr_XXXXXXXX/`
- Look for: `manifest.jsonl` (rename mapping) + `output/` folder

## 🛠️ Troubleshooting

**API not responding?**
```bash
# SSH to your instance
ssh ubuntu@YOUR_EC2_IP

# Check services
cd /opt/renamer-ai/app
sudo docker compose logs -f
```

**GPU not working?**
```bash
# On EC2 instance
nvidia-smi
sudo docker run --gpus all nvidia/cuda:12.3.2-base-ubuntu22.04 nvidia-smi
```

**SQS not processing?**
```bash
# Check queue depth
aws sqs get-queue-attributes \
    --queue-url "YOUR_QUEUE_URL" \
    --attribute-names ApproximateNumberOfMessages
```

## 💰 Cost Alert

**g4dn.xlarge runs ~$0.65/hour ($450/month)**
- For testing: Stop instance when not needed
- For production: Consider spot instances (-70% cost)

```bash
# Stop instance to save money
aws ec2 describe-instances --filters "Name=tag:Name,Values=renamer-ai-*" --query 'Reservations[].Instances[].InstanceId' --output text | xargs aws ec2 stop-instances --instance-ids
```

## 🎯 What's Next?

1. **Add job status endpoint**: `GET /v1/jobs/{job_id}`
2. **Presigned URLs**: Direct S3 download links
3. **Simple frontend**: React upload interface
4. **Authentication**: JWT or API keys
5. **Production hardening**: VPC, ALB, security groups

---

**🎉 Congratulations!** You now have a production-ready AI-powered image renaming service running on AWS with GPU acceleration! 