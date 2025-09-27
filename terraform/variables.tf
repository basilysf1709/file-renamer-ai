variable "project" {
  type    = string
  default = "renamer-ai"
}

variable "region" {
  type    = string
  default = "us-east-1"
}

variable "instance_type" {
  type    = string
  default = "g4dn.2xlarge" # GPU-enabled for AI inference! 🚀 (32GB RAM for VLM)
}

variable "ingress_cidr" {
  type    = string
  default = "0.0.0.0/0" # tighten later
}

variable "key_name" {
  description = "EC2 Key Pair name for SSH access"
  type        = string
  default     = "renamer-ai-key"
}

variable "github_token" {
  description = "GitHub Personal Access Token for private repository access"
  type        = string
  sensitive   = true
} 