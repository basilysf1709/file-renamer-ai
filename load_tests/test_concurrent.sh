#!/bin/bash

# API endpoint
API_URL="http://renamer-ai-b6b712e4-alb-1893620514.us-east-1.elb.amazonaws.com/v1/preview"

# Test image file
TEST_IMAGE="Untitled.jpg"

# Check if test image exists
if [ ! -f "$TEST_IMAGE" ]; then
    echo "❌ Test image $TEST_IMAGE not found"
    echo "💡 Please make sure $TEST_IMAGE is in the current directory"
    exit 1
fi

# Different prompts for each user (20 unique prompts)
declare -a PROMPTS=(
    "Generate a short, descriptive filename that captures the main subject and context"
    "Create a professional filename that describes the key elements in this image"
    "Generate a creative filename that captures the mood and visual elements"
    "Create a technical filename that describes the image composition and subject"
    "Generate a marketing-style filename that highlights the image's appeal"
    "Describe this image in 2-3 words for a filename"
    "Create an artistic filename that reflects the visual style and theme"
    "Generate a social media friendly filename with descriptive keywords"
    "Make a filename that captures the emotional tone of this image"
    "Create a filename using photography terminology and composition details"
    "Generate a filename that would help with image search and discovery"
    "Describe the key visual elements for a catalog filename"
    "Create a filename that captures the lighting and atmosphere"
    "Generate a minimalist filename with essential descriptive words"
    "Make a filename that describes colors, shapes, and textures"
    "Create a filename for stock photo categorization"
    "Generate a filename that captures the story or narrative in the image"
    "Describe the image style and subject matter for archival purposes"
    "Create a filename that highlights unique or distinctive features"
    "Generate a filename using creative and expressive language"
)

echo "🔥 Starting STRESS TEST with concurrent users..."
echo "📊 Testing ${#PROMPTS[@]} concurrent users"
echo "🎯 Target: $API_URL"
echo "🖼️ Image: $TEST_IMAGE"
echo "⚠️ This will stress test the system - expect longer response times"
echo ""

