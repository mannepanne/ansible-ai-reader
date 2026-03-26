# Automated Sync
REFERENCE > Features > Automated Sync

Scheduled automatic syncing system that runs hourly via cron worker.

## What Is This?
Users can configure automatic syncing at regular intervals (1-24 hours). A cron worker checks hourly and triggers syncs for users who are due.

## Configuration

### User Settings
Set via Settings page (`/settings`):
- **sync_interval**: Hours between syncs (0-24, 0 = disabled)
- **last_auto_sync_at**: Last successful auto-sync timestamp

See: [Settings](./settings.md)

## Architecture

### 3-Worker System
1. **Cron Worker** - Triggers hourly, calls auto-sync endpoint
2. **Main Worker** - Auto-sync endpoint checks users and triggers syncs
3. **Queue Consumer** - Processes sync jobs (same as manual sync)

### Why Separate Cron Worker?
OpenNext doesn't support `scheduled()` function. Cron functionality must be in separate worker.

See: [Workers](../architecture/workers.md)

## Cron Worker (`workers/cron.ts`)

Runs every hour at minute 0:
```typescript
export default {
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    const response = await fetch(
      'https://ansible.hultberg.org/api/cron/auto-sync',
      {
        method: 'GET',
        headers: {
          'x-cron-secret': env.CRON_SECRET,
        },
      }
    );
    const result = await response.json();
    console.log('[Cron] Auto-sync completed:', result);
  },
};
```

**Schedule:** `0 * * * *` (every hour)

## Auto-Sync Endpoint (`/api/cron/auto-sync`)

### Security
Validates `x-cron-secret` header matches `CRON_SECRET` env var.

### Logic
```typescript
1. Validate CRON_SECRET
2. Query users due for sync:
   SELECT * FROM users
   WHERE sync_interval > 0
     AND (last_auto_sync_at IS NULL
          OR last_auto_sync_at < NOW() - (sync_interval || ' hours')::INTERVAL)

3. For each user:
   a. Trigger sync (same as manual sync)
   b. Update last_auto_sync_at = NOW()
   c. Log result

4. Return summary:
   {
     users_processed: 5,
     syncs_triggered: 4,
     errors: 1
   }
```

## Database Schema

### users Table Extensions
```sql
ALTER TABLE users
ADD COLUMN sync_interval INTEGER DEFAULT 0,
ADD COLUMN last_auto_sync_at TIMESTAMP WITH TIME ZONE;
```

**Migration:** `20260324_add_auto_sync_settings.sql`

## Use Cases

### Example: 4-Hour Sync Interval
User sets `sync_interval = 4`:
- First sync: Immediately (last_auto_sync_at is NULL)
- Subsequent syncs: Every 4 hours

### Disabled Auto-Sync
User sets `sync_interval = 0`:
- Excluded from cron queries
- Must sync manually

### Variable Intervals
- User A: Every 2 hours (frequent updates)
- User B: Every 24 hours (daily digest)
- User C: Disabled (manual only)

## Performance

### Hourly Load
- Cron runs every hour
- Only processes users due for sync
- Syncs run async (queue consumer)
- No impact on manual syncs

### Scaling
- Efficient query (indexed columns)
- Parallel sync triggers
- Queue batching handles load

## Monitoring

### Cron Worker Logs
```bash
npx wrangler tail ansible-ai-reader-cron
```

**Example Output:**
```
[Cron] Auto-sync triggered
[Cron] Auto-sync completed: {users_processed: 5, syncs_triggered: 4}
```

### Main Worker Logs
```bash
npx wrangler tail
```

**Filter for auto-sync:**
```
[Cron] Processing auto-sync for 5 users
[Cron] User user-123: Sync triggered
```

## Troubleshooting

### Syncs Not Triggering
- Verify cron worker is deployed
- Check CRON_SECRET matches
- Verify cron schedule in wrangler-cron.toml

### Wrong Sync Frequency
- Check user's sync_interval setting
- Verify last_auto_sync_at is being updated
- Check timezone handling

### Failed Syncs
- Check Reader API access
- Verify user's Reader token is valid
- Check queue consumer is running

## Related Documentation
- [Settings](./settings.md) - Configuring sync interval
- [Reader Sync](./reader-sync.md) - How sync works
- [Workers](../architecture/workers.md) - 3-worker architecture
- [Deployment](../operations/deployment.md) - Deploying cron worker
