# Renamer AI - Production Deployment Guide

## 🏗️ **Repeatable Deployment Process**

This document outlines the production-ready deployment process for the Renamer AI backend.

### **Prerequisites**

1. **AWS Account** with appropriate permissions
2. **Terraform ≥ 1.5** installed
3. **AWS CLI** configured with credentials
4. **Git repository** with application code
5. **Docker** for local testing (optional)

### **Infrastructure Components**

- **Terraform**: Infrastructure as Code
- **GitHub**: Source code repository
- **AWS EC2**: GPU-enabled compute instances (g4dn.xlarge)
- **AWS S3**: Input/output file storage
- **AWS SQS**: Job queue management
- **Docker**: Containerized application deployment

## 🚀 **Deployment Steps**

### **1. Repository Setup**

```bash
# Ensure code is committed and pushed
git add .
git commit -m "Deploy backend updates"
git push origin main
```

### **2. Infrastructure Deployment**

```bash
# Navigate to terraform directory
cd terraform

# Initialize Terraform (first time only)
terraform init

# Review planned changes
terraform plan

# Deploy infrastructure
terraform apply -auto-approve

# Save outputs for reference
terraform output > ../deployment-outputs.txt
```

### **3. Application Deployment**

The application deploys automatically via EC2 user data script:

1. **Instance Boot**: EC2 instances launch with latest AMI
2. **Dependencies**: Docker, NVIDIA drivers, build tools installed
3. **Repository Clone**: Latest code pulled from GitHub
4. **Container Build**: Docker images built with GPU support
5. **Service Start**: API and worker services start automatically

### **4. Deployment Verification**

```bash
# Get instance IP
INSTANCE_IP=$(terraform output -raw public_ip || aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=renamer-ai-*" "Name=instance-state-name,Values=running" \
  --query 'Reservations[].Instances[].PublicIpAddress' --output text)

# Test health endpoint
curl http://$INSTANCE_IP/health

# Test rename job
curl -F "files=@test-image.jpg" \
     -F 'user_prompt=semantic filename with date' \
     -X POST "http://$INSTANCE_IP/v1/jobs/rename"
```

## 🔄 **Update Process**

### **Code Updates**

```bash
# 1. Make changes to application code
git add .
git commit -m "Update: feature description"
git push origin main

# 2. Trigger instance refresh (deploys latest code)
aws autoscaling start-instance-refresh \
  --auto-scaling-group-name $(terraform output -raw asg_name)

# 3. Monitor deployment
aws autoscaling describe-instance-refreshes \
  --auto-scaling-group-name $(terraform output -raw asg_name)
```

### **Infrastructure Updates**

```bash
# 1. Update Terraform configuration files
# 2. Review changes
terraform plan

# 3. Apply updates
terraform apply

# 4. If launch template changed, refresh instances
aws autoscaling start-instance-refresh \
  --auto-scaling-group-name $(terraform output -raw asg_name)
```

## 📊 **Monitoring & Operations**

### **Key Metrics**

- **Instance Health**: Check via AWS Console or CLI
- **Application Logs**: View via EC2 console logs or SSH
- **SQS Queue**: Monitor message depth and processing rate
- **S3 Storage**: Track input/output file volumes

### **Troubleshooting**

```bash
# Check instance status
aws ec2 describe-instance-status \
  --instance-ids $(aws ec2 describe-instances \
    --filters "Name=tag:Name,Values=renamer-ai-*" \
    --query 'Reservations[].Instances[].InstanceId' --output text)

# View system logs
aws ec2 get-console-output \
  --instance-id INSTANCE_ID --output text

# Check SQS queue depth
aws sqs get-queue-attributes \
  --queue-url $(terraform output -raw queue_url) \
  --attribute-names ApproximateNumberOfMessages
```

### **Scaling Operations**

```bash
# Scale up during high load
aws autoscaling update-auto-scaling-group \
  --auto-scaling-group-name $(terraform output -raw asg_name) \
  --desired-capacity 2

# Scale down during low load
aws autoscaling update-auto-scaling-group \
  --auto-scaling-group-name $(terraform output -raw asg_name) \
  --desired-capacity 1
```

## 🔒 **Security Considerations**

### **Current Setup (Development)**
- Open HTTP access (0.0.0.0/0)
- No API authentication
- Public EC2 instances

### **Production Hardening Checklist**

- [ ] **Restrict network access** - Update security groups
- [ ] **Add API authentication** - Implement JWT or API keys  
- [ ] **Use HTTPS** - Add ALB with SSL certificates
- [ ] **Private networking** - Deploy in private subnets
- [ ] **Secrets management** - Use AWS Secrets Manager
- [ ] **Monitoring** - Add CloudWatch alarms
- [ ] **Backup strategy** - Implement S3 lifecycle policies

## 💰 **Cost Management**

### **Current Costs (Estimated)**
- **g4dn.xlarge**: ~$0.65/hour (~$450/month on-demand)
- **g4dn.xlarge Spot**: ~$0.20/hour (~$135/month, 70% savings)
- **S3 Storage**: ~$0.02/GB/month
- **SQS Requests**: ~$0.40/million requests

### **Cost Optimization**
```bash
# Use Spot Instances (modify launch template)
# Add lifecycle policies for S3 cleanup
# Implement auto-scaling based on queue depth
```

## 🆘 **Disaster Recovery**

### **Backup Strategy**
- **Infrastructure**: Terraform state in S3 backend (recommended)
- **Application**: Code in Git repository
- **Data**: S3 cross-region replication (if needed)

### **Recovery Process**
```bash
# Complete infrastructure recreation
terraform destroy  # if needed
terraform apply

# Application automatically deploys from Git
# Data persists in S3 buckets
```

## 📝 **Environment Management**

### **Development Environment**
```bash
# Use smaller instance types for testing
# Set terraform variables for dev configuration
terraform apply -var="instance_type=t3.medium"
```

### **Production Environment**
```bash
# Use production configuration
terraform apply -var="instance_type=g4dn.xlarge"
```

---

**✅ This deployment process ensures:**
- **Repeatability**: Infrastructure as Code with Terraform
- **Reliability**: Auto Scaling Groups with health checks
- **Scalability**: Horizontal scaling capabilities
- **Maintainability**: Clear documentation and monitoring
- **Security**: Proper IAM roles and network controls 