# Patterns Documentation
REFERENCE > Patterns

Common implementation patterns, best practices, and architectural decisions.

## When to Read This
- Understanding why we do things a certain way
- Implementing similar functionality
- Making architectural decisions
- Learning from established patterns

## Pattern Documentation

### Security & Data Access
- **[service-role-client.md](./service-role-client.md)** - When/why/how to bypass RLS (cookie-based auth + RLS limitations)
- **[api-validation.md](./api-validation.md)** - Zod schemas, prompt injection prevention, HTML stripping

### Async Processing
- **[queue-processing.md](./queue-processing.md)** - Cloudflare Queues, retry logic, poison message handling

### Error Handling
- **[error-handling.md](./error-handling.md)** - Consistent error responses, logging strategy, user-friendly messages

## Common Questions
- **"Why use service role client?"** → [service-role-client.md](./service-role-client.md)
- **"How do we prevent prompt injection?"** → [api-validation.md](./api-validation.md)
- **"How do queues work?"** → [queue-processing.md](./queue-processing.md)
- **"What's the error handling pattern?"** → [error-handling.md](./error-handling.md)
- **"Is bypassing RLS safe?"** → [service-role-client.md](./service-role-client.md) (yes, when done correctly)

## Related Documentation
- [Features](../features/CLAUDE.md) - See patterns in action
- [Architecture - API Design](../architecture/api-design.md) - REST conventions
- [Development](../development/CLAUDE.md) - Code quality guidelines
