terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region
}

locals {
  name = "${var.project}-${random_id.suffix.hex}"
}

resource "random_id" "suffix" {
  byte_length = 4
}

data "aws_vpc" "default" {
  default = true
}

# S3 buckets for input and output
resource "aws_s3_bucket" "in" {
  bucket = "${local.name}-input"
}

resource "aws_s3_bucket" "out" {
  bucket = "${local.name}-output"
}

resource "aws_s3_bucket_public_access_block" "in" {
  bucket = aws_s3_bucket.in.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_public_access_block" "out" {
  bucket = aws_s3_bucket.out.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# SQS queue for job processing
resource "aws_sqs_queue" "jobs" {
  name                      = "${local.name}-jobs"
  visibility_timeout_seconds = 300
  message_retention_seconds = 1209600 # 14 days
  receive_wait_time_seconds = 10      # long polling
}

resource "aws_sqs_queue" "jobs_dlq" {
  name = "${local.name}-jobs-dlq"
}

resource "aws_sqs_queue_redrive_policy" "jobs" {
  queue_url = aws_sqs_queue.jobs.id
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.jobs_dlq.arn
    maxReceiveCount     = 3
  })
}

# Security group for EC2 instances
resource "aws_security_group" "sg" {
  name_prefix = "${local.name}-sg-"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = [var.ingress_cidr]
  }

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.ingress_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.name}-sg"
  }
}

# IAM role for EC2 instances
resource "aws_iam_role" "ec2" {
  name = "${local.name}-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })
}

data "aws_iam_policy_document" "ec2_inline" {
  statement {
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:ListBucket",
      "s3:CreateMultipartUpload",
      "s3:UploadPart",
      "s3:CompleteMultipartUpload",
      "s3:AbortMultipartUpload"
    ]
    resources = [
      aws_s3_bucket.in.arn,
      "${aws_s3_bucket.in.arn}/*",
      aws_s3_bucket.out.arn,
      "${aws_s3_bucket.out.arn}/*"
    ]
  }
  statement {
    effect = "Allow"
    actions = [
      "sqs:ReceiveMessage","sqs:DeleteMessage","sqs:GetQueueAttributes","sqs:ChangeMessageVisibility","sqs:SendMessage"
    ]
    resources = [aws_sqs_queue.jobs.arn]
  }
  statement {
    effect = "Allow"
    actions = ["logs:CreateLogGroup","logs:CreateLogStream","logs:PutLogEvents"]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "ec2_inline" {
  name   = "${local.name}-ec2-inline"
  policy = data.aws_iam_policy_document.ec2_inline.json
}

resource "aws_iam_role_policy_attachment" "attach" {
  role       = aws_iam_role.ec2.name
  policy_arn = aws_iam_policy.ec2_inline.arn
}

resource "aws_iam_instance_profile" "ec2" {
  name = "${local.name}-instance-profile"
  role = aws_iam_role.ec2.name
}

# Launch template w/ Docker + app via docker-compose
resource "aws_launch_template" "lt" {
  name_prefix   = "${local.name}-lt-"
  image_id      = data.aws_ami.ubuntu.id
  instance_type = var.instance_type
  iam_instance_profile { name = aws_iam_instance_profile.ec2.name }
  network_interfaces {
    associate_public_ip_address = true
    security_groups             = [aws_security_group.sg.id]
  }
  user_data = base64encode(templatefile("${path.module}/userdata.sh", {
    bucket_in  = aws_s3_bucket.in.bucket
    bucket_out = aws_s3_bucket.out.bucket
    queue_url  = aws_sqs_queue.jobs.url
  }))
  block_device_mappings {
    device_name = "/dev/sda1"
    ebs {
      volume_size = 200
      volume_type = "gp3"
      throughput = 250
    }
  }
}

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical
  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-*-22.04-amd64-server-*"]
  }
}

resource "aws_autoscaling_group" "asg" {
  name                      = "${local.name}-asg"
  desired_capacity          = var.desired_size
  max_size                  = var.max_size
  min_size                  = var.min_size
  vpc_zone_identifier       = data.aws_subnets.default.ids
  health_check_grace_period = 120
  launch_template {
    id      = aws_launch_template.lt.id
    version = "$Latest"
  }
  tag {
    key                 = "Name"
    value               = local.name
    propagate_at_launch = true
  }
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
} 