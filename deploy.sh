#!/bin/bash

# Zero-Downtime Deployment Script for Renamer AI
set -euo pipefail

echo "🚀 Starting Zero-Downtime Deployment..."
echo "=================================="

# Make AWS CLI available
export PATH="/Users/iqbalyusuf/Library/Python/3.9/bin:$PATH"

# Configuration
ASG_NAME="renamer-ai-b6b712e4-asg"
ALB_URL="http://renamer-ai-b6b712e4-alb-1893620514.us-east-1.elb.amazonaws.com"

# Function to check API health
check_api_health() {
    local http_code=$(curl -s -w "%{http_code}" -m 5 "$ALB_URL/health" -o /dev/null 2>/dev/null || echo "000")
    echo "$http_code"
}

# Function to get healthy target count
get_healthy_targets() {
    aws elbv2 describe-target-health \
        --target-group-arn arn:aws:elasticloadbalancing:us-east-1:555873675910:targetgroup/renamer-ai-b6b712e4-api-tg/fc79c5d90e625cf3 \
        --query 'TargetHealthDescriptions[?TargetHealth.State==`healthy`] | length(@)' \
        --output text
}

echo "📋 Pre-deployment Health Check..."
INITIAL_HEALTH=$(check_api_health)
INITIAL_TARGETS=$(get_healthy_targets)

echo "   API Status: HTTP $INITIAL_HEALTH"
echo "   Healthy Targets: $INITIAL_TARGETS"

if [ "$INITIAL_HEALTH" != "200" ]; then
    echo "⚠️  API is not healthy before deployment. Proceeding anyway..."
fi

echo ""
echo "🔄 Triggering Rolling Instance Refresh..."

# Start instance refresh
REFRESH_ID=$(aws autoscaling start-instance-refresh \
    --auto-scaling-group-name "$ASG_NAME" \
    --preferences '{
        "MinHealthyPercentage": 50,
        "InstanceWarmup": 300,
        "SkipMatching": false
    }' \
    --query 'InstanceRefreshId' \
    --output text)

echo "   Instance Refresh ID: $REFRESH_ID"
echo ""

echo "⏳ Monitoring Deployment Progress..."
echo "   This will maintain 50% capacity during the rollout"
echo ""

# Monitor the refresh
start_time=$(date +%s)
while true; do
    # Get refresh status
    REFRESH_STATUS=$(aws autoscaling describe-instance-refreshes \
        --auto-scaling-group-name "$ASG_NAME" \
        --instance-refresh-ids "$REFRESH_ID" \
        --query 'InstanceRefreshes[0].Status' \
        --output text)
    
    PERCENTAGE=$(aws autoscaling describe-instance-refreshes \
        --auto-scaling-group-name "$ASG_NAME" \
        --instance-refresh-ids "$REFRESH_ID" \
        --query 'InstanceRefreshes[0].PercentageComplete' \
        --output text)
    
    # Check current health
    CURRENT_HEALTH=$(check_api_health)
    CURRENT_TARGETS=$(get_healthy_targets)
    
    elapsed=$(($(date +%s) - start_time))
    
    printf "\r   Progress: %s%% | Status: %s | API: HTTP %s | Healthy: %s | Time: %ds" \
        "$PERCENTAGE" "$REFRESH_STATUS" "$CURRENT_HEALTH" "$CURRENT_TARGETS" "$elapsed"
    
    if [ "$REFRESH_STATUS" = "Successful" ]; then
        echo ""
        echo ""
        echo "✅ Deployment Successful!"
        break
    elif [ "$REFRESH_STATUS" = "Failed" ] || [ "$REFRESH_STATUS" = "Cancelled" ]; then
        echo ""
        echo ""
        echo "❌ Deployment Failed: $REFRESH_STATUS"
        exit 1
    fi
    
    sleep 10
done

echo ""
echo "🎉 Zero-Downtime Deployment Complete!"
echo "=================================="
echo "   API URL: $ALB_URL"
echo "   Final Health: HTTP $(check_api_health)"
echo "   Healthy Targets: $(get_healthy_targets)"
echo "   Total Time: ${elapsed}s"
echo ""
echo "🧪 Test your API:"
echo "   curl $ALB_URL/health" 