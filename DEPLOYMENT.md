# 🚀 Renamer AI - Deployment Guide

## ⚡ Zero-Downtime Deployments

Your infrastructure is configured for **zero-downtime deployments** using AWS Auto Scaling Group rolling updates.

### 🔄 How It Works

- **2 Instances**: Always runs 2 instances for redundancy
- **Rolling Updates**: During deployments, keeps 50% capacity (1 instance) healthy
- **ALB Health Checks**: Only routes traffic to healthy instances
- **No Downtime**: API remains available throughout deployments

### 🚀 Deploy Changes

**Quick Deploy:**
```bash
./deploy.sh
```

**Manual Deploy:**
```bash
cd terraform
terraform apply -var="github_token=YOUR_TOKEN"
```

**Code-Only Deploy:**
```bash
# For application code changes without infrastructure changes
aws autoscaling start-instance-refresh --auto-scaling-group-name renamer-ai-b6b712e4-asg
```

### 📊 Deployment Process

1. **Pre-Check**: Verifies current API health
2. **Rolling Update**: Launches new instance while keeping old one
3. **Health Check**: Waits 5 minutes for new instance to be healthy
4. **Traffic Switch**: ALB routes traffic to new instance
5. **Cleanup**: Terminates old instance
6. **Repeat**: Process repeats for second instance

**Timeline:**
- Total Time: ~10-15 minutes
- Downtime: **0 seconds** ✅
- Capacity During Deploy: 50% minimum

---

# 📖 Detailed Deployment Documentation

## 🎯 Quick Start

This guide provides a **repeatable process** for deploying the Renamer AI backend to AWS.

### Prerequisites

- AWS CLI configured with appropriate credentials
- Terraform installed
- GitHub Personal Access Token (for private repository access)

## 🏗️ Initial Infrastructure Deployment

### Step 1: Repository Setup

```bash
git clone https://github.com/basilysf1709/renamer-drive.git
cd renamer-drive
```

### Step 2: Deploy Infrastructure

```bash
cd terraform
terraform init
terraform apply -var="github_token=YOUR_GITHUB_TOKEN"
```

### Step 3: Monitor Deployment

```bash
cd ..
./monitor_init.sh
```

## 🔄 Application Updates

For code changes without infrastructure modifications:

```bash
./deploy.sh
```

For infrastructure changes:

```bash
cd terraform
terraform apply -var="github_token=YOUR_GITHUB_TOKEN"
./deploy.sh  # If instance refresh needed
```

## 🎮 API Usage

### Stable Endpoint

Your API is available at: `http://renamer-ai-b6b712e4-alb-1893620514.us-east-1.elb.amazonaws.com`

### Test the API

```bash
# Health check
curl http://renamer-ai-b6b712e4-alb-1893620514.us-east-1.elb.amazonaws.com/health

# Test job submission
python3 test_api.py http://renamer-ai-b6b712e4-alb-1893620514.us-east-1.elb.amazonaws.com
```

## 🔍 Monitoring & Troubleshooting

### Check Deployment Status

```bash
aws autoscaling describe-instance-refreshes --auto-scaling-group-name renamer-ai-b6b712e4-asg
```

### Check ALB Target Health

```bash
aws elbv2 describe-target-health --target-group-arn arn:aws:elasticloadbalancing:us-east-1:555873675910:targetgroup/renamer-ai-b6b712e4-api-tg/fc79c5d90e625cf3
```

### View Instance Logs

```bash
aws ec2 get-console-output --instance-id INSTANCE_ID
```

### SSH to Instance (for debugging)

```bash
aws ec2 describe-instances --filters "Name=tag:Name,Values=renamer-ai-b6b712e4" "Name=instance-state-name,Values=running"
# Note: No key pair configured - use AWS Session Manager for access
```

## 🛡️ Security Considerations

### Production Hardening

1. **Restrict Access**: Update `ingress_cidr` in variables.tf from `0.0.0.0/0` to your IP range
2. **Enable HTTPS**: Add SSL certificate to ALB
3. **VPC Isolation**: Move to private subnets with NAT Gateway
4. **Secrets Rotation**: Rotate GitHub token regularly
5. **Monitoring**: Set up CloudWatch alarms

### Network Security

```terraform
variable "ingress_cidr" {
  type    = string
  default = "YOUR_IP_RANGE/32"  # Restrict to your IP
}
```

## 📊 Cost Management

### Current Resources

- **EC2 Instances**: 2x t3.medium (~$60/month)
- **Application Load Balancer**: ~$18/month
- **S3 Storage**: Pay per use
- **SQS**: Pay per message
- **Total Estimated**: ~$80/month

### Cost Optimization

1. **GPU Instances**: Switch to g4dn.xlarge after GPU quota approval
2. **Spot Instances**: Use for non-production workloads
3. **Reserved Instances**: For predictable workloads
4. **Auto Scaling**: Scale down during low usage

## 🚨 Disaster Recovery

### Backup Strategy

- **Infrastructure**: All code in Git
- **Data**: S3 automatically versioned
- **Configuration**: Terraform state in backend

### Recovery Process

1. **Clone Repository**: `git clone https://github.com/basilysf1709/renamer-drive.git`
2. **Deploy Infrastructure**: `terraform apply`
3. **Verify Services**: `./monitor_init.sh`

### Rolling Back

```bash
# Rollback to previous launch template
aws autoscaling start-instance-refresh --auto-scaling-group-name renamer-ai-b6b712e4-asg
```

## 📞 Support

### Common Issues

1. **502 Bad Gateway**: Instances not healthy - check logs
2. **Refresh Failed**: Check AWS service quotas
3. **Token Issues**: Verify GitHub token permissions

### Getting Help

- Check AWS Console for detailed error messages
- Review CloudWatch logs for application errors
- Use AWS Support for infrastructure issues

---

## 🎉 Summary

You now have a **production-ready, zero-downtime deployment** system:

✅ Stable API endpoint (never changes)  
✅ Rolling deployments (no downtime)  
✅ Auto-scaling and load balancing  
✅ Secure private repository access  
✅ Infrastructure as Code  
✅ Monitoring and health checks  

Your API URL: `http://renamer-ai-b6b712e4-alb-1893620514.us-east-1.elb.amazonaws.com` 