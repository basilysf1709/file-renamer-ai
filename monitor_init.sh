#!/bin/bash

# Make AWS CLI available
export PATH="/Users/iqbalyusuf/Library/Python/3.9/bin:$PATH"

echo "🚀 Monitoring Renamer AI Deployment via ALB..."
echo "Waiting for instance refresh to complete and API to be ready..."
echo "Expected total time: 5-10 minutes"
echo ""

# ALB endpoint (stable)
ALB_URL="http://renamer-ai-b6b712e4-alb-1893620514.us-east-1.elb.amazonaws.com"

echo "⏳ Step 1: Waiting for instance refresh to complete..."
for i in {1..30}; do
    REFRESH_STATUS=$(aws autoscaling describe-instance-refreshes \
        --auto-scaling-group-name renamer-ai-b6b712e4-asg \
        --query 'InstanceRefreshes[0].Status' \
        --output text)
    
    if [ "$REFRESH_STATUS" = "Successful" ]; then
        echo "✅ Instance refresh completed successfully!"
        break
    elif [ "$REFRESH_STATUS" = "Failed" ] || [ "$REFRESH_STATUS" = "Cancelled" ]; then
        echo "❌ Instance refresh failed with status: $REFRESH_STATUS"
        exit 1
    fi
    
    echo "   Attempt $i/30 - Refresh status: $REFRESH_STATUS (checking again in 30s)..."
    sleep 30
done

if [ "$REFRESH_STATUS" != "Successful" ]; then
    echo "⚠️  Instance refresh did not complete after 15 minutes"
    echo "   Current status: $REFRESH_STATUS"
    exit 1
fi

echo ""
echo "⏳ Step 2: Waiting for API to be ready at ALB endpoint..."

# Now wait for API to be ready via ALB
for i in {1..30}; do
    HTTP_CODE=$(curl -s -w "%{http_code}" -m 5 $ALB_URL/health -o /dev/null)
    
    if [ "$HTTP_CODE" = "200" ]; then
        echo "✅ SUCCESS! API is now responding via ALB!"
        echo ""
        echo "🎉 Your Renamer AI backend is ready!"
        echo "   Stable API URL: $ALB_URL"
        echo "   Test it: python3 test_api.py $ALB_URL"
        echo ""
        echo "Health check response:"
        curl -s $ALB_URL/health
        echo ""
        echo ""
        echo "📋 Benefits of ALB:"
        echo "   ✅ Stable endpoint - never changes"
        echo "   ✅ Load balancing across instances"
        echo "   ✅ Health checks and failover"
        echo "   ✅ Production-ready architecture"
        exit 0
    fi
    
    echo "   Attempt $i/30 - API not ready yet (HTTP: $HTTP_CODE) (checking again in 30s)..."
    sleep 30
done

echo "⚠️  API still not responding after 15 minutes."
echo "   Check ALB target health: aws elbv2 describe-target-health --target-group-arn arn:aws:elasticloadbalancing:us-east-1:555873675910:targetgroup/renamer-ai-b6b712e4-api-tg/fc79c5d90e625cf3" 