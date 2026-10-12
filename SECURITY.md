# Security scope

Relay currently targets local use. Review the deployment and architecture boundaries before using it with sensitive operational data.

Do not put vulnerabilities or credentials in a public issue. Use the repository's [private vulnerability reporting page](https://github.com/Mohammadeslamifar1/relay-incident-workspace/security/advisories/new) to report a suspected vulnerability. Include the affected commit, reproduction steps, impact, and a minimal example with no real credentials or private data.

The application never executes generated infrastructure commands. API role and workspace checks are enforced on the server. Known secret-pattern redaction is a best-effort filter, not comprehensive data-loss prevention. Provider prompts and valid citation IDs do not guarantee factual or instruction-following safety. See `docs/ARCHITECTURE.md` for trust boundaries.
