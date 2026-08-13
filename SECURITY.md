# Security Policy

## Supported versions

Before the first stable tag, security fixes are made on the current `main`
branch. After v1.0.0 is released, fixes are made on `main` and the latest stable
1.0.x release. Arbitrary development snapshots and superseded tags are not
supported.

| Version        | Security fixes |
| -------------- | -------------- |
| Current `main` | Yes            |
| Latest 1.0.x   | After release  |
| Older tags     | No             |

Operators should pin an explicit release tag or container digest, keep database and secret backups, and follow the [upgrade runbook](./docs/operations/upgrading.md).

## Report a vulnerability privately

Do not open a public issue or pull request for a suspected vulnerability. Use [GitHub private vulnerability reporting](https://github.com/KevinYe0725/ielts-writing-coach/security/advisories/new). If that form is unavailable before the public repository is created, contact the repository owner privately through the contact method listed on [@KevinYe0725's GitHub profile](https://github.com/KevinYe0725).

Include, when possible:

- the affected version, tag, or image digest;
- the deployment mode and relevant component;
- impact and realistic attack prerequisites;
- minimal reproduction steps using invented data;
- logs or screenshots with all credentials, tokens, cookies, essays, and personal data removed; and
- any mitigation you have already tested.

Do not test against someone else's deployment or access learner data without explicit authorization. Do not include a working production credential in the report.

The maintainer will aim to acknowledge a complete report within seven days, coordinate validation and remediation privately, and credit the reporter if requested and safe. This is a response target, not a support SLA.

## Security boundaries

- Provider API keys must remain server-side. Persisted provider credentials are encrypted with `APP_ENCRYPTION_KEY`.
- Web and Worker services that share a database must use the same encryption key and key version.
- Losing `APP_ENCRYPTION_KEY` makes encrypted provider credentials unreadable. Replacing it without a migration does not rotate existing ciphertext.
- `AUTH_SECRET`, `APP_ENCRYPTION_KEY`, `SETUP_TOKEN`, database backups, session cookies, and environment exports are secrets.
- Application administrators cannot read learner essay bodies through ordinary product APIs by default.
- A self-hosting operator with database, container-host, or cloud-project access can technically access stored data. Operators must disclose this boundary to their users and limit infrastructure access.
- Telemetry is disabled by default. Enabling it is an operator decision.
- AI provider content-retention and training policies are outside this project's control. Operators must select and configure providers appropriate for their learners.

## Deployment responsibilities

The public Web service should be served over HTTPS by the hosting platform or a maintained reverse proxy. Do not expose PostgreSQL to the public internet. Restrict database access to the Web and Worker services and to audited operator access.

For public Web deployments, configure `TRUST_PROXY_HOPS` only for the actual
sanitized ingress chain and block direct access to the container. With the
default value `0`, attacker-controlled forwarding headers are ignored; this is
safe for the loopback-only Compose default but intentionally shares one
unauthenticated rate-limit bucket.

Back up both PostgreSQL and the secret material required to decrypt it, store those backups separately from the live host, and test restoration. See [backup and restore](./docs/operations/backup-restore.md).

Official tagged releases publish a container image with SBOM and provenance metadata through the repository's release workflow. Verify the tag or digest used by the deployment; a successful build from an unreviewed fork is not an official project release.

## Disclosure

After a fix is available, the maintainer may publish a GitHub security advisory describing impact, affected versions, mitigations, and reporter credit. Please coordinate public disclosure so users have a reasonable opportunity to upgrade.
