variable "aws_region" {
  description = "AWS region for the EC2 infrastructure."
  type        = string
  default     = "ap-southeast-1"
}

variable "project_name" {
  description = "Project slug used for naming resources."
  type        = string
  default     = "ai-parent-assistant"
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
  default     = "prod"
}

variable "instance_type" {
  description = "EC2 instance type for the application host."
  type        = string
  default     = "t3.large"
}

variable "root_volume_size_gb" {
  description = "Root EBS volume size in GiB."
  type        = number
  default     = 40
}

variable "ssh_public_key" {
  description = "SSH public key content used to create the EC2 key pair."
  type        = string
  sensitive   = true
}

variable "ssh_allowed_cidrs" {
  description = "CIDR blocks allowed to SSH into the EC2 instance. Keep this as narrow as possible."
  type        = list(string)
  default     = []
}

variable "app_allowed_cidrs" {
  description = "CIDR blocks allowed to reach ports 80 and 443."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "use_default_vpc" {
  description = "When true, place the EC2 instance in the default VPC."
  type        = bool
  default     = true
}

variable "vpc_id" {
  description = "Optional VPC ID to use when not using the default VPC."
  type        = string
  default     = ""
}

variable "subnet_id" {
  description = "Optional subnet ID to use. Leave empty to pick the first default subnet in the chosen VPC."
  type        = string
  default     = ""
}

variable "assign_elastic_ip" {
  description = "Whether to allocate and associate an Elastic IP to the instance."
  type        = bool
  default     = true
}

variable "app_directory" {
  description = "Application directory created on the EC2 host."
  type        = string
  default     = "/opt/c2-app"
}

variable "enable_docker_install_user_data" {
  description = "Install Docker Engine and Docker Compose plugin automatically with cloud-init."
  type        = bool
  default     = true
}
