# Deployment

## AWS EC2 + Docker Compose + Nginx + Cloudflare

The current deployment target is a single EC2 host running Docker Compose.

Main pieces:

- `Cloudflare`: public DNS and HTTPS edge
- `nginx`: reverse proxy on EC2
- `frontend`: Next.js production container
- `backend`: FastAPI production container
- `zalo-bot-service`: internal container
- `db`: PostgreSQL container with `pgvector`
- `blue/green` application slots on the same EC2 host
- `GitHub Actions`: one workflow for infra, one workflow for app deploy

## Workflow Split

1. `.github/workflows/infra-aws.yml`
   - uses Terraform
   - provisions EC2, Security Group, Elastic IP, and Key Pair
2. `.github/workflows/deploy-aws.yml`
   - does not use Terraform
   - SSHes into EC2 and deploys the inactive application slot with Docker Compose
   - switches Nginx upstreams after health checks pass

## Current Deploy Flow

1. Run `Apply AWS Infra` once or whenever EC2 infrastructure changes.
2. Terraform creates or updates the EC2 instance, Security Group, Elastic IP, and Key Pair.
3. Point Cloudflare DNS at the Terraform output `public_ip_for_dns`.
4. Set `EC2_HOST` in GitHub Secrets to that public IP or DNS name.
5. Push code to `main` or run `Deploy AWS EC2` manually from GitHub Actions.
6. GitHub Actions connects to EC2 over SSH.
7. The workflow copies `src/` and `deploy/ec2/` to the application directory on the server.
8. The workflow writes `deploy/ec2/.env.prod` on the server from GitHub Secrets and Variables.
9. The workflow selects the inactive slot:
   - first deploy -> `blue`
   - next deploy -> `green`
   - then alternates every release
10. The workflow starts the target slot and waits for health checks.
11. After the target slot is healthy, it switches Nginx upstreams and reloads Nginx.
12. The previous slot keeps running for fast rollback and reuse on the next deployment.

The core app deploy command remains:

```bash
docker compose -f deploy/ec2/docker-compose.prod.yml --env-file deploy/ec2/.env.prod up -d --build --remove-orphans
```

13. `nginx` routes:
   - `/api/*`, `/docs`, `/openapi.json` -> active backend slot
   - all other paths -> active frontend slot
14. `zalo-bot-service` and `db` stay private on the Docker network.
15. Cloudflare proxies public traffic to EC2 and provides HTTPS for users.

## Deploy Checklist

Before first deploy:

1. Launch an EC2 instance, preferably Ubuntu.
2. Open security group ports `80`, `443`, and `22`.
3. Install Docker Engine and Docker Compose plugin on the EC2 instance.
4. Create an application directory, for example `/opt/c2-app`.
5. Generate a strong SSH key pair for GitHub Actions deploy access.
6. Add the public key to the EC2 user's `authorized_keys`.
7. Decide whether PostgreSQL should run in the same Docker Compose stack or move to a separate host later.
8. Apply schema and seed data before production traffic uses the system.
9. In Cloudflare, point your domain to the EC2 public IP.
10. Use `Full (strict)` SSL mode in Cloudflare.
11. Generate a Cloudflare Origin Certificate and place the files on the server at:
    - `/opt/c2-certs/origin.crt`
    - `/opt/c2-certs/origin.key`
12. Make sure the EC2 instance size can tolerate both blue and green app slots running at the same time.
13. Recommended starter sizing for a `120 USD` AWS credit budget:
    - `instance_type = "t3.large"`
    - `root_volume_size_gb = 50`

GitHub repository variables for `.github/workflows/infra-aws.yml`:

1. `AWS_REGION`
2. `AWS_TERRAFORM_ROLE_ARN`
3. `TF_STATE_BUCKET`
4. `TF_STATE_KEY` optional, defaults to `aws-ec2/prod.tfstate`
5. `AWS_PROJECT_NAME` optional
6. `AWS_ENVIRONMENT` optional
7. `EC2_INSTANCE_TYPE` optional
8. `EC2_ROOT_VOLUME_SIZE_GB` optional
9. `EC2_SSH_ALLOWED_CIDRS_JSON` optional, example `[`"203.0.113.10/32"`]`
10. `EC2_APP_ALLOWED_CIDRS_JSON` optional, example `[`"0.0.0.0/0"`]`
11. `EC2_USE_DEFAULT_VPC` optional
12. `EC2_ASSIGN_ELASTIC_IP` optional
13. `EC2_APP_DIR` optional
14. `EC2_ENABLE_DOCKER_INSTALL_USER_DATA` optional

GitHub repository secrets for `.github/workflows/infra-aws.yml`:

1. `EC2_SSH_PUBLIC_KEY`

GitHub repository variables for `.github/workflows/deploy-aws.yml`:

