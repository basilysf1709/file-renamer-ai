# Renamer AI - Intelligent Image Renaming with VLM

Hi! A production-ready backend that accepts batch rename jobs, queues work on SQS, and runs a GPU worker that generates strict, semantic filenames from images using Qwen2-VL-2B vision language model.

https://github.com/user-attachments/assets/6a73923e-7268-4df4-a467-0ab01995fc47

## Architecture Overview

- **Terraform**: Provisions AWS infrastructure (EC2 with GPU, S3 buckets, SQS queues)
- **FastAPI**: REST API for job submission
- **SQS Worker**: Processes rename jobs using vision AI
- **S3 Storage**: Input/output file storage with manifests
- **Docker**: Containerized deployment <img width="1159" height="497" alt="Screenshot 1447-04-06 at 8 47 44 PM" src="https://github.com/user-attachments/assets/1c50246b-75f6-46e0-b8fb-887da44f3050" />
with GPU support

## Prerequisites

- AWS account with default VPC configured
- Terraform ≥ 1.6
- Docker & Docker Compose
- Python 3.10+
- AWS CLI configured with appropriate permissions

## Quick Start

### 1. Clone and Setup

```bash
git clone <your-repo-url>
cd renamer-ai
```

### 2. Deploy Infrastructure

```bash
cd terraform
terraform init
terraform apply -auto-approve
```

Save the outputs:
- `bucket_in`: Input S3 bucket name
- `bucket_out`: Output S3 bucket name  
- `queue_url`: SQS queue URL

### 3. Update Repository URL

Edit `terraform/userdata.sh` and replace the placeholder GitHub URL with your actual repository URL:

```bash
# Line ~23 in userdata.sh
git clone https://github.com/YOUR_USERNAME/renamer-ai.git
```

### 4. Deploy Updated Infrastructure

```bash
terraform apply -auto-approve
```

This will launch a GPU-enabled EC2 instance that automatically:
- Installs NVIDIA drivers and Docker
- Clones your repository
- Builds and starts the application containers

### 5. Test the API

Find your EC2 public IP in the AWS console, then:

```bash
# Health check
curl http://<EC2_PUBLIC_IP>/health

# Submit a rename job
curl -F "files=@/path/to/image1.jpg" \
     -F "files=@/path/to/image2.jpg" \
     -F 'user_prompt=include date and primary subject in kebab-case' \
     -X POST "http://<EC2_PUBLIC_IP>/v1/jobs/rename"
```

### 6. Check Results

Results will be available in the output S3 bucket under:
- `demo/jobs/{job_id}/output/` - Renamed image files
- `demo/jobs/{job_id}/manifest.jsonl` - Rename mapping

## Project Structure

```
renamer-ai/
├── terraform/
│   ├── main.tf              # AWS infrastructure definition
│   ├── variables.tf         # Configurable parameters
│   ├── outputs.tf          # Resource outputs
│   └── userdata.sh         # EC2 startup script
├── app/
│   ├── api.py              # FastAPI application
│   ├── worker.py           # SQS job processor
│   ├── inference.py        # VLM inference logic
│   ├── naming.py           # Filename processing
│   ├── settings.py         # Configuration management
│   ├── requirements.txt    # Python dependencies
│   ├── Dockerfile.api      # API container
│   ├── Dockerfile.worker   # Worker container
│   └── docker-compose.yml  # Service orchestration
└── README.md
```

## Configuration

Environment variables (set automatically by Terraform):

```bash
AWS_REGION=us-east-1
S3_IN_BUCKET=renamer-ai-xxxxx-input
S3_OUT_BUCKET=renamer-ai-xxxxx-output
SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/xxx/renamer-ai-xxxxx-jobs
MODEL_ID=Qwen/Qwen2-VL-2B-Instruct
MAX_PIXELS=786432    # ~0.75MP image size limit
MAX_NEW_TOKENS=15    # Max filename length from VLM
BATCH_SIZE=12        # Images processed per batch
API_PORT=80
```

## API Endpoints

### POST /v1/jobs/rename

Submit images for AI-powered renaming.

**Request:**
```bash
curl -F "files=@image1.jpg" \
     -F "files=@image2.jpg" \
     -F 'user_prompt=include date and subject' \
     -X POST "http://api-url/v1/jobs/rename"
```

**Response:**
```json
{
  "job_id": "jr_a1b2c3d4",
  "status": "queued",
  "count": 2
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{"ok": true}
```

## Filename Generation

The VLM generates semantic filenames following strict rules:

