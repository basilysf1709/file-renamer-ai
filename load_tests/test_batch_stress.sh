#!/bin/bash

# API endpoints
API_BASE="http://renamer-ai-b6b712e4-alb-1893620514.us-east-1.elb.amazonaws.com"
BATCH_URL="$API_BASE/v1/jobs/rename"
PROGRESS_URL="$API_BASE/v1/jobs"
RESULTS_URL="$API_BASE/v1/jobs"

# Test image file
TEST_IMAGE="Untitled.jpg"

# Check if test image exists
if [ ! -f "$TEST_IMAGE" ]; then
    echo "❌ Test image $TEST_IMAGE not found"
    echo "💡 Please make sure $TEST_IMAGE is in the current directory"
    exit 1
fi

# Different prompts for batch jobs
declare -a BATCH_PROMPTS=(
    "Generate professional filenames that describe the image content and composition"
    "Create SEO-friendly filenames with descriptive keywords for web galleries"
    "Generate artistic filenames that capture the mood and visual style"
    "Create technical filenames for digital asset management and archival"
    "Generate creative filenames for social media and marketing content"
    "Create descriptive filenames for stock photography catalogs"
    "Generate filenames that highlight unique visual elements and features"
    "Create filenames optimized for image search and discovery"
    "Generate expressive filenames that tell the story within each image"
    "Create systematic filenames for organized digital collections"
)

# Batch job configurations
declare -a JOB_SIZES=(2 3 5 4 3 2 4 5 3 2)  # Different job sizes to test various loads

echo "🔥 BATCH ENDPOINT STRESS TEST"
echo "=============================="
echo "📊 Testing: ${#BATCH_PROMPTS[@]} concurrent batch jobs"
echo "🎯 Target: $BATCH_URL"
echo "🖼️ Image: $TEST_IMAGE"
echo "📦 Job sizes: 2-5 images per job"
echo "⚠️ This will test the real production capacity"
echo ""

# Function to create a single batch job
create_batch_job() {
    local job_id=$1
    local prompt="$2"
    local job_size=$3
    local start_time=$(date +%s)
    
    echo "🚀 Job $job_id: Creating batch job with $job_size images..."
    
    # Build curl command with multiple file uploads
    local curl_cmd="curl -s -X POST \"$BATCH_URL\" -F \"prompt=$prompt\""
    
    # Add multiple file uploads for this job
    for ((i=1; i<=job_size; i++)); do
        curl_cmd="$curl_cmd -F \"files=@$TEST_IMAGE\""
    done
    
    # Execute the curl command
    local response=$(eval $curl_cmd 2>/dev/null)
    local http_code=$?
    
    local submit_time=$(date +%s)
    local submission_duration=$((submit_time - start_time))
    
    if [ $http_code -eq 0 ] && [[ "$response" == *"job_id"* ]]; then
        # Extract job_id from JSON response
        local extracted_job_id=$(echo "$response" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('job_id', ''))" 2>/dev/null || echo "$response" | sed -n 's/.*"job_id":"\([^"]*\)".*/\1/p')
        
        echo "✅ Job $job_id: Submitted successfully - ID: $extracted_job_id (${submission_duration}s)"
        echo "$job_id|$extracted_job_id|$job_size|$prompt|$start_time|submitted" >> /tmp/batch_jobs.txt
        
        # Start monitoring this job in background
        monitor_job "$job_id" "$extracted_job_id" "$job_size" &
    else
        echo "❌ Job $job_id: Failed to submit - $response"
        echo "$job_id|failed|$job_size|$prompt|$start_time|failed" >> /tmp/batch_jobs.txt
    fi
}

# Function to monitor a job's progress
monitor_job() {
    local user_job_id=$1
    local actual_job_id="$2"
    local job_size=$3
    local start_time=$(date +%s)
    
    echo "👀 Job $user_job_id: Monitoring progress for $actual_job_id..."
    
    while true; do
        sleep 3
        
        # Check job progress
        local progress_response=$(curl -s "$PROGRESS_URL/$actual_job_id/progress" 2>/dev/null)
        
        if [[ "$progress_response" == *"completed"* ]] && [[ "$progress_response" == *"total"* ]]; then
            local completed=$(echo "$progress_response" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('completed', 0))" 2>/dev/null || echo "0")
            local total=$(echo "$progress_response" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('total', 0))" 2>/dev/null || echo "0")
            
            if [ "$completed" -eq "$total" ] && [ "$total" -gt 0 ]; then
                # Job completed - get results
                local results_response=$(curl -s "$RESULTS_URL/$actual_job_id/results" 2>/dev/null)
                local end_time=$(date +%s)
                local total_duration=$((end_time - start_time))
                
                if [[ "$results_response" == *"results"* ]]; then
                    echo "🎉 Job $user_job_id: COMPLETED in ${total_duration}s - $completed/$total images processed"
                    echo "$user_job_id|$actual_job_id|$job_size|completed|$total_duration|$completed" >> /tmp/batch_results.txt
                else
                    echo "⚠️ Job $user_job_id: Completed but results unavailable"
                    echo "$user_job_id|$actual_job_id|$job_size|completed_no_results|$total_duration|$completed" >> /tmp/batch_results.txt
                fi
                break
            else
                echo "📊 Job $user_job_id: Progress $completed/$total images"
            fi
        elif [[ "$progress_response" == *"error"* ]] || [[ "$progress_response" == *"failed"* ]]; then
            echo "❌ Job $user_job_id: Failed during processing"
            echo "$user_job_id|$actual_job_id|$job_size|failed|0|0" >> /tmp/batch_results.txt
            break
        fi
        
        # Timeout after 5 minutes
        local current_time=$(date +%s)
        if [ $((current_time - start_time)) -gt 300 ]; then
            echo "⏰ Job $user_job_id: Timeout after 5 minutes"
            echo "$user_job_id|$actual_job_id|$job_size|timeout|300|0" >> /tmp/batch_results.txt
            break
        fi
    done
}

# Clear previous results
rm -f /tmp/batch_jobs.txt /tmp/batch_results.txt

echo "⏱️ Starting batch job submissions..."
echo "🚀 Submitting ${#BATCH_PROMPTS[@]} concurrent batch jobs..."

# Submit all batch jobs concurrently
start_total=$(date +%s)

for i in "${!BATCH_PROMPTS[@]}"; do
    job_id=$((i + 1))
    job_size=${JOB_SIZES[$i]}
    create_batch_job "$job_id" "${BATCH_PROMPTS[$i]}" "$job_size" &
    
    # Small delay between submissions
    sleep 0.2
done

echo "⏳ All jobs submitted! Waiting for completion..."
echo "💡 Monitor in real-time: tail -f /tmp/batch_results.txt"
echo ""

# Wait for all jobs to complete
wait

end_total=$(date +%s)
total_test_time=$((end_total - start_total))

echo ""
echo "================================================================================"
echo "📊 BATCH STRESS TEST RESULTS"
echo "================================================================================"

# Analyze results
submitted=0
completed=0
failed=0
timeout=0
total_images=0
total_processing_time=0

if [ -f /tmp/batch_results.txt ]; then
    while IFS='|' read -r user_job_id actual_job_id job_size status duration images_processed; do
        case $status in
            "completed")
                ((completed++))
                total_images=$((total_images + images_processed))
                total_processing_time=$((total_processing_time + duration))
                printf "✅ Job %s: %ss - %s/%s images completed\n" "$user_job_id" "$duration" "$images_processed" "$job_size"
                ;;
            "failed")
                ((failed++))
                printf "❌ Job %s: Failed during processing\n" "$user_job_id"
                ;;
            "timeout")
                ((timeout++))
                printf "⏰ Job %s: Timed out after 300s\n" "$user_job_id"
                ;;
        esac
    done < /tmp/batch_results.txt
