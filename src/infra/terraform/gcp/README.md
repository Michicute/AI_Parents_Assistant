# Google Cloud Infrastructure

This Terraform stack provisions a single Google Cloud VM that mirrors the current AWS EC2 deployment model:

- one `Compute Engine` VM
- one static external IP, optionally attached to the VM
- firewall rules for `80`, `443`, and optionally `22`
- the Compute Engine default service account, or an existing service account if provided
- optional startup script to install Docker and create the app directory

It does not deploy application containers.

Application deployment should still happen separately over SSH with Docker Compose, similar to the current AWS flow.

## What Terraform Manages

1. Ubuntu 24.04 Compute Engine host for the application stack
2. Dedicated VPC/subnet by default, or an existing VPC/subnet if provided
3. Firewall rules for public web traffic and restricted SSH
4. Static external IP for stable Cloudflare DNS targeting
5. Optional startup script to install Docker and create `/opt/c2-app`

## What Terraform Does Not Manage

1. Docker images
2. Nginx config changes inside the running server
3. Application environment values
4. Cloudflare DNS and SSL settings
5. Database schema migrations
6. Backups for PostgreSQL data if PostgreSQL remains containerized on the VM
7. VM service account creation by default

By default this stack does not create a new service account because borrowed or limited Terraform credentials often do not have `iam.serviceAccounts.create`. If you want to attach a specific existing service account, set `vm_service_account_email`.

## First Use

1. Enable required Google Cloud APIs:

```bash
gcloud services enable compute.googleapis.com iam.googleapis.com
```

2. Copy `terraform.tfvars.example` to `terraform.tfvars`.
3. Fill `gcp_project_id`, `ssh_public_key`, and your SSH CIDR allowlist.
4. Authenticate Terraform if needed:

```bash
gcloud auth application-default login
```

5. Initialize Terraform:

```bash
terraform -chdir=src/infra/terraform/gcp init
```

6. Review the plan:

```bash
terraform -chdir=src/infra/terraform/gcp plan
```

7. Apply:

```bash
terraform -chdir=src/infra/terraform/gcp apply
```

8. Read `public_ip_for_dns` and point Cloudflare DNS at that IP.

## Recommended Starter Sizing

For the current architecture:

- `1 x Compute Engine VM`
- `Docker Compose`
- `nginx`
- `PostgreSQL container`
- `blue/green` app slots on the same host

Recommended starting point:

- `machine_type = "e2-standard-2"`
- `boot_disk_size_gb = 50`
- `boot_disk_type = "pd-balanced"`

`e2-standard-2` provides 2 vCPU and 8 GB RAM, close to the AWS `t3.large` memory profile used by the current stack.

## Cloudflare

After apply, configure Cloudflare:

- `A c2-app-129.io.vn -> public_ip_for_dns`
- keep proxy enabled only after the origin responds directly
- install or copy your origin certificate/private key to the VM if nginx expects Cloudflare origin TLS files

## Origin Protection

The production origin should not be reachable directly by public IP. The default
`app_allowed_cidrs` value is the Cloudflare proxy IP allowlist, so ports `80` and
`443` accept traffic only from Cloudflare. Keep the DNS record proxied in
Cloudflare and do not replace `app_allowed_cidrs` with `0.0.0.0/0`.

The nginx production config also rejects requests whose `Host` header is not the
configured `APP_DOMAIN`, which prevents scanners from loading the app by direct
IP even if a firewall rule is loosened by mistake.

After changing firewall settings, review and apply Terraform:

```bash
terraform -chdir=src/infra/terraform/gcp plan
terraform -chdir=src/infra/terraform/gcp apply
```

## Deployment Notes

The VM is created with Docker installed, but the repo, environment files, compose file, certificates, and running containers must be deployed separately.

If the AWS instance remains unavailable, you can deploy fresh seed data first, then restore production PostgreSQL data after AWS account access is restored.
