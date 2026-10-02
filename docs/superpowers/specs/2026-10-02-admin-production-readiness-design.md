# Admin Production Readiness Design

## Goal

Ship the ArtoCamello administrative panel as a real, HTTPS-only production
application at `https://admin.artocamello.com`, with its API available through
the same origin at `/api`, no demonstration surface, repeatable VPS deployment,
and an operator runbook that does not store secrets in the repository.

## Context and decisions

The existing administrative API already enforces tenant isolation, role
permissions, email access codes, and TOTP MFA when `NODE_ENV=production`.
The frontend selects administrative routes by hostname. The remaining work is
to remove the demo entry point and provide a production deployment boundary
around that application.

The deployment will use one VPS-local Docker Compose stack:

- PostgreSQL remains private to the Docker network.
- The Node API is private to that Docker network and listens only through the
  reverse proxy.
- Nginx terminates TLS, serves the built SPA, forwards `/api/` to the API,
  supports SPA history fallback, and applies baseline browser security headers.
- `VITE_API_URL=/api` is compiled into the frontend so the browser never needs
  an API hostname or cross-origin credentials.

The Vite bundle is shared by the public and admin hosts. The operational guide
will configure `admin.artocamello.com` now. It will make the public hostname
an explicit optional extension rather than silently assuming its DNS or TLS is
ready.

## Scope

1. Remove `/demo` and the login-page demonstration button. The demo component
   will no longer be imported or exposed by the production router.
2. Add production Docker build definitions, Compose topology, and Nginx site
   configuration. Runtime secrets live only in a VPS `.env` file, not the
   repository or Docker image.
3. Make production startup fail clearly if required deployment variables are
   missing or unsafe. In particular: Node production mode, non-local database,
   long JWT secret, MFA encryption key, admin hostname and URLs, SMTP, ClamAV,
   and disabled mock payment settings.
4. Add a non-authenticated liveness/readiness endpoint suitable for the local
   reverse proxy and container health checks. It must not disclose configuration
   or database data.
5. Add a Spanish runbook for the VPS Codex agent. It will contain exact
   provisioning, secret generation, database migration/seed sequence, TLS
   issuance, system firewall, backups, rotation, smoke tests, rollback and
   post-deployment checks. It will identify manual business prerequisites that
   cannot be safely automated: bank accounts, SMTP verification, MFA enrolment,
   actual payment-provider testing and retention policy.

## Non-goals

- Do not enable Kushki cards. `KUSHKI_CARD_ENABLED=false` and tenant
  `cardEnabled=false` remain production defaults until contractual and UAT
  verification is complete.
- Do not create or expose credentials, change DNS records, deploy to the VPS,
  configure a payment account, or execute against production data.
- Do not commit existing local `logs.log` or environment files.

## Components and data flow

`admin.artocamello.com` reaches Nginx on ports 80/443. HTTP is redirected to
HTTPS. Nginx serves immutable frontend assets and returns `index.html` for
client-side admin routes. `/api/*` is proxied to the private API container,
with the original Host and proxy headers passed through. The API trusts only
the internal proxy address configured by the Compose network and resolves the
tenant from `admin.artocamello.com` in `TenantDomain`.

The API connects to the private PostgreSQL service using a production-only
connection string. Transfer proof files live in a persisted private volume,
are scanned by ClamAV before acceptance, and are included in backups without
ever being served directly by Nginx.

## Security requirements

- The browser reaches only HTTPS; TLS certificates are issued and renewed by
  Certbot on the VPS.
- Docker exposes only Nginx to the host. PostgreSQL and API do not publish host
  ports.
- Nginx sends HSTS after TLS validation, denies hidden files and disallows
  direct directory listing. CSP permits only the origins required by the
  current frontend and is documented for future third-party additions.
- API production startup rejects insecure secrets and missing admin routing;
  its existing MFA and email-code requirements remain mandatory.
- All values that vary by environment go in `deploy/.env.example` with blank
  placeholders and in an untracked VPS `.env` file. No real secret is added to
  source control.
- The server runs as a non-root application user; Nginx handles privileged
  ports. The runbook specifies UFW rules allowing only SSH, HTTP and HTTPS.

## Error handling and recovery

Container health checks distinguish liveness from a ready database connection.
Nginx returns a generic 502 while the API is unavailable. Compose restart
policies restore transient process failures; persistent faults are diagnosed
from structured container logs.

Before every release, the runbook requires a PostgreSQL backup and a copy of
the private-proofs volume. Migration is `prisma migrate deploy`, never the
development migration command. Rollback restores the previous image/revision
only after evaluating migration compatibility; destructive database rollback is
not automated.

## Verification

Automated checks will include frontend and server builds, existing integration
tests, a regression check that `/demo` is absent, and production-environment
startup validation. A Compose configuration render verifies that no secret is
embedded in the files.

The VPS runbook defines live smoke checks: HTTPS redirect, certificate,
security headers, SPA route fallback, `/api/health`, admin host guard, database
migration state, successful MFA/email-code flow, backup restore rehearsal and
log review. Payment-provider and bank-account checks remain explicit manual
gates.
