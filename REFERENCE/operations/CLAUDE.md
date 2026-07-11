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
- **[deployment.md](./deployment.md)** - How to deploy all 5 workers (main app, queue consumer, cron, relay bridge, relay orchestrator)
- **[environment-setup.md](./environment-setup.md)** - Environment variables, API keys, secrets (.dev.vars, wrangler secrets)

### Monitoring & Debugging
- **[monitoring.md](./monitoring.md)** - Observability, Cloudflare logs, debugging production issues
- **[troubleshooting.md](./troubleshooting.md)** - Common issues and solutions (RLS errors, deployment failures, etc.)

### Security
- **[security-headers.md](./security-headers.md)** - HTTP security response headers: which header lives in the worker vs the Cloudflare edge, and why (the securityheaders.com surface)

## Common Questions
- **"How do I deploy?"** → [deployment.md](./deployment.md)
- **"What secrets do I need?"** → [environment-setup.md](./environment-setup.md)
- **"Something broke, where do I look?"** → [troubleshooting.md](./troubleshooting.md)
- **"How do I check logs?"** → [monitoring.md](./monitoring.md)
- **"How do I deploy the cron worker?"** → [deployment.md](./deployment.md) (worker list section)
- **"Why does securityheaders.com flag us / where do I bump HSTS?"** → [security-headers.md](./security-headers.md)

## Related Documentation
- [Architecture - Workers](../architecture/workers.md) - Understanding the worker architecture (3 core + 2 Relay: bridge + orchestrator)
- [Development](../development/CLAUDE.md) - Local development workflow
