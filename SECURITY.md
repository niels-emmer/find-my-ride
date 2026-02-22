# Security Policy

This entire project was created by GPT-5.3-Codex, with the only human input in orchestration and prompting. Thus, though care was taken to design a secure application, use at your own risk.

## Supported Versions

The current project is pre-1.0 and moves quickly. Security support is provided for the latest `main` branch state and the latest container images built from it.

| Version / Branch | Supported |
| --- | --- |
| `main` (latest) | :white_check_mark: |
| Older commits/tags | :x: |

## Reporting a Vulnerability

If you find a security issue:

1. Do **not** open a public GitHub issue.
2. Use GitHub's private vulnerability reporting for this repository (Security Advisories / Report a vulnerability).
3. Include enough detail to reproduce and assess impact:
   - Affected endpoint, screen, or component
   - Reproduction steps
   - Expected vs actual behavior
   - Potential impact and scope
   - Logs, screenshots, or proof-of-concept (as safe/sanitized as possible)

### Response Targets

- Initial acknowledgement: within 72 hours
- Triage and severity assessment: within 7 calendar days
- Fix timeline: depends on severity and complexity; critical issues are prioritized first

## Disclosure Process

- Please keep reports private until a fix is available.
- After remediation, a coordinated disclosure may be published with mitigation details.

## Security Baseline For Self-Hosting

Use these controls before exposing the app publicly:

1. Terminate TLS at a trusted reverse proxy and enforce HTTPS only.
2. Place the stack behind a firewall; only expose required ports (typically 80/443 on proxy).
3. Use strong, unique secrets per installation:
   - `POSTGRES_PASSWORD`
   - `SECRET_KEY` (64+ random characters)
4. Set secure production cookie settings:
   - `REFRESH_TOKEN_COOKIE_SECURE=true`
   - `REFRESH_TOKEN_COOKIE_SAMESITE=lax` (or stricter if your flow allows)
5. Restrict CORS (`CORS_ORIGINS`) to known frontend origins only.
6. Keep dependencies and base container images updated; run `make security-scan` regularly.
7. Use least-privilege credentials for database and infrastructure accounts.
8. Store backups securely and test restore procedures.
9. Centralize logs and monitor for auth anomalies, repeated failures, and suspicious API activity.
10. Prefer MFA for users and enforce strong password hygiene.

## Secure Configuration Notes

- Never commit real secrets to git.
- Keep `.env` files out of public repositories.
- Rotate secrets after incidents, team changes, or accidental exposure.
- Review uploaded file handling and storage permissions in production.

## Out of Scope / Limitations

- Infrastructure outside this repository (cloud account, proxy, DNS, host OS) is operator-managed.
- Local development defaults are not production hardened by default.

## Audit Checklist (Recommended)

Run this checklist periodically:

1. Dependency vulnerabilities scanned (`make security-scan`) and remediated.
2. Authentication/authorization tests pass and role boundaries are verified.
3. Secrets are unique, rotated, and not reused across environments.
4. TLS configuration and proxy headers are validated.
5. Database backups and restore drills are current.
6. Container images are rebuilt with current security patches.
7. Logging and alerting are active for security-relevant events.
