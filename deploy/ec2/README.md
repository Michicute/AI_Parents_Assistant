# EC2 Deployment

Current production target:

- `Cloudflare` for public DNS and SSL
- `nginx` as reverse proxy on the EC2 host
- `Docker Compose` for `frontend`, `backend`, `zalo-bot-service`, and `PostgreSQL`
- `blue/green` app slots on the same host
- `Terraform` provisions EC2 infrastructure
- `GitHub Actions` deploys the app to EC2 over SSH

## Workflow Split

1. `.github/workflows/infra-aws.yml`
   - provisions EC2, Security Group, Elastic IP, and Key Pair
2. `.github/workflows/deploy-aws.yml`
   - copies `src` and `deploy/ec2` to EC2
   - writes `deploy/ec2/.env.prod`
   - deploys the inactive slot
   - waits for health checks
   - switches Nginx upstreams to the new slot

TLS certificate files are intentionally stored outside the repo at `/opt/c2-certs` so deploys never overwrite them.

## Files

- `deploy/ec2/docker-compose.prod.yml`
- `deploy/ec2/deploy-slot.sh`
- `deploy/ec2/.env.example`
- `deploy/ec2/nginx/conf.d/default.conf.template`
- `deploy/ec2/nginx/conf.d/active-upstreams.conf`
- `deploy/ec2/nginx/conf.d/upstreams.blue.conf`
- `deploy/ec2/nginx/conf.d/upstreams.green.conf`

## Blue/Green Promotion

Use `deploy-slot.sh` on the EC2 host to deploy and promote a slot:

```sh
APP_DIR=/opt/c2-app sh /opt/c2-app/deploy/ec2/deploy-slot.sh auto
```

The script detects the active Nginx upstream, deploys the inactive slot, waits for health checks, writes `active-upstreams.conf`, force-recreates Nginx so file bind mounts are refreshed, validates `nginx -T`, and records the active slot in `deploy/ec2/.active_slot`.

## Origin Security

Keep the public DNS record proxied through Cloudflare and restrict the VM origin
firewall to Cloudflare IP ranges. The nginx config is rendered from
`nginx/conf.d/default.conf.template` and serves only `APP_DOMAIN`; requests sent
directly to the VM IP or an unknown `Host` are dropped.

The deploy script enables the Zalo bot listener and scheduled Zalo worker only
for the active slot. Failed deploys stop the partially started target slot, and
successful deploys stop the previous slot.
