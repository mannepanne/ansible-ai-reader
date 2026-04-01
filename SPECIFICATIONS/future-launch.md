# Phase 6: Launch

**Status**: Not Started
**Last Updated**: 2026-03-07
**Dependencies**: Phase 5 (Notes, Rating & Polish)
**Estimated Effort**: Week 5

---

## Overview

Final testing, documentation, monitoring setup, and official launch of Ansible v1 MVP. By the end of this phase, Magnus should be using Ansible daily as the primary interface for Reader content triage.

---

## Scope & Deliverables

### Core Tasks
- [ ] Comprehensive end-to-end testing
- [ ] Create user guide documentation
- [ ] Set up error monitoring (logging, alerts)
- [ ] Set up cost monitoring (Perplexity API usage)
- [ ] Performance testing and optimization
- [ ] Security audit (API keys, RLS, session management)
- [ ] Backup and recovery strategy
- [ ] Launch announcement (internal/personal)
- [ ] Monitor initial usage (2+ weeks)
- [ ] Gather feedback and create improvement backlog

### Out of Scope
- Public launch (multi-user not in v1)
- Marketing/promotion
- Feature additions (save for v1.1+)

---

## Testing Plan

### End-to-End Testing Scenarios

**Scenario 1: First-Time User Flow**
```
1. Visit ansible.hultberg.org (not authenticated)
2. Redirected to /login
3. Enter email, receive magic link
4. Click link, authenticated
5. See empty state: "No items yet. Click 'Sync Reader'."
6. Click "Sync Reader"
7. Items fetched, summaries generated
8. View list of items with summaries and tags
```

**Scenario 2: Daily Usage Flow**
```
1. Visit ansible.hultberg.org (authenticated)
2. See list of unread items
3. Read summary, decide not interested
4. Click "Archive" → item removed, synced to Reader
5. Read another summary, triggers thought
6. Add note → synced to Reader
7. Rate item 4 stars
8. Click "Read in Reader" → opens in Reader
```

**Scenario 3: Configuration Flow**
```
1. Click "Settings"
2. Edit summary prompt
3. Save settings
4. Sync new items
5. Verify new summaries use custom prompt
```

**Scenario 4: Error Handling**
```
1. Invalid Reader API token → clear error message
2. Perplexity API failure → item shown without summary, error logged
3. Reader API rate limit → retry logic works
4. Network failure during sync → graceful degradation
5. Session expiry → redirect to login
```

### Performance Testing

**Load Testing**:
- [ ] Sync 100+ items at once
- [ ] Summary generation for 50+ items
- [ ] List view with 200+ items
- [ ] Mobile performance on 3G network

**Optimization Targets**:
- Initial page load: < 2 seconds
- Sync 20 items: < 30 seconds
- Archive action: < 1 second
- Note save: < 1 second

### Security Audit

**Checklist**:
- [ ] All API keys in environment variables (not committed)
- [ ] RLS policies tested (users can't access other users' data)
- [ ] Session management secure (httpOnly cookies)
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (sanitized inputs)
- [ ] HTTPS enforced (Cloudflare handles this)
- [ ] Rate limiting on sensitive endpoints

---

## Documentation

### User Guide

Create `REFERENCE/user-guide.md` with:
- [ ] What is Ansible and why use it
- [ ] Getting started (login, first sync)
- [ ] Daily workflow (view summaries, add notes, archive)
- [ ] Settings (custom prompts)
- [ ] Troubleshooting common issues
- [ ] FAQ

### Developer Documentation

Update existing docs:
- [ ] [environment-setup.md](../REFERENCE/operations/environment-setup.md) - Complete API key setup
- [ ] [testing-strategy.md](../REFERENCE/development/testing-strategy.md) - Add real-world examples
- [ ] [technical-debt.md](../REFERENCE/technical-debt.md) - Document known limitations
- [ ] [troubleshooting.md](../REFERENCE/operations/troubleshooting.md) - Common issues and solutions

### Project README

Update `README.md` with:
- [ ] Project description
- [ ] Features list
- [ ] Tech stack
- [ ] Setup instructions (for future reference)
- [ ] Links to documentation

---

## Monitoring & Logging

### Error Monitoring

**Setup**:
- [ ] Centralized error logging (console.error → sync_log table)
- [ ] Critical error alerts (email/Slack if API failures)
- [ ] Daily error summary

**What to Monitor**:
- Reader API failures (auth, rate limits, 500 errors)
- Perplexity API failures (timeouts, malformed responses)
- Database connection issues
- Summary generation failures
- Note sync failures

### Cost Monitoring

**Perplexity API**:
- [ ] Log token usage per request (to sync_log)
- [ ] Daily cost summary (estimated spend)
- [ ] Billing alerts (if usage spikes)
- [ ] Monthly cost report

**Supabase**:
- [ ] Monitor database size (free tier: 500MB)
- [ ] Monitor bandwidth usage (free tier: 2GB)
- [ ] Alerts if approaching limits

**Cloudflare Workers**:
- [ ] Monitor request count (should be low for single user)
- [ ] Check execution time (watch for timeouts)

---

## Backup & Recovery

### Database Backups

**Strategy**:
- [ ] Supabase automatic backups (enabled by default)
- [ ] Manual export before major changes
- [ ] Document restore procedure

