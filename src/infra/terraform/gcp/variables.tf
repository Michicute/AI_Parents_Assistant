variable "gcp_project_id" {
  description = "Google Cloud project ID that will own the infrastructure."
  type        = string
}

variable "gcp_region" {
  description = "Google Cloud region for regional resources."
  type        = string
  default     = "asia-southeast1"
}

variable "gcp_zone" {
  description = "Google Cloud zone for the Compute Engine VM."
  type        = string
  default     = "asia-southeast1-a"
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

variable "machine_type" {
  description = "Compute Engine machine type for the application host. e2-standard-2 is close to t3.large: 2 vCPU, 8 GB RAM."
  type        = string
  default     = "e2-standard-2"
}

variable "boot_disk_size_gb" {
  description = "Boot persistent disk size in GiB."
  type        = number
  default     = 50
}

variable "boot_disk_type" {
  description = "Boot persistent disk type. pd-balanced is a safe starter default."
  type        = string
  default     = "pd-balanced"
}

variable "ssh_username" {
  description = "Linux username that will be provisioned for SSH access."
  type        = string
  default     = "ubuntu"
}

variable "ssh_public_key" {
  description = "SSH public key content used for Compute Engine instance metadata."
  type        = string
  sensitive   = true
}

variable "ssh_allowed_cidrs" {
  description = "CIDR blocks allowed to SSH into the VM. Keep this as narrow as possible."
  type        = list(string)
  default     = []
}

variable "app_allowed_cidrs" {
  description = "CIDR blocks allowed to reach ports 80 and 443. Defaults to Cloudflare proxy ranges so the VM origin is not publicly reachable by direct IP."
  type        = list(string)
  default = [
    "173.245.48.0/20",
    "103.21.244.0/22",
    "103.22.200.0/22",
    "103.31.4.0/22",
    "141.101.64.0/18",
    "108.162.192.0/18",
    "190.93.240.0/20",
    "188.114.96.0/20",
    "197.234.240.0/22",
    "198.41.128.0/17",
    "162.158.0.0/15",
    "104.16.0.0/13",
    "104.24.0.0/14",
    "172.64.0.0/13",
    "131.0.72.0/22",
    "2400:cb00::/32",
    "2606:4700::/32",
    "2803:f800::/32",
    "2405:b500::/32",
    "2405:8100::/32",
    "2a06:98c0::/29",
    "2c0f:f248::/32",
  ]

  validation {
    condition     = !contains(var.app_allowed_cidrs, "0.0.0.0/0") && !contains(var.app_allowed_cidrs, "::/0")
    error_message = "Do not expose the origin VM web ports to the public Internet. Use Cloudflare CIDRs or another explicit trusted proxy allowlist."
  }
}

variable "network_name" {
  description = "Optional existing VPC network name. Leave empty to create a dedicated VPC."
  type        = string
  default     = ""
}

variable "subnetwork_name" {
  description = "Optional existing subnetwork name. Leave empty to create a dedicated subnetwork."
  type        = string
  default     = ""
}

variable "subnetwork_cidr" {
  description = "CIDR range used when creating the dedicated subnetwork."
  type        = string
  default     = "10.20.0.0/24"
}

variable "assign_static_ip" {
  description = "Whether to reserve and attach a static external IP address."
  type        = bool
  default     = true
}

variable "app_directory" {
  description = "Application directory created on the VM."
  type        = string
  default     = "/opt/c2-app"
}

variable "enable_docker_install_startup_script" {
  description = "Install Docker Engine and Docker Compose plugin automatically with a startup script."
  type        = bool
  default     = true
}

variable "vm_service_account_email" {
  description = "Optional existing service account email to attach to the VM. Leave empty to use the Compute Engine default service account."
  type        = string
  default     = ""
}
