# Operations Documentation
REFERENCE > Operations

Deployment, configuration, monitoring, and maintenance documentation.

## When to Read This
- Deploying to production
- Configuring environment variables
- Debugging production issues
- Monitoring system health
- Troubleshooting problems

## Operations Documentation

### Deployment & Configuration
- **[deployment.md](./deployment.md)** - How to deploy all 3 workers (main app, queue consumer, cron)
- **[environment-setup.md](./environment-setup.md)** - Environment variables, API keys, secrets (.dev.vars, wrangler secrets)

### Monitoring & Debugging
- **[monitoring.md](./monitoring.md)** - Observability, Cloudflare logs, debugging production issues
- **[troubleshooting.md](./troubleshooting.md)** - Common issues and solutions (RLS errors, deployment failures, etc.)

## Common Questions
- **"How do I deploy?"** → [deployment.md](./deployment.md)
- **"What secrets do I need?"** → [environment-setup.md](./environment-setup.md)
- **"Something broke, where do I look?"** → [troubleshooting.md](./troubleshooting.md)
- **"How do I check logs?"** → [monitoring.md](./monitoring.md)
- **"How do I deploy the cron worker?"** → [deployment.md](./deployment.md) (3-worker section)

## Related Documentation
- [Architecture - Workers](../architecture/workers.md) - Understanding the 3-worker system
- [Development](../development/CLAUDE.md) - Local development workflow
- Technical Debt: [../../REFERENCE/technical-debt.md](../technical-debt.md) - Known issues
