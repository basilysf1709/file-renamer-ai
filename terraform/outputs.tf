output "bucket_in" {
  value = aws_s3_bucket.in.bucket
}

output "bucket_out" {
  value = aws_s3_bucket.out.bucket
}

output "queue_url" {
  value = aws_sqs_queue.jobs.url
}

output "public_note" {
  value = "API available on EC2 public IP:80 once instance boots."
}

output "asg_name" {
  value = aws_autoscaling_group.asg.name
}

output "instance_sg" {
  value = aws_security_group.sg.id
} 