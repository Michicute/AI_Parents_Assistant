output "instance_name" {
  description = "Compute Engine instance name."
  value       = google_compute_instance.app.name
}

output "instance_self_link" {
  description = "Compute Engine instance self link."
  value       = google_compute_instance.app.self_link
}

output "public_ip_for_dns" {
  description = "Public IP address to point Cloudflare DNS at."
  value       = var.assign_static_ip ? google_compute_address.app[0].address : google_compute_instance.app.network_interface[0].access_config[0].nat_ip
}

output "ssh_command" {
  description = "SSH command for the provisioned VM."
  value       = "ssh ${var.ssh_username}@${var.assign_static_ip ? google_compute_address.app[0].address : google_compute_instance.app.network_interface[0].access_config[0].nat_ip}"
}

output "network_name" {
  description = "VPC network used by the VM."
  value       = local.create_network ? google_compute_network.app[0].name : var.network_name
}

output "subnetwork_name" {
  description = "Subnetwork used by the VM."
  value       = local.create_subnetwork ? google_compute_subnetwork.app[0].name : var.subnetwork_name
}

output "service_account_email" {
  description = "Service account attached to the VM."
  value       = var.vm_service_account_email != "" ? var.vm_service_account_email : "default"
}

output "app_directory" {
  description = "Application directory created by the startup script."
  value       = var.app_directory
}
