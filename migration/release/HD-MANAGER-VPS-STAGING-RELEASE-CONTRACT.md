# HD Manager VPS staging release contract

Status: `DESIGNED / NOT INSTALLED`

This is a staging-only release contract for the immutable artifact
`p4-vps-staging-20260829T072544Z`. It is intentionally manual and fail-closed.
It does not alter the existing production workflow.

## Fixed release identity

| Item | Required value |
| --- | --- |
| Staging UI | `https://staging-app.hdconnect.net` |
| Staging API | `https://staging-api.hdconnect.net/api/v1` |
| Artifact | `hd-manager-p4-vps-staging-20260829T072544Z.zip` |
| Build ID | `p4-vps-staging-20260829T072544Z` |
| SHA-256 | `08A6FB1849F0448AEA9B01A65480DEACBAD58FD81A3F8FEA03075C4AF582BB18` |
| Previous known good | `p32-vps-staging-finance-refresh-20260829T090000Z` |
| Remote release command | `/usr/local/sbin/hd-manager-staging-release` |
| Remote artifact directory | `/srv/hd-manager-staging/incoming` |

The workflow accepts the artifact only from an existing GitHub Actions run and
verifies the exact SHA-256 before transfer. It never rebuilds the artifact.

## Workflow behavior

`.github/workflows/release-staging.yml` is `workflow_dispatch` only and uses
the GitHub Environment `staging` with a separate concurrency group. It:

1. Rejects production-looking hosts and any target other than the fixed staging
   UI/API domains.
2. Requires the exact artifact name, build ID, and SHA-256 for release mode.
3. Uses strict SSH host-key verification and a platform-owned executable. It
   does not use `sudo`, edit Nginx, run migrations, or restart a production
   service.
4. Requires the remote command to publish `version.json` containing both the
   build ID and `artifactSha256`.
5. Verifies the staging version, staging API health, and a read-only production
   version snapshot before and after the staging operation.
6. Supports only the allow-listed P3.2 rollback target in rollback mode.
7. Writes a deployment audit log and uploads it as a short-retention artifact.

The workflow is not active on GitHub until this file and the workflow are
reviewed and committed, and the staging environment is provisioned.

## Exact platform inputs required

These must be configured on the GitHub Environment named `staging`; values are
not present in this workspace and must not be guessed:

| Name | Purpose |
| --- | --- |
| `STAGING_DEPLOY_HOST` | Host/IP whose certificate and service identity are bound to the staging target |
| `STAGING_DEPLOY_USER` | Non-production deployment user for that host |
| `STAGING_DEPLOY_SSH_KEY` | Key restricted to the staging release operation |
| `STAGING_DEPLOY_KNOWN_HOSTS` | Pinned SSH host key entry for the staging host |
| `STAGING_REMOTE_ARTIFACT_DIR` | Must equal `/srv/hd-manager-staging/incoming` |

Required GitHub Environment variable:
`STAGING_TARGET_ATTESTATION` must equal exactly
`staging-app.hdconnect.net|staging-api.hdconnect.net|/srv/hd-manager-staging/incoming`.
This is a reviewed target attestation, not a credential.

Required GitHub Environment permission: `staging` deployment approval by the
platform owner, with Actions artifact read permission and SSH access limited
to the verified staging host and the fixed release command.

## Current gate

The exact artifact is verified locally, but no staging host, pinned host key,
deployment key, remote release command, or GitHub artifact run ID is available
in this workspace. Therefore no SCP/SSH/deploy was attempted. The live staging
site remains the P3.2 bundle until the platform owner supplies the exact
inputs above and runs the reviewed workflow.
