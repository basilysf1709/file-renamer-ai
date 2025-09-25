#!/bin/bash

# Make AWS CLI available
export PATH="/Users/iqbalyusuf/Library/Python/3.9/bin:$PATH"

echo "🚀 Monitoring Renamer AI Instance Initialization..."
echo "Waiting for instance refresh to complete and new instance to boot..."
echo "Expected total time: 5-10 minutes"
echo ""

# First wait for new instance to be created
echo "⏳ Step 1: Waiting for new instance to be created..."
for i in {1..20}; do
    NEW_IP=$(aws ec2 describe-instances --filters "Name=tag:Name,Values=renamer-ai-b6b712e4" "Name=instance-state-name,Values=running" --query 'Reservations[].Instances[].PublicIpAddress' --output text)
    
    if [ ! -z "$NEW_IP" ] && [ "$NEW_IP" != "3.233.242.161" ]; then
        echo "✅ New instance found with IP: $NEW_IP"
        break
    fi
    
    echo "   Attempt $i/20 - Waiting for new instance (checking again in 30s)..."
    sleep 30
done

if [ -z "$NEW_IP" ] || [ "$NEW_IP" == "3.233.242.161" ]; then
    echo "⚠️  New instance not found after 10 minutes"
    exit 1
fi

echo ""
echo "⏳ Step 2: Waiting for API to be ready on $NEW_IP..."

# Now wait for API to be ready
for i in {1..30}; do
    if curl -s -m 5 http://$NEW_IP/health > /dev/null 2>&1; then
        echo "✅ SUCCESS! API is now responding!"
        echo ""
        echo "🎉 Your Renamer AI backend is ready!"
        echo "   Instance IP: $NEW_IP"
        echo "   Test it: python3 test_api.py http://$NEW_IP"
        echo ""
        echo "Health check response:"
        curl -s http://$NEW_IP/health
        echo ""
        exit 0
    fi
    
    echo "   Attempt $i/30 - API not ready yet (checking again in 30s)..."
    sleep 30
done

echo "⚠️  API still not responding after 15 minutes."
echo "   Check AWS Console for instance logs or SSH to debug." 