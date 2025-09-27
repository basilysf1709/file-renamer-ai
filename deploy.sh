#!/bin/bash

# Efficient Container Update Deployment Script for Renamer AI
set -euo pipefail

echo "🚀 Starting Efficient Container Update Deployment..."
echo "=================================================="

# Make AWS CLI available
export PATH="/Users/iqbalyusuf/Library/Python/3.9/bin:$PATH"

# Configuration
ASG_NAME="renamer-ai-b6b712e4-asg"
ALB_URL="http://renamer-ai-b6b712e4-alb-1893620514.us-east-1.elb.amazonaws.com"
KEY_PATH="~/.ssh/renamer-ai-key.pem"

# Function to check API health
check_api_health() {
    local url="${1:-$ALB_URL}"
    local http_code=$(curl -s -w "%{http_code}" -m 5 "$url/health" -o /dev/null 2>/dev/null || echo "000")
    echo "$http_code"
}

# Function to get running instance IPs
get_instance_ips() {
    aws autoscaling describe-auto-scaling-groups \
        --auto-scaling-group-names "$ASG_NAME" \
        --query 'AutoScalingGroups[0].Instances[?LifecycleState==`InService`].InstanceId' \
        --output text | xargs -I {} aws ec2 describe-instances \
        --instance-ids {} \
        --query 'Reservations[].Instances[].PublicIpAddress' \
        --output text
}

# Function to get healthy target count
get_healthy_targets() {
    aws elbv2 describe-target-health \
        --target-group-arn arn:aws:elasticloadbalancing:us-east-1:555873675910:targetgroup/renamer-ai-b6b712e4-api-tg/fc79c5d90e625cf3 \
        --query 'TargetHealthDescriptions[?TargetHealth.State==`healthy`] | length(@)' \
        --output text
}

# Function to update containers on a specific instance
update_instance_containers() {
    local ip="$1"
    local instance_name="$2"
    
    echo "📦 Updating containers on $instance_name ($ip)..."
    
    # Check if we can SSH to the instance
    if ! ssh -i "$KEY_PATH" ubuntu@"$ip" -o ConnectTimeout=10 -o StrictHostKeyChecking=no "echo 'SSH connection test'" >/dev/null 2>&1; then
        echo "   ❌ Cannot SSH to $ip - skipping"
        return 1
    fi
    
    # Execute the container update process
    ssh -i "$KEY_PATH" ubuntu@"$ip" -o StrictHostKeyChecking=no 'bash -s' << 'EOF'
        set -e
        echo "   🔄 Pulling latest code..."
        cd /opt/renamer-drive
        sudo git pull origin main
        
        echo "   🛑 Stopping containers..."
        cd app
        sudo docker-compose down
        
        echo "   🔨 Rebuilding containers..."
        sudo docker-compose build --no-cache
        
        echo "   🚀 Starting containers..."
        sudo docker-compose up -d
        
        echo "   ✅ Container update complete!"
EOF
    
    return $?
}

# Function to wait for instance to be healthy
wait_for_instance_health() {
    local ip="$1"
    local instance_name="$2"
    local max_wait=600  # 10 minutes
    local wait_time=0
    
    echo "   ⏳ Waiting for $instance_name to be healthy..."
    
    while [ $wait_time -lt $max_wait ]; do
        local health=$(check_api_health "http://$ip")
        if [ "$health" = "200" ]; then
            echo "   ✅ $instance_name is healthy (HTTP $health)"
            return 0
        fi
        
        printf "\r   ⏳ Waiting... %ds (HTTP %s)" "$wait_time" "$health"
        sleep 15
        wait_time=$((wait_time + 15))
    done
    
    echo ""
    echo "   ❌ $instance_name did not become healthy after ${max_wait}s"
    return 1
}

echo "📋 Pre-deployment Health Check..."
INITIAL_HEALTH=$(check_api_health)
INITIAL_TARGETS=$(get_healthy_targets)

echo "   API Status: HTTP $INITIAL_HEALTH"
echo "   Healthy Targets: $INITIAL_TARGETS"
echo ""

echo "🔍 Discovering running instances..."
INSTANCE_IPS=($(get_instance_ips))

if [ ${#INSTANCE_IPS[@]} -eq 0 ]; then
    echo "❌ No running instances found in ASG!"
    exit 1
fi

echo "   Found ${#INSTANCE_IPS[@]} instance(s): ${INSTANCE_IPS[*]}"
echo ""

# Update each instance
start_time=$(date +%s)
updated_count=0
failed_count=0

for i in "${!INSTANCE_IPS[@]}"; do
    ip="${INSTANCE_IPS[$i]}"
    instance_name="Instance-$((i+1))"
    
    echo "🔄 Processing $instance_name of ${#INSTANCE_IPS[@]} ($ip)..."
    
    if update_instance_containers "$ip" "$instance_name"; then
        echo "   ✅ Update successful on $instance_name"
        
        # Wait for this instance to be healthy before proceeding
        if wait_for_instance_health "$ip" "$instance_name"; then
            updated_count=$((updated_count + 1))
        else
            echo "   ⚠️  $instance_name updated but not healthy yet"
            failed_count=$((failed_count + 1))
        fi
    else
        echo "   ❌ Update failed on $instance_name"
        failed_count=$((failed_count + 1))
    fi
    
    echo ""
done

# Final health check
echo "🏁 Final Health Check..."
sleep 10  # Give ALB time to detect changes

FINAL_HEALTH=$(check_api_health)
FINAL_TARGETS=$(get_healthy_targets)
elapsed=$(($(date +%s) - start_time))

echo "   API Status: HTTP $FINAL_HEALTH"
echo "   Healthy Targets: $FINAL_TARGETS"
echo ""

# Summary
echo "📊 Deployment Summary:"
echo "======================"
echo "   Total Instances: ${#INSTANCE_IPS[@]}"
echo "   Successfully Updated: $updated_count"
echo "   Failed Updates: $failed_count"
echo "   Total Time: ${elapsed}s"
echo ""

if [ "$FINAL_HEALTH" = "200" ] && [ "$updated_count" -gt 0 ]; then
    echo "🎉 Efficient Deployment Complete!"
    echo "=================================="
    echo "   ✅ No instance refresh needed"
    echo "   ✅ No vCPU quota issues"
    echo "   ✅ Minimal downtime"
    echo "   ✅ Preserved model cache"
else
    echo "⚠️  Deployment completed with issues"
    echo "====================================="
    if [ "$FINAL_HEALTH" != "200" ]; then
        echo "   ❌ API not healthy (HTTP $FINAL_HEALTH)"
    fi
    if [ "$updated_count" -eq 0 ]; then
        echo "   ❌ No instances updated successfully"
    fi
fi

echo ""
echo "🧪 Test your API:"
echo "   curl $ALB_URL/health"
echo "   curl $ALB_URL/v1/preview -F 'file=@your-image.jpg'" 