#!/bin/bash

# Renamer AI Deployment Monitor
export PATH="/Users/iqbalyusuf/Library/Python/3.9/bin:$PATH"

echo "🔍 RENAMER AI DEPLOYMENT STATUS CHECK"
echo "======================================"
echo ""

# 1. Instance Status
echo "1️⃣  INSTANCE STATUS:"
echo "-------------------"
INSTANCE_ID=$(aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names renamer-ai-b6b712e4-asg --query 'AutoScalingGroups[0].Instances[0].InstanceId' --output text)

if [ "$INSTANCE_ID" != "None" ] && [ "$INSTANCE_ID" != "" ]; then
    echo "✅ Instance ID: $INSTANCE_ID"
    
    # Instance state
    INSTANCE_STATE=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID --query 'Reservations[0].Instances[0].State.Name' --output text)
    echo "   State: $INSTANCE_STATE"
    
    # Instance health
    INSTANCE_HEALTH=$(aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names renamer-ai-b6b712e4-asg --query 'AutoScalingGroups[0].Instances[0].HealthStatus' --output text)
    echo "   ASG Health: $INSTANCE_HEALTH"
    
    # Launch time
    LAUNCH_TIME=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID --query 'Reservations[0].Instances[0].LaunchTime' --output text)
    echo "   Launched: $LAUNCH_TIME"
    
    # Uptime calculation
    if command -v python3 &> /dev/null; then
        UPTIME=$(python3 -c "
from datetime import datetime
import sys
try:
    launch = datetime.fromisoformat('$LAUNCH_TIME'.replace('Z', '+00:00'))
    now = datetime.now(launch.tzinfo)
    uptime = now - launch
    minutes = int(uptime.total_seconds() / 60)
    print(f'{minutes} minutes')
except:
    print('unknown')
")
        echo "   Uptime: $UPTIME"
    fi
else
    echo "❌ No instances running"
fi

echo ""

# 2. ALB Target Health
echo "2️⃣  LOAD BALANCER HEALTH:"
echo "------------------------"
ALB_HEALTH=$(aws elbv2 describe-target-health --target-group-arn arn:aws:elasticloadbalancing:us-east-1:555873675910:targetgroup/renamer-ai-b6b712e4-api-tg/fc79c5d90e625cf3 --query 'TargetHealthDescriptions[0].TargetHealth.State' --output text 2>/dev/null)

if [ "$ALB_HEALTH" = "healthy" ]; then
    echo "✅ ALB Target: HEALTHY"
elif [ "$ALB_HEALTH" = "unhealthy" ]; then
    echo "❌ ALB Target: UNHEALTHY"
    HEALTH_REASON=$(aws elbv2 describe-target-health --target-group-arn arn:aws:elasticloadbalancing:us-east-1:555873675910:targetgroup/renamer-ai-b6b712e4-api-tg/fc79c5d90e625cf3 --query 'TargetHealthDescriptions[0].TargetHealth.Reason' --output text 2>/dev/null)
    echo "   Reason: $HEALTH_REASON"
else
    echo "⚠️  ALB Target: No targets registered"
fi

echo ""

# 3. API Health Check
echo "3️⃣  API HEALTH CHECK:"
echo "--------------------"
API_URL="http://renamer-ai-b6b712e4-alb-1893620514.us-east-1.elb.amazonaws.com"

# Test via ALB
ALB_STATUS=$(curl -s -w "%{http_code}" -m 10 "$API_URL/health" -o /dev/null 2>/dev/null || echo "000")
if [ "$ALB_STATUS" = "200" ]; then
    echo "✅ ALB Health: RESPONDING (200)"
    RESPONSE=$(curl -s -m 5 "$API_URL/health" 2>/dev/null)
    echo "   Response: $RESPONSE"
elif [ "$ALB_STATUS" = "502" ]; then
    echo "❌ ALB Health: BAD GATEWAY (502) - App not ready"
else
    echo "❌ ALB Health: ERROR ($ALB_STATUS)"
fi

# Test direct instance if available
if [ "$INSTANCE_ID" != "None" ] && [ "$INSTANCE_ID" != "" ]; then
    INSTANCE_IP=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)
    if [ "$INSTANCE_IP" != "None" ]; then
        echo "   Instance IP: $INSTANCE_IP"
        DIRECT_STATUS=$(curl -s -w "%{http_code}" -m 10 "http://$INSTANCE_IP/health" -o /dev/null 2>/dev/null || echo "000")
        if [ "$DIRECT_STATUS" = "200" ]; then
            echo "✅ Direct Test: RESPONDING (200)"
        else
            echo "❌ Direct Test: ERROR ($DIRECT_STATUS)"
        fi
    fi
fi

echo ""

# 4. Recent Scaling Activities
echo "4️⃣  RECENT SCALING ACTIVITIES:"
echo "-----------------------------"
aws autoscaling describe-scaling-activities --auto-scaling-group-name renamer-ai-b6b712e4-asg --max-items 3 --query 'Activities[*].[StartTime,StatusCode,StatusMessage]' --output table

echo ""

# 5. Quota Status
echo "5️⃣  QUOTA STATUS:"
echo "----------------"
QUOTA_STATUS=$(aws service-quotas get-requested-service-quota-change --request-id 76a0109189434065871bc8588ca94719jtRfRwtm --query 'RequestedQuota.Status' --output text 2>/dev/null || echo "UNKNOWN")
echo "vCPU Quota Request: $QUOTA_STATUS"

echo ""

# 6. Quick Diagnostics
echo "6️⃣  DIAGNOSTICS:"
echo "---------------"

if [ "$INSTANCE_STATE" = "running" ] && [ "$ALB_STATUS" != "200" ]; then
    if [ "$UPTIME" != "" ] && command -v python3 &> /dev/null; then
        UPTIME_MINUTES=$(echo "$UPTIME" | grep -o '[0-9]*')
        if [ "$UPTIME_MINUTES" -lt 15 ]; then
            echo "⏳ LIKELY CAUSE: Model still downloading (need 5-15 min total)"
            echo "   Action: Wait 5-10 more minutes, then retest"
        elif [ "$UPTIME_MINUTES" -lt 30 ]; then
            echo "⚠️  POSSIBLE ISSUE: Startup taking longer than expected"
            echo "   Action: Check if Docker containers are running"
        else
            echo "🚨 PROBLEM: App should be ready by now"
            echo "   Action: Check userdata logs or restart instance"
        fi
    fi
fi

if [ "$ALB_STATUS" = "200" ]; then
    echo "🎉 SUCCESS: API is ready!"
fi

echo ""
echo "======================================"
echo "💡 TIP: Run this script periodically to monitor progress"
echo "   Usage: ./monitor_status.sh" 