1. `EC2_PORT` optional, defaults to `22`
2. `EC2_APP_DIR` optional, defaults to `/opt/c2-app`
3. `APP_DOMAIN`
4. `NEXT_PUBLIC_BACKEND_URL`
5. `FRONTEND_URL`
6. `BACKEND_URL`
7. `OPENAI_MODEL` optional
8. `OPENAI_TIMEOUT_SECONDS` optional
9. `OPENAI_MAX_RETRIES` optional
10. `AI_PROVIDER` optional
11. `EMBEDDING_PROVIDER` optional
12. `RAG_AUTO_INGEST_ON_STARTUP` optional
13. `APP_SESSION_EPOCH` optional
14. `POSTGRES_DB` optional
15. `POSTGRES_USER` optional
16. `ZALO_LINK_SESSION_TTL_MINUTES` optional
17. `ZALO_ADAPTER` optional
18. `ZALO_ACCOUNT_LABEL` optional
19. `ZALO_LANGUAGE` optional
20. `ZALO_BOT_CHAT_URL` optional
21. `ZALO_BOT_DISPLAY_NAME` optional
22. `ZALO_LINK_MESSAGE_PREFIX` optional

GitHub repository secrets for `.github/workflows/deploy-aws.yml`:

1. `EC2_HOST`
2. `EC2_USERNAME`
3. `EC2_SSH_PRIVATE_KEY`
4. `OPENAI_API_KEY`
5. `ANTHROPIC_API_KEY` optional
6. `APP_SECRET_KEY`
7. `POSTGRES_PASSWORD`
8. `DATABASE_URL`
9. `INTEGRATION_SHARED_SECRET`
10. `ZALO_SESSION_ENCRYPTION_KEY` optional

Before each production release:

1. Confirm `ci.yml` passes on the target commit.
2. Confirm the database schema is already compatible with the new backend image.
3. Confirm `NEXT_PUBLIC_BACKEND_URL`, `FRONTEND_URL`, and `BACKEND_URL` are aligned with the public domain.
4. Confirm `/opt/c2-certs/origin.crt` and `/opt/c2-certs/origin.key` still exist on the server.
5. Confirm GitHub secrets and variables are up to date.
6. Confirm Zalo integration secrets and URLs are valid if the bot is enabled.
7. If infrastructure changed, run `Apply AWS Infra` before `Deploy AWS EC2`.
8. Confirm the server still has enough CPU and memory for both slots.

After deploy:

1. Open the public domain in the browser.
2. Test `/login`.
3. Confirm `docker compose ps` shows healthy services:
   - nginx
   - frontend-blue or frontend-green
   - backend-blue or backend-green
   - zalo-bot-service-blue or zalo-bot-service-green
   - db
4. Check logs with:

```bash
docker compose -f deploy/ec2/docker-compose.prod.yml --env-file deploy/ec2/.env.prod logs --tail=100
```

5. Smoke test one parent flow and one admin flow.

## Blue/Green Rollback

1. Both slots stay on the server.
2. Rollback means switching `deploy/ec2/nginx/conf.d/active-upstreams.conf` back to the previous slot file and reloading Nginx.
3. Because the deploy workflow alternates slots, the previous version remains available until that slot is used again on a later release.

## PostgreSQL

1. The current deployment model supports PostgreSQL as a private container in the same Docker Compose stack.
2. Do not expose PostgreSQL directly to the public internet.
3. Back up the database volume regularly.
4. If you need stronger durability later, move PostgreSQL to a dedicated managed or separate-host deployment.

## Cost Guidance

Recommended starter setup for this project:

- `t3.large`
- `gp3` EBS `50 GB`
- no ALB

Approximate monthly total in `ap-southeast-1` with continuous runtime:

- EC2: `~$79`
- EBS 50 GB: `~$4-5`
- Public IPv4 / Elastic IP: `~$3-4`
- total: `~$87-88/month`

How long `120 USD` free credit lasts, roughly:

- very light usage: about `1.36 months`
- light real usage: about `1.26-1.30 months`
- moderate usage: about `1.14-1.20 months`
- heavier usage: about `1.0-1.09 months`

Practical expectation: if you leave the stack on `24/7`, a `120 USD` credit usually covers about `5-6 weeks` on this starter setup.

## Runtime Variables By Service

Frontend:

- `NEXT_PUBLIC_BACKEND_URL`

Backend:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_TIMEOUT_SECONDS`
- `OPENAI_MAX_RETRIES`
- `ANTHROPIC_API_KEY` optional
- `DATABASE_URL`
- `FRONTEND_URL`
- `BACKEND_URL`
- `AI_PROVIDER`
- `EMBEDDING_PROVIDER`
- `RAG_AUTO_INGEST_ON_STARTUP`
- `APP_SECRET_KEY`
- `APP_ENV`
- `APP_SESSION_EPOCH`
- `ZALO_SERVICE_URL`
- `INTEGRATION_SHARED_SECRET`
- `ZALO_LINK_SESSION_TTL_MINUTES`
- `ZALO_SESSION_ENCRYPTION_KEY`

Zalo bot service:

- `PORT`
- `BACKEND_URL`
- `INTEGRATION_SHARED_SECRET`
- `ZALO_ADAPTER`
- `ZALO_ACCOUNT_LABEL`
- `ZALO_LANGUAGE`
- `ZALO_BOT_CHAT_URL` optional
- `ZALO_BOT_DISPLAY_NAME`
- `ZALO_LINK_MESSAGE_PREFIX`
