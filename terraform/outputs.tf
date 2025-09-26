output "bucket_in" {
  value = aws_s3_bucket.in.bucket
}

output "bucket_out" {
  value = aws_s3_bucket.out.bucket
}

output "queue_url" {
  value = aws_sqs_queue.jobs.url
}

output "api_url" {
  value = "http://${aws_lb.main.dns_name}"
}

output "public_note" {
  value = "API available at ALB DNS name (stable endpoint)."
}

output "asg_name" {
  value = aws_autoscaling_group.asg.name
}

output "instance_sg" {
  value = aws_security_group.sg.id
} 