- **Format**: kebab-case (lowercase with hyphens)
- **Length**: ≤60 characters, ≤10 words
- **Content**: ASCII only, no punctuation except `-`
- **Safety**: Blocked inappropriate words
- **Uniqueness**: Auto-deduplication with `-001` suffixes

**System Prompt:**
```
You are an image filename generator. Return ONLY a safe filename in kebab-case. 
ASCII only, <=10 words, <=60 characters. No punctuation except '-'.
```

## Infrastructure Details

### Terraform Resources

- **EC2 Auto Scaling Group**: GPU instances (g4dn.xlarge with T4)
- **S3 Buckets**: Separate input/output with proper access controls
- **SQS Queue**: Job queue with dead letter queue for failed jobs
- **IAM Roles**: Least-privilege access for EC2 instances
- **Security Groups**: HTTP (80) and SSH (22) access

### Instance Configuration

- **Instance Type**: g4dn.xlarge (4 vCPUs, 16GB RAM, T4 GPU)
- **Storage**: 200GB GP3 EBS volume
- **OS**: Ubuntu 22.04 LTS
- **GPU**: NVIDIA T4 with CUDA 12.3 runtime

## Performance Tuning

### For Higher Throughput

1. **Increase batch size**: Set `BATCH_SIZE=24` for larger GPUs
2. **Scale instances**: Increase `desired_size` in Terraform
3. **Optimize images**: Adjust `MAX_PIXELS` based on accuracy needs

### For Cost Optimization

1. **Use Spot Instances**: Modify launch template for 50-70% savings
2. **Lifecycle Rules**: Auto-delete old files from S3
3. **Right-size GPU**: Consider g4dn.large for lighter workloads

## Monitoring & Debugging

### View Logs

```bash
# SSH to EC2 instance
ssh ubuntu@<EC2_PUBLIC_IP>

# View container logs
cd /opt/renamer-ai/app
sudo docker compose logs -f api
sudo docker compose logs -f worker
```

### Check Queue Status

```bash
aws sqs get-queue-attributes \
    --queue-url "<QUEUE_URL>" \
    --attribute-names ApproximateNumberOfMessages
```

### Monitor S3 Usage

```bash
aws s3 ls s3://<BUCKET_OUT>/demo/jobs/ --recursive --summarize
```

## Security Considerations

### Current Setup (Development)
- Open HTTP access (0.0.0.0/0)
- No authentication on API endpoints
- Public EC2 instance

### Production Hardening

1. **Add Authentication**: Implement JWT or API keys
2. **Restrict Access**: Limit `ingress_cidr` to your IP ranges
3. **Use ALB**: Add Application Load Balancer with HTTPS
4. **VPC Security**: Deploy in private subnets with NAT gateway
5. **Secrets Management**: Use AWS Secrets Manager for sensitive config

## Troubleshooting

### Common Issues

**GPU Not Available**
- Verify NVIDIA drivers: `nvidia-smi`
- Check Docker GPU runtime: `docker run --gpus all nvidia/cuda:12.3.2-base-ubuntu22.04 nvidia-smi`

**Out of Memory**
- Reduce `BATCH_SIZE` or `MAX_PIXELS`
- Monitor GPU memory: `nvidia-smi -l 1`

**SQS Messages Not Processing**
- Check worker logs for errors
- Verify SQS permissions in IAM role
- Ensure queue URL is correct

**S3 Upload Failures**
- Verify bucket names and regions match
- Check IAM permissions for S3 operations
- Monitor CloudWatch logs

## Next Steps

### Fast Wins
1. Add `/v1/jobs/{job_id}` status endpoint
2. Implement presigned URLs for downloads
3. Create simple React dashboard for uploads

### Advanced Features
1. Support for additional file formats (PNG, TIFF, etc.)
2. Batch ZIP export functionality
3. Integration with Google Drive/Dropbox
4. Real-time WebSocket progress updates
5. Advanced prompt templates and customization

## Cost Estimation

**Monthly AWS costs (us-east-1, 1 instance running 24/7):**
- g4dn.xlarge: ~$450/month (On-Demand)
- g4dn.xlarge Spot: ~$135/month (70% savings)
- S3 storage: ~$0.02/GB/month
- SQS requests: ~$0.40/million requests
- Data transfer: $0.09/GB (first 1GB free)

**Spot instances recommended for production workloads.**

## Support

For issues or questions:
1. Check CloudWatch logs for detailed error messages
2. Review instance status in EC2 console
3. Verify all Terraform outputs are correctly set
4. Test with minimal batch sizes first

---

Built with ❤️ using Terraform, FastAPI, and Qwen2-VL
