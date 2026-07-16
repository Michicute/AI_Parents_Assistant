# AWS Infrastructure

This Terraform stack now provisions only the base AWS infrastructure for the current deployment model:

- one `EC2` instance
- one `Security Group`
- one `Elastic IP` optionally attached to the instance
- one `Key Pair` created from your SSH public key

It does not deploy application containers.

Application deployment is handled separately by `.github/workflows/deploy-aws.yml`, which SSHes into EC2 and runs `docker compose`.

## What Terraform Manages

1. Ubuntu EC2 host for the application stack
2. Security group for ports `80`, `443`, and optionally `22`
3. Elastic IP for stable public DNS targeting
4. Optional cloud-init bootstrap to install Docker and create the app directory

## What Terraform Does Not Manage

1. Docker images
2. Nginx config changes inside the running server
3. Application environment values in `deploy/ec2/.env.prod`
4. Cloudflare DNS and SSL settings
5. Database schema migrations

## First Use

1. Copy `terraform.tfvars.example` to `terraform.tfvars`.
2. Fill `ssh_public_key` and your SSH CIDR allowlist.
3. Initialize Terraform:

```bash
terraform -chdir=src/infra/terraform/aws init \
  -backend-config="bucket=<tf-state-bucket>" \
  -backend-config="key=aws-ec2/prod.tfstate" \
  -backend-config="region=ap-southeast-1"
```

4. Review the plan:

```bash
terraform -chdir=src/infra/terraform/aws plan
```

5. Apply:

```bash
terraform -chdir=src/infra/terraform/aws apply
```

6. Read the outputs and use them to:
   - point Cloudflare DNS at `public_ip_for_dns`
   - set `EC2_HOST` in GitHub Secrets

## Important Outputs

- `public_ip_for_dns`
- `public_dns`
- `instance_id`
- `security_group_id`
- `ssh_key_pair_name`
- `app_directory`

## Recommended Starter Sizing

For the current architecture:

- `1 x EC2`
- `Docker Compose`
- `nginx`
- `PostgreSQL container`
- `blue/green` app slots on the same host

Recommended starting point:

- `instance_type = "t3.large"`
- `root_volume_size_gb = 50`

Why `50 GB` EBS is a better default than `40 GB`:

1. Docker image layers accumulate during repeated deploys.
2. Blue/green means both slots can coexist on disk and in memory.
3. PostgreSQL data and WAL files grow over time.
4. Logs and temporary build layers can consume space faster than expected.

If this is only a short-lived demo, `40 GB` can still work. For a real MVP, `50 GB` is the safer default.

## Approximate Monthly Cost

Assumptions:

1. Region `ap-southeast-1`
2. Linux On-Demand pricing
3. Running `24/7` for about `730 hours/month`
4. `gp3` EBS root volume
5. One public IPv4 / Elastic IP
6. Low to moderate traffic, excluding heavy outbound bandwidth

Estimated monthly cost for the recommended starter setup:

| Item | Estimate |
|---|---:|
| EC2 `t3.large` | ~$79 |
| EBS `gp3` 50 GB | ~$4-5 |
| Public IPv4 / Elastic IP | ~$3-4 |
| Total | **~$87-88 / month** |

## How Long 120 USD Free Credit Lasts

These estimates assume the starter setup above and different levels of extra usage on top of the base compute/storage cost.

| Usage pattern | Approx monthly total | 120 USD lasts about |
|---|---:|---:|
| Very light traffic, almost no extras | ~$88 | ~1.36 months |
| Light real usage with small snapshots/logs | ~$92-95 | ~1.26-1.30 months |
| Moderate usage with more logs and some outbound traffic | ~$100-105 | ~1.14-1.20 months |
| Heavier usage or extra backups/bandwidth | ~$110-120 | ~1.0-1.09 months |

Practical takeaway:

1. `t3.large` without ALB is the best fit for a `120 USD` credit budget.
2. Expect roughly `5-6 weeks` of usage if you run it continuously and keep traffic modest.
3. If you keep the server up only during active testing windows, the credit lasts noticeably longer.

## Recommended Flow

1. Apply Terraform once to create or update EC2 infra.
2. Configure Cloudflare to point the domain at the EC2 public IP.
3. Place the Cloudflare origin certificate on the server.
4. Run `.github/workflows/deploy-aws.yml` to ship the app over SSH.
