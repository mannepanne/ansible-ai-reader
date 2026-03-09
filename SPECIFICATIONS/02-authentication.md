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

**Session Timeout**:
- **Default duration**: 7 days (Supabase default: `JWT_EXPIRY=604800` seconds)
- **Configurable in Supabase**: Settings → Auth → JWT Expiry
- **Security consideration**: 7 days balances security vs. UX for single-user app

**Session Refresh Strategy** (handled by Supabase):
```typescript
// Supabase client automatically handles refresh
import { createBrowserClient } from '@supabase/ssr'

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Automatic refresh happens when:
// 1. Session is about to expire (within refresh token window)
// 2. User interacts with the app
// 3. getSession() is called
```

**Session Storage**:
- **Access token**: Stored in httpOnly cookie (prevents XSS attacks)
- **Refresh token**: Stored in httpOnly cookie
- **Cookie settings**:
  - `httpOnly: true` - JavaScript cannot access
  - `secure: true` - HTTPS only (production)
  - `sameSite: 'lax'` - CSRF protection

**Handling Expired Sessions**:
```typescript
// Middleware checks session on protected routes
export async function middleware(req: NextRequest) {
  const supabase = createServerClient(/* ... */)
  const { data: { session } } = await supabase.auth.getSession()

  if (!session && req.nextUrl.pathname.startsWith('/summaries')) {
    // Redirect to login with return URL
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('returnTo', req.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}
```

**Session Events** (Supabase provides):
```typescript
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    // Clear local state, redirect to login
    router.push('/login')
  }

  if (event === 'TOKEN_REFRESHED') {
    // Session automatically refreshed
    console.log('Session refreshed:', session)
  }

  if (event === 'USER_DELETED') {
    // Handle user deletion (future multi-user)
  }
})
```

**Logout Flow**:
```typescript
async function logout() {
  await supabase.auth.signOut()
  // Supabase clears cookies automatically
  router.push('/login')
}
```

**Testing Session Management**:
- Verify session persists across page reloads
- Test session expiry (mock 7-day timeout)
- Confirm automatic refresh works
- Check redirect to login on expired session

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
- [ ] Session expiry redirects to /login with return URL
- [ ] Logout clears session properly
- [ ] Return URL works after login

**2a. Session Management Tests**
- [ ] Session timeout set to 7 days (JWT_EXPIRY=604800)
- [ ] Session persists across page reloads
- [ ] Session auto-refreshes before expiry
- [ ] Expired session triggers redirect to /login
- [ ] Cookie attributes correct (httpOnly, secure, sameSite)
- [ ] `onAuthStateChange` events fire correctly (SIGNED_OUT, TOKEN_REFRESHED)

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
- [ ] Protected routes redirect correctly with return URL
- [ ] Logout functionality works and clears cookies
- [ ] Session timeout verified (7 days configured)
- [ ] Session refresh tested (auto-refresh before expiry)
- [ ] Expired session redirect tested
- [ ] Cookie attributes verified (httpOnly, secure, sameSite)
- [ ] Resend API key documented in [environment-setup.md](../REFERENCE/environment-setup.md)
- [ ] SPF/DKIM records configured for ansible@hultberg.org sender address
- [ ] Email deliverability tested (inbox, not spam)
- [ ] Supabase JWT expiry documented
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
4. ✅ Session timeout configured (7 days)
5. ✅ Session refresh working automatically
6. ✅ Expired sessions redirect to login with return URL
7. ✅ Cookie security attributes verified (httpOnly, secure, sameSite)
8. ✅ Logout functionality works and clears session
9. ✅ Session persists across page reloads
10. ✅ All tests passing with 95%+ coverage
11. ✅ No secrets in repository
12. ✅ PR merged to main branch

---

## Technical Considerations

### Security

**Magic Link Security**:
- **Expiry**: 1 hour (Supabase default: `MAILER_AUTOCONFIRM_WINDOW=3600` seconds)
- **Single use**: Links invalidated after use
- **Token format**: Cryptographically secure random tokens

**Session Security**:
- **Duration**: 7 days (configurable via `JWT_EXPIRY`)
- **Storage**: httpOnly cookies (prevents XSS attacks)
- **Refresh**: Automatic via Supabase (no manual intervention)
- **Cookie security**:
  - `httpOnly: true` - JavaScript cannot access tokens
  - `secure: true` - HTTPS only in production
  - `sameSite: 'lax'` - CSRF protection
- **Expiry handling**: Redirect to `/login` with return URL

**Rate Limiting**:
- Supabase provides basic protection against brute force
- Configurable: Settings → Auth → Rate Limits
- Default: 30 requests per hour per IP

**HTTPS/TLS**:
- Required for production (Cloudflare handles termination)
- Ensures cookies transmitted securely
- Prevents MITM attacks on magic links

**Security Checklist**:
- [ ] Verify magic links expire after 1 hour
- [ ] Confirm session timeout is 7 days
- [ ] Test cookie attributes (httpOnly, secure, sameSite)
- [ ] Verify expired sessions redirect to login
- [ ] Test rate limiting with multiple login attempts

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