fi

# Count submitted jobs
if [ -f /tmp/batch_jobs.txt ]; then
    submitted=$(grep -c "submitted" /tmp/batch_jobs.txt 2>/dev/null || echo "0")
fi

echo ""
echo "================================================================================"
echo "📈 BATCH PERFORMANCE SUMMARY"
echo "================================================================================"
echo "🎯 Total Jobs Submitted: $submitted"
echo "✅ Successfully Completed: $completed"
echo "❌ Failed: $failed"
echo "⏰ Timed Out: $timeout"
echo "🖼️ Total Images Processed: $total_images"
printf "⏱️ Total Test Duration: %ss\n" "$total_test_time"

if [ $completed -gt 0 ]; then
    avg_job_time=$((total_processing_time / completed))
    printf "📊 Average Job Completion Time: %ss\n" "$avg_job_time"
    
    if [ $total_images -gt 0 ] && [ $total_processing_time -gt 0 ]; then
        avg_per_image=$((total_processing_time / total_images))
        images_per_second=$(python3 -c "print(round($total_images / $total_processing_time, 2))" 2>/dev/null || echo "~$((total_images * 10 / total_processing_time))/10")
        printf "🖼️ Average Time Per Image: %ss\n" "$avg_per_image"
        printf "🔥 Batch Throughput: %s images/second\n" "$images_per_second"
    fi
fi

echo ""
echo "================================================================================"
echo "💡 BATCH SYSTEM ANALYSIS"
echo "================================================================================"

success_rate=$((completed * 100 / submitted))

if [ $success_rate -eq 100 ]; then
    echo "🟢 PERFECT BATCH PERFORMANCE - All jobs completed successfully!"
    echo "🚀 System handles concurrent batch jobs flawlessly"
elif [ $success_rate -ge 90 ]; then
    echo "🟢 EXCELLENT batch performance ($completed/$submitted = ${success_rate}%)"
elif [ $success_rate -ge 70 ]; then
    echo "🟡 GOOD batch performance ($completed/$submitted = ${success_rate}%)"
else
    echo "🔴 POOR batch performance ($completed/$submitted = ${success_rate}%)"
fi

if [ $completed -gt 0 ] && [ $total_images -gt 0 ]; then
    echo ""
    echo "📈 PRODUCTION CAPACITY ESTIMATES:"
    
    # Calculate realistic throughput
    if [ $total_processing_time -gt 0 ]; then
        hourly_capacity=$((total_images * 3600 / total_processing_time))
        daily_capacity=$((hourly_capacity * 24))
        
        echo "🔥 Hourly Capacity: ~$hourly_capacity images"
        echo "📅 Daily Capacity: ~$daily_capacity images"
        
        # User capacity estimates
        light_users=$((daily_capacity / 10))     # 10 images per user per day
        medium_users=$((daily_capacity / 100))   # 100 images per user per day
        heavy_users=$((daily_capacity / 1000))   # 1000 images per user per day
        
        echo ""
        echo "👥 SUSTAINABLE USER CAPACITY:"
        echo "📱 Light Users (10 img/day): ~$light_users users"
        echo "💼 Medium Users (100 img/day): ~$medium_users users"
        echo "🏢 Heavy Users (1000 img/day): ~$heavy_users users"
    fi
fi

echo ""
echo "🧹 Cleaning up..."
rm -f /tmp/batch_jobs.txt /tmp/batch_results.txt

echo "✨ Batch stress test complete!" 