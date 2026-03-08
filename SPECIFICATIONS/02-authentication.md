# Phase 2: Authentication

**Status**: Not Started
**Last Updated**: 2026-03-07
**Dependencies**: Phase 1 (Foundation)
**Estimated Effort**: Week 2

---

## Overview

Implement magic link authentication using Supabase Auth and Resend for email delivery. By the end of this phase, Magnus should be able to log in via email link and access protected routes.

---

## Scope & Deliverables

### Core Tasks
- [ ] Configure Supabase Auth settings
- [ ] Integrate Resend SMTP with Supabase
- [ ] Create login page (`/login`)
- [ ] Implement magic link flow
- [ ] Create protected route middleware
- [ ] Build logout functionality
- [ ] Test email delivery end-to-end
- [ ] Create user session management
- [ ] Add loading states for auth flows

### Out of Scope
- Multi-user support (single user: Magnus only)
- Password authentication
- OAuth providers
- User registration UI (handled via magic link)

---

## User Flow

```
User visits ansible.hultberg.org
  ↓
Redirected to /login (if not authenticated)
  ↓
Enters email address
  ↓
Receives magic link email via Resend
  ↓
Clicks link → authenticated → redirected to /summaries
  ↓
Session stored in httpOnly cookie (managed by Supabase)
```

---

## Implementation Details

### Supabase Auth Configuration

**Settings → Auth → Email Provider → SMTP**
```
Host: smtp.resend.com
Port: 465
Username: resend
Password: <RESEND_API_KEY>
Sender email: ansible@hultberg.org
```

**Email Template** (customize in Supabase dashboard):
```
Subject: Sign in to Ansible

Click here to sign in to Ansible:
{{ .ConfirmationURL }}

This link expires in 1 hour.
```

### Protected Routes

Create middleware to protect routes:
- `/summaries` - requires authentication
- `/summaries/:id` - requires authentication
- `/settings` - requires authentication
- `/login` - public (redirect to /summaries if authenticated)

### Session Management

- Session tokens stored in httpOnly cookies (Supabase handles this)
- Session refresh handled automatically by Supabase client
- Logout clears session and redirects to /login

---

## Testing Strategy

### Required Tests

**1. Authentication Flow Tests**
- [ ] Magic link email sent successfully
- [ ] Email link contains valid token
- [ ] Token validates and creates session
- [ ] Invalid/expired tokens rejected
- [ ] Session persists across page loads

**2. Protected Route Tests**
- [ ] Unauthenticated users redirected to /login
- [ ] Authenticated users access protected routes
- [ ] Session expiry redirects to /login
- [ ] Logout clears session properly

**3. Email Integration Tests**
- [ ] Resend SMTP connection works
- [ ] Email delivers to inbox (not spam)
- [ ] Email template renders correctly
- [ ] Link format is correct

**4. Edge Cases**
- [ ] Multiple login attempts (rate limiting)
- [ ] Expired magic links
- [ ] Already authenticated user visits /login
- [ ] Session timeout handling

### Test Commands
```bash
npm test                  # Run all tests
npm run test:watch        # Watch mode during development
npm run test:coverage     # Coverage report (target: 95%+)
npx tsc --noEmit          # Type checking
```

**Coverage Target**: 100% for new code (enforced minimums: 95% lines/functions/statements, 90% branches)

---

## Pre-Commit Checklist

Before creating a PR for this phase:

- [ ] All tests pass (`npm test`)
- [ ] Type checking passes (`npx tsc --noEmit`)
- [ ] Coverage meets targets (`npm run test:coverage`)
- [ ] Manual testing: magic link email received and works
- [ ] Protected routes redirect correctly
- [ ] Logout functionality works
- [ ] Resend API key documented in [environment-setup.md](../REFERENCE/environment-setup.md)
- [ ] No secrets committed to repository
- [ ] Session management tested across page reloads

---

## Pull Request Workflow

**When to create PR**: After all tasks completed and pre-commit checklist passed.

**PR Title**: `Phase 2: Authentication - Magic link with Supabase Auth`

**PR Description Template**:
```markdown
## Summary
Completes Phase 2: Magic link authentication using Supabase Auth and Resend.

## What's Included
- Supabase Auth integration
- Resend SMTP configuration
- Login page with magic link flow
- Protected route middleware
- Logout functionality
- Session management

## Testing
- [x] All tests pass
- [x] Type checking passes
- [x] Coverage: XX% (target: 95%+)
- [x] Manual testing: magic link email received and validated
- [x] Protected routes tested

## Environment Variables Added
- `RESEND_API_KEY` (documented in environment-setup.md)

## Next Steps
Phase 3: Reader Integration (fetch and sync unread items)
```

**Review Process**: Use `/review-pr` for standard review.

---

## Acceptance Criteria

Phase 2 is complete when:

1. ✅ Magnus can log in via magic link email
2. ✅ Email delivered successfully via Resend
3. ✅ Protected routes require authentication
4. ✅ Logout functionality works
5. ✅ Session persists across page reloads
6. ✅ All tests passing with 95%+ coverage
7. ✅ No secrets in repository
8. ✅ PR merged to main branch

---

## Technical Considerations

### Security
- **Magic links expire after 1 hour** (Supabase default)
- **Session tokens in httpOnly cookies** (XSS protection)
- **Rate limiting** on login attempts (Supabase provides basic protection)
- **HTTPS required** for production (Cloudflare handles this)

### Email Deliverability
- Verify `ansible@hultberg.org` sender address in Resend
- Test email lands in inbox (not spam folder)
- Consider adding SPF/DKIM records if needed

### User Experience
- Clear loading states during magic link generation
- Error messages for failed authentication
- Redirect to intended route after login (not just /summaries)

---

## Reference Documentation

- **Main spec**: [ansible-outline.md](./ORIGINAL_IDEA/ansible-outline.md)
- **Testing strategy**: [testing-strategy.md](../REFERENCE/testing-strategy.md)
- **Environment setup**: [environment-setup.md](../REFERENCE/environment-setup.md)
- **Supabase Auth**: https://supabase.com/docs/guides/auth
- **Resend Docs**: https://resend.com/docs
