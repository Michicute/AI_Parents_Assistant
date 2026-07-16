output "instance_id" {
  description = "EC2 instance ID."
  value       = aws_instance.app.id
}

output "instance_public_ip" {
  description = "Public IP of the EC2 instance when no Elastic IP is attached."
  value       = aws_instance.app.public_ip
}

output "elastic_ip_public_ip" {
  description = "Elastic IP attached to the EC2 instance, if enabled."
  value       = var.assign_elastic_ip ? aws_eip.app[0].public_ip : null
}

output "public_ip_for_dns" {
  description = "The public IP you should point Cloudflare DNS at."
  value       = var.assign_elastic_ip ? aws_eip.app[0].public_ip : aws_instance.app.public_ip
}

output "public_dns" {
  description = "EC2 public DNS name."
  value       = aws_instance.app.public_dns
}

output "security_group_id" {
  description = "Security group ID attached to the instance."
  value       = aws_security_group.app.id
}

output "ssh_key_pair_name" {
  description = "AWS key pair name created by Terraform."
  value       = aws_key_pair.deployer.key_name
}

output "app_directory" {
  description = "Application directory created on the host."
  value       = var.app_directory
}
