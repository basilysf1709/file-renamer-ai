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
  default = "t3.medium" # CPU-only for testing (change to g4dn.xlarge after GPU quota)
}

variable "min_size" {
  type    = number
  default = 1
}

variable "max_size" {
  type    = number
  default = 2
}

variable "desired_size" {
  type    = number
  default = 1
}

variable "ingress_cidr" {
  type    = string
  default = "0.0.0.0/0" # tighten later
} 