**What to Back Up**:
- All tables: users, reader_items, sync_log
- API configuration settings
- Environment variables (stored securely, not in repo)

### Disaster Recovery Plan

**Scenarios**:
1. **Database corruption**: Restore from Supabase backup
2. **API key compromise**: Rotate keys immediately
3. **Deployment failure**: Rollback to previous Workers deployment
4. **Data loss**: Re-sync from Reader API (summaries regenerated)

---

## Launch Checklist

### Pre-Launch
- [ ] All tests passing (100% pass rate)
- [ ] Type checking clean (no errors)
- [ ] Coverage ≥95% (lines/functions/statements)
- [ ] Security audit complete
- [ ] Performance targets met
- [ ] Documentation complete
- [ ] Monitoring and logging set up
- [ ] Backup strategy implemented

### Launch Day
- [ ] Final deployment to ansible.hultberg.org
- [ ] Verify all environment variables set
- [ ] Test authentication flow
- [ ] Test sync operation with real data
- [ ] Verify monitoring/logging working
- [ ] Create launch announcement (personal note)

### Post-Launch (Week 1-2)
- [ ] Use Ansible daily as primary Reader interface
- [ ] Monitor error logs daily
- [ ] Track cost (Perplexity API usage)
- [ ] Note UX friction points
- [ ] Document bugs/issues in [technical-debt.md](../REFERENCE/technical-debt.md)
- [ ] Gather personal feedback

### Post-Launch (Week 3-4)
- [ ] Review usage patterns
- [ ] Assess success metrics (see below)
- [ ] Create v1.1 feature backlog
- [ ] Prioritize improvements

---

## Success Metrics

### MVP Success Criteria (2 weeks of daily use)

**Functionality**:
- [ ] Ansible successfully syncs Reader items (95%+ success rate)
- [ ] Summaries generated for 95%+ of items
- [ ] Archive sync works reliably (100% success)
- [ ] Document notes sync to Reader (100% success)
- [ ] Zero critical bugs

**User Experience**:
- [ ] Magnus uses Ansible daily for 2+ weeks
- [ ] Reduces time spent triaging Reader by 50%+
- [ ] Captures thoughts without needing to open Reader
- [ ] Finds summaries valuable (subjective assessment)
- [ ] No major UX friction points

**Technical**:
- [ ] Perplexity API cost: $3-15/month (as estimated)
- [ ] Average sync time: < 30 seconds for 20 items
- [ ] Zero data loss incidents
- [ ] Uptime: 99%+

---

## Pull Request Workflow

**When to create PR**: After all tasks completed and launch checklist passed.

**PR Title**: `Phase 6: Launch - Documentation, monitoring, final testing`

**PR Description Template**:
```markdown
## Summary
Completes Phase 6: Launch preparation and v1 MVP release.

## What's Included
- Comprehensive end-to-end testing
- User guide and developer documentation
- Error monitoring and logging
- Cost monitoring (Perplexity API)
- Security audit completion
- Backup and recovery strategy
- Launch announcement

## Testing
- [x] End-to-end scenarios tested
- [x] Performance targets met
- [x] Security audit passed
- [x] All documentation complete

## Launch Readiness
- [x] All pre-launch checklist items complete
- [x] Monitoring and alerts configured
- [x] Ready for daily use

## Post-Launch Plan
- Monitor usage daily for 2 weeks
- Track success metrics
- Document feedback and improvements
- Plan v1.1 features
```

**Review Process**: Use `/review-pr` for standard review.

---

## Post-Launch: v1.1 Planning

After 2 weeks of usage, assess and prioritize:

**Potential v1.1 Features** (from main spec):
- Long summaries (detailed 5-min read on-demand)
- Pagination/infinite scroll for large lists
- Filter items by tag
- Search summaries by keyword
- Sort options (date, rating, title)
- Dark mode toggle

**Prioritization Criteria**:
1. Addresses real usage friction
2. High value / low effort
3. User feedback (Magnus's experience)
4. Technical debt reduction

---

## Acceptance Criteria

Phase 6 is complete when:

1. ✅ All end-to-end scenarios tested and working
2. ✅ Documentation complete (user guide + developer docs)
3. ✅ Monitoring and logging operational
4. ✅ Security audit passed
5. ✅ Launch checklist complete
6. ✅ Magnus using Ansible daily
7. ✅ Success metrics tracked
8. ✅ v1 officially launched

---

## Next Steps

**Immediate (Week 1-2)**:
- Use Ansible daily
- Monitor closely
- Document issues

**Short-term (Week 3-4)**:
- Assess success metrics
- Review technical debt
- Plan v1.1 features

**Long-term**:
- Consider v2 features (learning from ratings, concept graph)
- Evaluate multi-user support (v3)
- Iterate based on real-world usage

---

## Reference Documentation

- **Main spec**: [ansible-outline.md](./ORIGINAL_IDEA/ansible-outline.md)
- **Testing strategy**: [testing-strategy.md](../REFERENCE/development/testing-strategy.md)
- **Environment setup**: [environment-setup.md](../REFERENCE/operations/environment-setup.md)
- **Technical debt**: [technical-debt.md](../REFERENCE/technical-debt.md)
- **Troubleshooting**: [troubleshooting.md](../REFERENCE/operations/troubleshooting.md)