# Function to test a single user
test_user() {
    local user_id=$1
    local prompt=$2
    local start_time=$(date +%s)
    
    echo "🚀 User $user_id: Starting request..."
    
    # Make the curl request and capture response
    response=$(curl -s -w "\nHTTP_CODE:%{http_code}\nTIME_TOTAL:%{time_total}" \
        -X POST "$API_URL" \
        -F "file=@$TEST_IMAGE" \
        -F "prompt=$prompt" 2>/dev/null)
    
    local end_time=$(date +%s)
    local total_time=$((end_time - start_time))
    
    # Parse response - extract JSON (everything before HTTP_CODE line)
    local json_response=$(echo "$response" | grep -v "^HTTP_CODE:" | grep -v "^TIME_TOTAL:")
    local http_code=$(echo "$response" | grep "^HTTP_CODE:" | cut -d: -f2)
    local curl_time=$(echo "$response" | grep "^TIME_TOTAL:" | cut -d: -f2)
    
    if [ "$http_code" = "200" ]; then
        # Extract suggested filename from JSON using different approach
        local suggested=$(echo "$json_response" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('suggested', ''))" 2>/dev/null || echo "$json_response" | sed -n 's/.*"suggested":"\([^"]*\)".*/\1/p')
        local processing_time=$(echo "$json_response" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('processing_time_ms', 0))" 2>/dev/null || echo "$json_response" | sed -n 's/.*"processing_time_ms":\([^,}]*\).*/\1/p')
        
        echo "✅ User $user_id: Success in ${total_time}s - '$suggested' (${processing_time}ms)"
        echo "$user_id|success|$total_time|$suggested|$processing_time" >> /tmp/test_results.txt
    else
        echo "❌ User $user_id: HTTP $http_code in ${total_time}s"
        echo "$user_id|error|$total_time|HTTP_$http_code|0" >> /tmp/test_results.txt
    fi
}

# Clear previous results
rm -f /tmp/test_results.txt

# Start all tests in parallel
echo "⏱️ Executing all ${#PROMPTS[@]} requests concurrently..."
echo "🚀 Launching users..."
start_total=$(date +%s)

for i in "${!PROMPTS[@]}"; do
    user_id=$((i + 1))
    test_user "$user_id" "${PROMPTS[$i]}" &
    # Small delay between launches to avoid overwhelming
    sleep 0.1
done

echo "⏳ Waiting for all ${#PROMPTS[@]} users to complete..."
echo "💡 You can watch /tmp/test_results.txt in another terminal: tail -f /tmp/test_results.txt"

# Wait for all background processes to complete
wait

end_total=$(date +%s)
total_test_time=$((end_total - start_total))

echo ""
echo "================================================================================"
echo "📊 STRESS TEST RESULTS (${#PROMPTS[@]} CONCURRENT USERS)"
echo "================================================================================"

# Analyze results
successful=0
failed=0
total_response_time=0
total_processing_time=0

if [ -f /tmp/test_results.txt ]; then
    while IFS='|' read -r user_id status response_time suggested processing_time; do
        if [ "$status" = "success" ]; then
            ((successful++))
            total_response_time=$((total_response_time + response_time))
            total_processing_time=$((total_processing_time + processing_time))
            printf "✅ User %s: %ss - '%s' (%sms)\n" "$user_id" "$response_time" "$suggested" "$processing_time"
        else
            ((failed++))
            printf "❌ User %s: %ss - %s\n" "$user_id" "$response_time" "$suggested"
        fi
    done < /tmp/test_results.txt
fi

echo ""
echo "================================================================================"
echo "📈 PERFORMANCE SUMMARY"
echo "================================================================================"
echo "🎯 Total Users: ${#PROMPTS[@]}"
echo "✅ Successful: $successful"
echo "❌ Failed: $failed"
printf "⏱️ Total Test Time: %ss\n" "$total_test_time"

if [ $successful -gt 0 ]; then
    avg_response_time=$((total_response_time / successful))
    avg_processing_time=$((total_processing_time / successful))
    
    printf "📊 Average Response Time: %ss\n" "$avg_response_time"
    printf "🤖 Average Processing Time: %sms\n" "$avg_processing_time"
    
    # Calculate throughput (requests per second)
    if [ $total_test_time -gt 0 ]; then
        printf "🔥 Throughput: %.2f requests/second\n" $(python3 -c "print($successful / $total_test_time)" 2>/dev/null || echo "~$((successful * 10 / total_test_time))/10")
    fi
    
    # Check if processing was truly concurrent
    if [ $total_test_time -lt $total_response_time ]; then
        echo "🚀 Concurrent Processing: YES"
    else
        echo "🚀 Concurrent Processing: NO"
    fi
fi

echo ""
echo "================================================================================"
echo "💡 SYSTEM ANALYSIS (20 CONCURRENT USERS)"
echo "================================================================================"

success_rate=$((successful * 100 / ${#PROMPTS[@]}))

if [ $successful -eq ${#PROMPTS[@]} ]; then
    echo "🟢 ALL REQUESTS SUCCESSFUL - System handling ${#PROMPTS[@]} concurrent users perfectly!"
    echo "🚀 Perfect scaling performance"
elif [ $success_rate -ge 90 ]; then
    echo "🟢 EXCELLENT ($successful/${#PROMPTS[@]} = ${success_rate}%) - Minor capacity issues under heavy load"
elif [ $success_rate -ge 70 ]; then
    echo "🟡 GOOD ($successful/${#PROMPTS[@]} = ${success_rate}%) - Some capacity constraints"
elif [ $success_rate -ge 50 ]; then
    echo "🟡 MODERATE ($successful/${#PROMPTS[@]} = ${success_rate}%) - Significant load impact"
else
    echo "🔴 POOR ($successful/${#PROMPTS[@]} = ${success_rate}%) - System overloaded"
fi

if [ $successful -gt 0 ]; then
    if [ "$avg_response_time" -lt 5 ]; then
        echo "🟢 Response times excellent (< 5s) under heavy load"
    elif [ "$avg_response_time" -lt 10 ]; then
        echo "🟡 Response times acceptable (5-10s) under heavy load"
    elif [ "$avg_response_time" -lt 20 ]; then
        echo "🟡 Response times slow (10-20s) - expected under heavy load"
    else
        echo "🔴 Response times very slow (> 20s) - system struggling"
    fi
    
    echo ""
    echo "📈 SCALING INSIGHTS:"
    if [ $success_rate -eq 100 ] && [ $avg_response_time -lt 10 ]; then
        echo "✅ System can handle 20 concurrent users efficiently"
        echo "🚀 Estimated capacity: 50-100 concurrent users"
    elif [ $success_rate -ge 90 ]; then
        echo "✅ System handles 20 concurrent users with minor issues"
        echo "🚀 Estimated capacity: 20-40 concurrent users"
    elif [ $success_rate -ge 70 ]; then
        echo "⚠️ System at capacity with 20 concurrent users"
        echo "🚀 Estimated capacity: 15-25 concurrent users"
    else
        echo "❌ System overloaded with 20 concurrent users"
        echo "🚀 Estimated capacity: 5-15 concurrent users"
    fi
fi

echo ""
echo "🧹 Cleaning up..."
rm -f /tmp/test_results.txt 