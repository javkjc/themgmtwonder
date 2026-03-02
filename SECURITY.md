# Security

## Security Model

This project was built as a portfolio demonstration and is **not hardened for production**. The security decisions documented here are intentional for a local/development deployment and should be reviewed before any public-facing use.

### What is implemented

| Control | Detail |
|---------|--------|
| Password hashing | Argon2id (industry-standard, memory-hard) |
| Authentication | JWT stored in `httpOnly` cookie (not accessible to JavaScript) |
| CSRF protection | Double-submit cookie pattern with timing-safe comparison on all authenticated mutations |
| Account lockout | 5 failed login attempts triggers a 15-minute lockout |
| File upload validation | MIME type, extension, and size checks; stored under UUID filenames to prevent path traversal |
| Authorization | JWT guard on all protected routes; ownership checks on all resource mutations |
| Audit logging | Append-only audit log on all state mutations (before/after snapshots) |
| SQL injection | Drizzle ORM with parameterized queries throughout — no raw string interpolation |
| XSS | No `dangerouslySetInnerHTML`; React escapes output by default |
| Secrets | Database credentials and JWT secret loaded from environment variables only — never hardcoded |
| DB network | PostgreSQL port is not exposed to the host; DB is only reachable from the internal Docker network |

### Known limitations (not production-ready)

| Limitation | Detail |
|-----------|--------|
| No email delivery | Password reset tokens are logged to the server console in `NODE_ENV=development`. A production deployment would require an SMTP/email provider integration. |
| HTTP-only by default | `COOKIE_SECURE=false` in `.env.example` — set to `true` and deploy behind HTTPS in production. |
| No rate limiting at the edge | Login has attempt-based lockout but no IP-level rate limiting. Add a reverse proxy (nginx, Cloudflare) for production. |
| No secrets management | Secrets are read from `.env`. Production deployments should use a secrets manager (Vault, AWS Secrets Manager, etc.). |
| No TLS termination | Docker Compose does not include TLS. A production deployment needs TLS at the load balancer or reverse proxy layer. |
| Self-signed admin bootstrap | The admin account is bootstrapped from `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars. Change the password after first login. |

---

## Environment Variables

Never commit your `.env` file. Use `.env.example` as a template.

The following variables contain secrets and must be set to strong, unique values:

- `POSTGRES_PASSWORD` — database password
- `JWT_SECRET` — must be a cryptographically random value (minimum 32 bytes)
- `ADMIN_PASSWORD` — bootstrap admin account password; required at startup

Generate a strong JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## Reporting a Vulnerability

This is a portfolio project with no production users or infrastructure. If you find a security issue:

1. Open a GitHub issue with the label `security`
2. Describe the issue and affected file/line
3. Do not include exploit code in public issues

There is no bug bounty programme for this project.
