// ABOUT: Tests for SummariesContent component
// ABOUT: Validates item loading, sync + tag-regeneration flows with status polling, retry/dismiss of failed items, card callbacks (archive, note, rating, regenerate, commentariat, click-through), and deep-link hash scrolling

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import SummariesContent from './SummariesContent';

vi.mock('@/components/Header', () => ({
  default: (props: any) => (
    <div data-testid="header">
      <span>{props.userEmail}</span>
      <span data-testid="is-syncing">{String(props.isSyncing)}</span>
      <span data-testid="is-regenerating">{String(props.isRegenerating)}</span>
      <span data-testid="is-admin">{String(props.isAdmin)}</span>
      <button onClick={props.onSync}>sync</button>
      {props.showRegenerateTags && <button onClick={props.onRegenerateTags}>regenerate-tags</button>}
    </div>
  ),
}));

vi.mock('@/components/EmptyState', () => ({
  default: () => <div data-testid="empty-state">No items</div>,
}));

vi.mock('@/components/ProgressBar', () => ({
  default: (props: any) => (
    <div data-testid="progress-bar">
      {props.title} {props.completed}/{props.total} (failed {props.failed})
    </div>
  ),
}));

// Stub SummaryCard: exposes buttons wired to the callback props and surfaces any rejection so
// the "re-throw so SummaryCard can handle it" contract is observable.
vi.mock('@/components/SummaryCard', async () => {
  const { useState } = await import('react');
  function SummaryCardStub(props: any) {
      const [cardError, setCardError] = useState<string | null>(null);
      const run = (fn: () => Promise<void> | void) => async () => {
        try {
          await fn();
        } catch (e) {
          setCardError(e instanceof Error ? e.message : String(e));
        }
      };
      return (
        <div id={props.id} data-testid={`card-${props.id}`}>
          <span data-testid="title">{props.title}</span>
          <span data-testid="summary">{props.summary}</span>
          <span data-testid="tags">{props.tags.join(',')}</span>
          <span data-testid="note">{props.documentNote ?? ''}</span>
          <span data-testid="rating">{String(props.rating)}</span>
          <span data-testid="commentariat">{props.commentariatSummary ?? ''}</span>
          <span data-testid="commentariat-at">{props.commentariatGeneratedAt ?? ''}</span>
          <span data-testid="truncated">{String(props.contentTruncated)}</span>
          <span data-testid="author">{String(props.author)}</span>
          <span data-testid="wordcount">{String(props.wordCount)}</span>
          {cardError && <span data-testid="card-error">{cardError}</span>}
          <button onClick={run(() => props.onArchive(props.id))}>archive</button>
          <button onClick={run(() => props.onSaveNote(props.id, 'my note'))}>save-note</button>
          <button onClick={run(() => props.onSaveRating(props.id, 5))}>save-rating</button>
          <button onClick={run(() => props.onRegenerateSummary(props.id))}>regen-summary</button>
          <button onClick={run(() => props.onGenerateCommentariat(props.id))}>gen-commentariat</button>
          <button onClick={() => props.onClickThrough?.(props.id)}>click-through</button>
        </div>
      );
  }
  return { default: SummaryCardStub };
});

type RouteHandler = (init?: RequestInit) => Promise<any> | any;

const jsonResponse = (body: unknown, ok = true, status = ok ? 200 : 500) => ({
  ok,
  status,
  json: async () => body,
});

const item = (overrides: Record<string, unknown> = {}) => ({
  id: 'item-1',
  reader_id: 'r1',
  title: 'First Article',
  author: 'Alice',
  source: 'example.com',
  url: 'https://example.com/1',
  word_count: 1200,
  short_summary: 'Summary one',
  tags: ['ai', 'reading'],
  perplexity_model: 'sonar-pro',
  content_truncated: false,
  document_note: null,
  rating: null,
  commentariat_summary: null,
  commentariat_generated_at: null,
  created_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

const defaultItems = [
  item(),
  item({
    id: 'item-2',
    title: 'Second Article',
    author: null,
    word_count: null,
    short_summary: null,
    tags: null,
    url: 'https://example.com/2',
  }),
];

let routes: Record<string, RouteHandler>;
const originalFetch = global.fetch;

function setRoutes(overrides: Record<string, RouteHandler>) {
  routes = { ...routes, ...overrides };
}

function fetchImpl(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input);
  const path = url.split('?')[0];
  const handler = routes[path];
  if (!handler) {
    return Promise.reject(new Error(`No route mocked for ${url}`));
  }
  return Promise.resolve(handler(init));
}

const fetchCalls = () => (global.fetch as any).mock.calls as Array<[string, RequestInit?]>;
const callsTo = (path: string) => fetchCalls().filter(([url]) => String(url).split('?')[0] === path);

// Flush pending promise chains (fetch -> json -> setState) using a real macrotask.
const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

// Sync and regenerate polling use setInterval; only fake that so waitFor's own timers stay real.
const fakeIntervals = () => vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });

// Faking setTimeout would also freeze RTL's waitFor, so the 3s auto-clear timers are captured via
// a pass-through spy and fired by hand instead.
const spyTimeouts = () => vi.spyOn(globalThis, 'setTimeout');
const fireTimeoutsOf = (ms: number) =>
  act(async () => {
    (globalThis.setTimeout as any).mock.calls
      .filter((args: unknown[]) => args[1] === ms)
      .forEach((args: unknown[]) => (args[0] as () => void)());
  });

const tick = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

async function renderWithItems(items: unknown[] = defaultItems) {
  setRoutes({ '/api/reader/items': () => jsonResponse({ items }) });
  const utils = render(<SummariesContent userEmail="test@example.com" />);
  await waitFor(() => expect(screen.queryByText('Loading summaries...')).not.toBeInTheDocument());
  return utils;
}

const card = (id: string) => within(screen.getByTestId(`card-${id}`));

// Drives a sync through to a given final status. Leaves fake intervals active.
async function runSyncTo(finalStatus: Record<string, unknown>) {
  fakeIntervals();
  setRoutes({
    '/api/reader/sync': () => jsonResponse({ syncId: 'sync-1', totalItems: 3 }),
    '/api/reader/status': () => jsonResponse({ syncId: 'sync-1', ...finalStatus }),
  });
  await renderWithItems();
  fireEvent.click(screen.getByText('sync'));
  await flush();
  await tick(2000);
  await flush();
}

async function runRegenerateTo(finalStatus: Record<string, unknown>) {
  fakeIntervals();
  setRoutes({
    '/api/reader/regenerate-tags': () => jsonResponse({ regenerateId: 'regen-1', totalItems: 2 }),
    '/api/reader/regenerate-tags-status': () => jsonResponse({ regenerateId: 'regen-1', ...finalStatus }),
  });
  await renderWithItems();
  fireEvent.click(screen.getByText('regenerate-tags'));
  await flush();
  await tick(2000);
  await flush();
}

describe('SummariesContent', () => {
  beforeEach(() => {
    routes = { '/api/reader/items': () => jsonResponse({ items: defaultItems }) };
    global.fetch = vi.fn(fetchImpl) as any;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    window.location.hash = '';
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    global.fetch = originalFetch;
    delete (Element.prototype as any).scrollIntoView;
  });

  // --- Loading items ---

  describe('loading items', () => {
    it('shows a loading state, then renders a card per item with mapped props', async () => {
      setRoutes({ '/api/reader/items': () => jsonResponse({ items: defaultItems }) });
      render(<SummariesContent userEmail="test@example.com" isAdmin />);
      expect(screen.getByText('Loading summaries...')).toBeInTheDocument();

      await waitFor(() => expect(screen.getByTestId('card-item-1')).toBeInTheDocument());
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
      expect(screen.getByTestId('is-admin')).toHaveTextContent('true');

      expect(card('item-1').getByTestId('summary')).toHaveTextContent('Summary one');
      expect(card('item-1').getByTestId('tags')).toHaveTextContent('ai,reading');
      expect(card('item-1').getByTestId('author')).toHaveTextContent('Alice');
      expect(card('item-1').getByTestId('wordcount')).toHaveTextContent('1200');

      // Null fields fall back to defaults
      expect(card('item-2').getByTestId('summary')).toHaveTextContent('No summary available');
      expect(card('item-2').getByTestId('tags')).toHaveTextContent('');
      expect(card('item-2').getByTestId('author')).toHaveTextContent('undefined');
      expect(card('item-2').getByTestId('wordcount')).toHaveTextContent('undefined');
    });

    it('defaults isAdmin to false', async () => {
      await renderWithItems();
      expect(screen.getByTestId('is-admin')).toHaveTextContent('false');
    });

    it('renders EmptyState when there are no items', async () => {
      await renderWithItems([]);
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });

    it('treats a response without an items array as empty', async () => {
      setRoutes({ '/api/reader/items': () => jsonResponse({}) });
      render(<SummariesContent userEmail="test@example.com" />);
      await waitFor(() => expect(screen.getByTestId('empty-state')).toBeInTheDocument());
    });

    it('shows an error when items fail to load', async () => {
      setRoutes({ '/api/reader/items': () => jsonResponse({}, false) });
      render(<SummariesContent userEmail="test@example.com" />);
      await waitFor(() => expect(screen.getByText('Error: Failed to load items')).toBeInTheDocument());
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });

    it('shows "Unknown error" when the failure is not an Error instance', async () => {
      setRoutes({ '/api/reader/items': () => Promise.reject('boom') });
      render(<SummariesContent userEmail="test@example.com" />);
      await waitFor(() => expect(screen.getByText('Error: Unknown error')).toBeInTheDocument());
    });

    it('shows the regenerate-tags action only when some item lacks tags', async () => {
      await renderWithItems();
      expect(screen.getByText('regenerate-tags')).toBeInTheDocument();
    });

    it('hides the regenerate-tags action when every item has tags', async () => {
      await renderWithItems([item()]);
      expect(screen.queryByText('regenerate-tags')).not.toBeInTheDocument();
    });
  });

  // --- Deep-link hash scrolling ---

  describe('hash deep links', () => {
    it('scrolls the matching card into view once items have loaded', async () => {
      const scrollIntoView = vi.fn();
      (Element.prototype as any).scrollIntoView = scrollIntoView;
      window.location.hash = '#item-2';

      await renderWithItems();

      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' }));
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
    });

    it('does not scroll when there is no hash', async () => {
      const scrollIntoView = vi.fn();
      (Element.prototype as any).scrollIntoView = scrollIntoView;

      await renderWithItems();
      await flush();

      expect(scrollIntoView).not.toHaveBeenCalled();
    });

    it('does not scroll when the hash matches no card', async () => {
      const scrollIntoView = vi.fn();
      (Element.prototype as any).scrollIntoView = scrollIntoView;
      window.location.hash = '#missing';

      await renderWithItems();
      await flush();

      expect(scrollIntoView).not.toHaveBeenCalled();
    });

    it('tolerates environments where scrollIntoView is unavailable', async () => {
      window.location.hash = '#item-1';
      await renderWithItems();
      await flush();
      expect(screen.getByTestId('card-item-1')).toBeInTheDocument();
    });
  });

  // --- Sync ---

  describe('sync', () => {
    it('starts a sync and shows the progress bar while polling', async () => {
      fakeIntervals();
      setRoutes({
        '/api/reader/sync': () => jsonResponse({ syncId: 'sync-1', totalItems: 3 }),
        '/api/reader/status': () =>
          jsonResponse({
            syncId: 'sync-1',
            totalJobs: 3,
            completedJobs: 1,
            failedJobs: 0,
            inProgressJobs: 1,
            pendingJobs: 1,
            status: 'processing',
          }),
      });
      await renderWithItems();

      fireEvent.click(screen.getByText('sync'));
      await flush();

      expect(screen.getByTestId('is-syncing')).toHaveTextContent('true');
      expect(screen.getByTestId('progress-bar')).toHaveTextContent('Sync Progress 0/3 (failed 0)');
      expect(callsTo('/api/reader/sync')[0][1]).toMatchObject({ method: 'POST' });

      await tick(2000);
      await flush();

      expect(screen.getByTestId('progress-bar')).toHaveTextContent('Sync Progress 1/3 (failed 0)');
      expect(fetchCalls().some(([url]) => String(url) === '/api/reader/status?syncId=sync-1')).toBe(true);
      // Still processing, so polling continues
      expect(screen.getByTestId('is-syncing')).toHaveTextContent('true');
    });

    it('shows the up-to-date message when the sync has no jobs and reloads items', async () => {
      await runSyncTo({
        totalJobs: 0,
        completedJobs: 0,
        failedJobs: 0,
        inProgressJobs: 0,
        pendingJobs: 0,
        status: 'completed',
      });

      expect(screen.getByText('✅ No unsynced items. Ansible is up to date!')).toBeInTheDocument();
      expect(screen.getByTestId('is-syncing')).toHaveTextContent('false');
      expect(screen.queryByTestId('progress-bar')).not.toBeInTheDocument();
      expect(callsTo('/api/reader/items').length).toBe(2);
    });

    it('shows the completed message with the processed count', async () => {
      await runSyncTo({
        totalJobs: 3,
        completedJobs: 3,
        failedJobs: 0,
        inProgressJobs: 0,
        pendingJobs: 0,
        status: 'completed',
      });

      expect(screen.getByText('✅ Sync completed! 3 items processed.')).toBeInTheDocument();
      expect(screen.queryByText(/Retry Failed/)).not.toBeInTheDocument();
    });

    it('shows partial failure with retry button and failed items list', async () => {
      await runSyncTo({
        totalJobs: 3,
        completedJobs: 2,
        failedJobs: 1,
        inProgressJobs: 0,
        pendingJobs: 0,
        status: 'partial_failure',
        failedItems: [{ itemId: 'item-9', title: 'Broken', error: 'Timeout' }],
      });

      expect(
        screen.getByText('⚠️ Sync completed with 1 failures. 2 items processed successfully.')
      ).toBeInTheDocument();
      expect(screen.getByText('Retry Failed (1)')).toBeInTheDocument();
      expect(screen.getByText('Failed items:')).toBeInTheDocument();
      expect(screen.getByText('Broken:')).toBeInTheDocument();
      expect(screen.getByText('Timeout')).toBeInTheDocument();
    });

    it('shows the failed message when the whole sync fails', async () => {
      await runSyncTo({
        totalJobs: 3,
        completedJobs: 0,
        failedJobs: 3,
        inProgressJobs: 0,
        pendingJobs: 0,
        status: 'failed',
      });

      expect(screen.getByText('❌ Sync failed. 3 items failed to process.')).toBeInTheDocument();
      expect(screen.getByText('Retry Failed (3)')).toBeInTheDocument();
    });

    it('surfaces the server error when starting a sync fails', async () => {
      setRoutes({ '/api/reader/sync': () => jsonResponse({ error: 'Reader token missing' }, false) });
      await renderWithItems();

      fireEvent.click(screen.getByText('sync'));

      await waitFor(() => expect(screen.getByText('Error: Reader token missing')).toBeInTheDocument());
      expect(screen.getByTestId('is-syncing')).toHaveTextContent('false');
    });

    it('reports an unknown error when the sync request rejects with a non-Error', async () => {
      setRoutes({ '/api/reader/sync': () => Promise.reject('nope') });
      await renderWithItems();

      fireEvent.click(screen.getByText('sync'));

      await waitFor(() => expect(screen.getByText('Error: Unknown error')).toBeInTheDocument());
      expect(screen.getByTestId('is-syncing')).toHaveTextContent('false');
    });

    it('falls back to a generic message when the sync error body has no error field', async () => {
      setRoutes({ '/api/reader/sync': () => jsonResponse({}, false) });
      await renderWithItems();

      fireEvent.click(screen.getByText('sync'));

      await waitFor(() => expect(screen.getByText('Error: Sync failed')).toBeInTheDocument());
    });

    it('stops polling with an error when status fetch returns non-ok', async () => {
      fakeIntervals();
      setRoutes({
        '/api/reader/sync': () => jsonResponse({ syncId: 'sync-1', totalItems: 3 }),
        '/api/reader/status': () => jsonResponse({}, false),
      });
      await renderWithItems();
      fireEvent.click(screen.getByText('sync'));
      await flush();
      await tick(2000);
      await flush();

      expect(screen.getByText('Error: Failed to fetch sync status')).toBeInTheDocument();
      expect(screen.getByTestId('is-syncing')).toHaveTextContent('false');
    });

    it('reports an unknown error when status polling rejects with a non-Error', async () => {
      fakeIntervals();
      setRoutes({
        '/api/reader/sync': () => jsonResponse({ syncId: 'sync-1', totalItems: 3 }),
        '/api/reader/status': () => Promise.reject('nope'),
      });
      await renderWithItems();
      fireEvent.click(screen.getByText('sync'));
      await flush();
      await tick(2000);
      await flush();

      expect(screen.getByText('Error: Unknown error')).toBeInTheDocument();
    });
  });

  // --- Retry failed sync jobs ---

  describe('retry failed sync', () => {
    const partialFailure = {
      totalJobs: 3,
      completedJobs: 2,
      failedJobs: 1,
      inProgressJobs: 0,
      pendingJobs: 0,
      status: 'partial_failure',
    };

    it('posts the syncId and resumes polling', async () => {
      await runSyncTo(partialFailure);
      setRoutes({ '/api/reader/retry': () => jsonResponse({ retriedCount: 1 }) });

      fireEvent.click(screen.getByText('Retry Failed (1)'));
      await flush();

      const retryCall = callsTo('/api/reader/retry')[0];
      expect(retryCall[1]).toMatchObject({ method: 'POST' });
      expect(JSON.parse(retryCall[1]!.body as string)).toEqual({ syncId: 'sync-1' });
      expect(screen.getByTestId('is-syncing')).toHaveTextContent('true');
      expect(screen.getByTestId('progress-bar')).toHaveTextContent('Sync Progress 2/3 (failed 0)');
    });

    it('shows the server error when retry fails', async () => {
      await runSyncTo(partialFailure);
      setRoutes({ '/api/reader/retry': () => jsonResponse({ error: 'Nothing to retry' }, false) });

      fireEvent.click(screen.getByText('Retry Failed (1)'));
      await flush();

      expect(screen.getByText('Error: Nothing to retry')).toBeInTheDocument();
      expect(screen.getByTestId('is-syncing')).toHaveTextContent('false');
    });

    it('falls back to a generic message when retry error body is empty', async () => {
      await runSyncTo(partialFailure);
      setRoutes({ '/api/reader/retry': () => jsonResponse({}, false) });

      fireEvent.click(screen.getByText('Retry Failed (1)'));
      await flush();

      expect(screen.getByText('Error: Retry failed')).toBeInTheDocument();
    });

    it('reports an unknown error when retry rejects with a non-Error', async () => {
      await runSyncTo(partialFailure);
      setRoutes({ '/api/reader/retry': () => Promise.reject('nope') });

      fireEvent.click(screen.getByText('Retry Failed (1)'));
      await flush();

      expect(screen.getByText('Error: Unknown error')).toBeInTheDocument();
      expect(screen.getByTestId('is-syncing')).toHaveTextContent('false');
    });
  });

  // --- Dismiss failed items ---

  describe('dismiss failed items', () => {
    const failedSync = {
      totalJobs: 3,
      completedJobs: 2,
      failedJobs: 1,
      inProgressJobs: 0,
      pendingJobs: 0,
      status: 'partial_failure',
      failedItems: [{ itemId: 'item-9', title: 'Broken', error: 'Timeout' }],
    };

    it('removes the item from the sync failed list and clears the message after 3s', async () => {
      await runSyncTo(failedSync);
      spyTimeouts();
      setRoutes({ '/api/reader/dismiss-failed': () => jsonResponse({ success: true }) });

      fireEvent.click(screen.getByTitle('Dismiss this failed item'));

      await waitFor(() => expect(screen.getByText('✅ Failed item dismissed')).toBeInTheDocument());
      const dismissCall = callsTo('/api/reader/dismiss-failed')[0];
      expect(JSON.parse(dismissCall[1]!.body as string)).toEqual({ itemId: 'item-9' });
      expect(screen.queryByText('Broken:')).not.toBeInTheDocument();
      expect(screen.queryByText(/Retry Failed/)).not.toBeInTheDocument();
      expect(screen.getByText('⚠️ Sync completed with 0 failures. 2 items processed successfully.')).toBeInTheDocument();

      await fireTimeoutsOf(3000);
      expect(screen.queryByText('✅ Failed item dismissed')).not.toBeInTheDocument();
    });

    it('shows a disabled "Dismissing..." state while the request is in flight', async () => {
      await runSyncTo(failedSync);
      let resolveDismiss: (value: unknown) => void = () => {};
      setRoutes({
        '/api/reader/dismiss-failed': () => new Promise((resolve) => (resolveDismiss = resolve)),
      });

      fireEvent.click(screen.getByTitle('Dismiss this failed item'));

      await waitFor(() => expect(screen.getByText('Dismissing...')).toBeDisabled());

      await act(async () => {
        resolveDismiss(jsonResponse({ success: true }));
      });
      await waitFor(() => expect(screen.getByText('✅ Failed item dismissed')).toBeInTheDocument());
    });

    it('shows an error when dismissing fails and keeps the item listed', async () => {
      await runSyncTo(failedSync);
      setRoutes({ '/api/reader/dismiss-failed': () => jsonResponse({ error: 'Not yours' }, false) });

      fireEvent.click(screen.getByTitle('Dismiss this failed item'));

      await waitFor(() => expect(screen.getByText('Error: Not yours')).toBeInTheDocument());
      expect(screen.getByText('Broken:')).toBeInTheDocument();
      expect(screen.getByText('Dismiss')).not.toBeDisabled();
    });

    it('falls back to a generic message when the dismiss error body is empty', async () => {
      await runSyncTo(failedSync);
      setRoutes({ '/api/reader/dismiss-failed': () => jsonResponse({}, false) });

      fireEvent.click(screen.getByTitle('Dismiss this failed item'));

      await waitFor(() => expect(screen.getByText('Error: Failed to dismiss item')).toBeInTheDocument());
    });

    it('reports an unknown error when dismiss rejects with a non-Error', async () => {
      await runSyncTo(failedSync);
      setRoutes({ '/api/reader/dismiss-failed': () => Promise.reject('nope') });

      fireEvent.click(screen.getByTitle('Dismiss this failed item'));

      await waitFor(() => expect(screen.getByText('Error: Unknown error')).toBeInTheDocument());
      expect(screen.getByText('Dismiss')).not.toBeDisabled();
    });

    it('removes the item from the regenerate failed list when no sync status exists', async () => {
      await runRegenerateTo({
        totalJobs: 2,
        completedJobs: 1,
        failedJobs: 1,
        inProgressJobs: 0,
        pendingJobs: 0,
        status: 'partial_failure',
        failedItems: [{ itemId: 'item-9', title: 'Broken tags', error: 'Model error' }],
      });
      setRoutes({ '/api/reader/dismiss-failed': () => jsonResponse({ success: true }) });

      fireEvent.click(screen.getByTitle('Dismiss this failed item'));

      await waitFor(() => expect(screen.getByText('✅ Failed item dismissed')).toBeInTheDocument());
      expect(JSON.parse(callsTo('/api/reader/dismiss-failed')[0][1]!.body as string)).toEqual({ itemId: 'item-9' });
      expect(screen.queryByText('Broken tags:')).not.toBeInTheDocument();
      expect(screen.queryByText(/Retry Failed/)).not.toBeInTheDocument();
      expect(
        screen.getByText('⚠️ Tag regeneration completed with 0 failures. 1 items processed successfully.')
      ).toBeInTheDocument();
    });

    it('removes the item from both sync and regenerate failed lists when both are present', async () => {
      await runSyncTo(failedSync);
      setRoutes({
        '/api/reader/regenerate-tags': () => jsonResponse({ regenerateId: 'regen-1', totalItems: 2 }),
        '/api/reader/regenerate-tags-status': () =>
          jsonResponse({
            regenerateId: 'regen-1',
            totalJobs: 2,
            completedJobs: 1,
            failedJobs: 1,
            inProgressJobs: 0,
            pendingJobs: 0,
            status: 'partial_failure',
            failedItems: [{ itemId: 'item-9', title: 'Broken tags', error: 'Model error' }],
          }),
        '/api/reader/dismiss-failed': () => jsonResponse({ success: true }),
      });

      fireEvent.click(screen.getByText('regenerate-tags'));
      await flush();
      await tick(2000);
      await flush();

      expect(screen.getByText('Broken:')).toBeInTheDocument();
      expect(screen.getByText('Broken tags:')).toBeInTheDocument();
      expect(screen.getAllByTitle('Dismiss this failed item')).toHaveLength(2);

      fireEvent.click(screen.getAllByTitle('Dismiss this failed item')[0]);
      await flush();

      expect(screen.queryByText('Broken:')).not.toBeInTheDocument();
      expect(screen.queryByText('Broken tags:')).not.toBeInTheDocument();
      expect(
        screen.getByText('⚠️ Tag regeneration completed with 0 failures. 1 items processed successfully.')
      ).toBeInTheDocument();
    });
  });

  // --- Regenerate tags ---

  describe('regenerate tags', () => {
    it('starts regeneration and shows progress while polling', async () => {
      fakeIntervals();
      setRoutes({
        '/api/reader/regenerate-tags': () => jsonResponse({ regenerateId: 'regen-1', totalItems: 2 }),
        '/api/reader/regenerate-tags-status': () =>
          jsonResponse({
            regenerateId: 'regen-1',
            totalJobs: 2,
            completedJobs: 1,
            failedJobs: 0,
            inProgressJobs: 1,
            pendingJobs: 0,
            status: 'processing',
          }),
      });
      await renderWithItems();

      fireEvent.click(screen.getByText('regenerate-tags'));
      await flush();

      expect(screen.getByTestId('is-regenerating')).toHaveTextContent('true');
      expect(screen.getByTestId('progress-bar')).toHaveTextContent('Tag Regeneration Progress 0/2 (failed 0)');

      await tick(2000);
      await flush();

      expect(screen.getByTestId('progress-bar')).toHaveTextContent('Tag Regeneration Progress 1/2 (failed 0)');
      expect(
        fetchCalls().some(([url]) => String(url) === '/api/reader/regenerate-tags-status?regenerateId=regen-1')
      ).toBe(true);
    });

    it('shows the no-items message when nothing needed regeneration', async () => {
      await runRegenerateTo({
        totalJobs: 0,
        completedJobs: 0,
        failedJobs: 0,
        inProgressJobs: 0,
        pendingJobs: 0,
        status: 'completed',
      });

      expect(screen.getByText('✅ No items need tag regeneration.')).toBeInTheDocument();
      expect(screen.getByTestId('is-regenerating')).toHaveTextContent('false');
      expect(callsTo('/api/reader/items').length).toBe(2);
    });

    it('shows the success message with the count and can be dismissed', async () => {
      await runRegenerateTo({
        totalJobs: 2,
        completedJobs: 2,
        failedJobs: 0,
        inProgressJobs: 0,
        pendingJobs: 0,
        status: 'completed',
      });

      expect(screen.getByText('✅ Successfully regenerated tags for 2 items.')).toBeInTheDocument();

      fireEvent.click(screen.getByLabelText('Dismiss'));
      expect(screen.queryByText('✅ Successfully regenerated tags for 2 items.')).not.toBeInTheDocument();
    });

    it('shows partial failure with retry and failed items', async () => {
      await runRegenerateTo({
        totalJobs: 2,
        completedJobs: 1,
        failedJobs: 1,
        inProgressJobs: 0,
        pendingJobs: 0,
        status: 'partial_failure',
        failedItems: [{ itemId: 'item-9', title: 'Broken tags', error: 'Model error' }],
      });

      expect(
        screen.getByText('⚠️ Tag regeneration completed with 1 failures. 1 items processed successfully.')
      ).toBeInTheDocument();
      expect(screen.getByText('Retry Failed (1)')).toBeInTheDocument();
      expect(screen.getByText('Broken tags:')).toBeInTheDocument();
      expect(screen.getByText('Model error')).toBeInTheDocument();
    });

    it('shows the failed message when regeneration fails entirely', async () => {
      await runRegenerateTo({
        totalJobs: 2,
        completedJobs: 0,
        failedJobs: 2,
        inProgressJobs: 0,
        pendingJobs: 0,
        status: 'failed',
      });

      expect(screen.getByText('❌ Tag regeneration failed. 2 items failed to process.')).toBeInTheDocument();
    });

    it('surfaces the server error when starting regeneration fails', async () => {
      setRoutes({ '/api/reader/regenerate-tags': () => jsonResponse({ error: 'Quota exceeded' }, false) });
      await renderWithItems();

      fireEvent.click(screen.getByText('regenerate-tags'));

      await waitFor(() => expect(screen.getByText('Error: Quota exceeded')).toBeInTheDocument());
      expect(screen.getByTestId('is-regenerating')).toHaveTextContent('false');
    });

    it('reports an unknown error when the regenerate request rejects with a non-Error', async () => {
      setRoutes({ '/api/reader/regenerate-tags': () => Promise.reject('nope') });
      await renderWithItems();

      fireEvent.click(screen.getByText('regenerate-tags'));

      await waitFor(() => expect(screen.getByText('Error: Unknown error')).toBeInTheDocument());
      expect(screen.getByTestId('is-regenerating')).toHaveTextContent('false');
    });

    it('falls back to a generic message when the regenerate error body is empty', async () => {
      setRoutes({ '/api/reader/regenerate-tags': () => jsonResponse({}, false) });
      await renderWithItems();

      fireEvent.click(screen.getByText('regenerate-tags'));

      await waitFor(() => expect(screen.getByText('Error: Tag regeneration failed')).toBeInTheDocument());
    });

    it('stops polling with an error when the regenerate status fetch fails', async () => {
      fakeIntervals();
      setRoutes({
        '/api/reader/regenerate-tags': () => jsonResponse({ regenerateId: 'regen-1', totalItems: 2 }),
        '/api/reader/regenerate-tags-status': () => jsonResponse({}, false),
      });
      await renderWithItems();
      fireEvent.click(screen.getByText('regenerate-tags'));
      await flush();
      await tick(2000);
      await flush();

      expect(screen.getByText('Error: Failed to fetch regenerate status')).toBeInTheDocument();
      expect(screen.getByTestId('is-regenerating')).toHaveTextContent('false');
    });

    it('reports an unknown error when regenerate polling rejects with a non-Error', async () => {
      fakeIntervals();
      setRoutes({
        '/api/reader/regenerate-tags': () => jsonResponse({ regenerateId: 'regen-1', totalItems: 2 }),
        '/api/reader/regenerate-tags-status': () => Promise.reject('nope'),
      });
      await renderWithItems();
      fireEvent.click(screen.getByText('regenerate-tags'));
      await flush();
      await tick(2000);
      await flush();

      expect(screen.getByText('Error: Unknown error')).toBeInTheDocument();
    });
  });

  // --- Retry failed tag regeneration ---

  describe('retry failed tag regeneration', () => {
    const partialFailure = {
      totalJobs: 2,
      completedJobs: 1,
      failedJobs: 1,
      inProgressJobs: 0,
      pendingJobs: 0,
      status: 'partial_failure',
    };

    it('posts the regenerateId and resumes polling', async () => {
      await runRegenerateTo(partialFailure);
      setRoutes({ '/api/reader/retry': () => jsonResponse({ retriedCount: 1 }) });

      fireEvent.click(screen.getByText('Retry Failed (1)'));
      await flush();

      const retryCall = callsTo('/api/reader/retry')[0];
      expect(JSON.parse(retryCall[1]!.body as string)).toEqual({ regenerateId: 'regen-1' });
      expect(screen.getByTestId('is-regenerating')).toHaveTextContent('true');
      expect(screen.getByTestId('progress-bar')).toHaveTextContent('Tag Regeneration Progress 1/2 (failed 0)');
    });

    it('shows the server error when retry fails', async () => {
      await runRegenerateTo(partialFailure);
      setRoutes({ '/api/reader/retry': () => jsonResponse({ error: 'Nothing to retry' }, false) });

      fireEvent.click(screen.getByText('Retry Failed (1)'));
      await flush();

      expect(screen.getByText('Error: Nothing to retry')).toBeInTheDocument();
      expect(screen.getByTestId('is-regenerating')).toHaveTextContent('false');
    });

    it('falls back to a generic message when retry error body is empty', async () => {
      await runRegenerateTo(partialFailure);
      setRoutes({ '/api/reader/retry': () => jsonResponse({}, false) });

      fireEvent.click(screen.getByText('Retry Failed (1)'));
      await flush();

      expect(screen.getByText('Error: Retry failed')).toBeInTheDocument();
    });

    it('reports an unknown error when retry rejects with a non-Error', async () => {
      await runRegenerateTo(partialFailure);
      setRoutes({ '/api/reader/retry': () => Promise.reject('nope') });

      fireEvent.click(screen.getByText('Retry Failed (1)'));
      await flush();

      expect(screen.getByText('Error: Unknown error')).toBeInTheDocument();
      expect(screen.getByTestId('is-regenerating')).toHaveTextContent('false');
    });
  });

  // --- Archive ---

  describe('archive', () => {
    it('removes the card on success', async () => {
      setRoutes({ '/api/reader/archive': () => jsonResponse({ success: true }) });
      await renderWithItems();

      fireEvent.click(card('item-1').getByText('archive'));

      await waitFor(() => expect(screen.queryByTestId('card-item-1')).not.toBeInTheDocument());
      expect(screen.getByTestId('card-item-2')).toBeInTheDocument();
      const archiveCall = callsTo('/api/reader/archive')[0];
      expect(archiveCall[1]).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json' } });
      expect(JSON.parse(archiveCall[1]!.body as string)).toEqual({ itemId: 'item-1' });
      expect(screen.queryByText(/already deleted in Reader/)).not.toBeInTheDocument();
    });

    it('shows feedback when the item was already deleted in Reader', async () => {
      setRoutes({ '/api/reader/archive': () => jsonResponse({ success: true, readerDeleted: true }) });
      await renderWithItems();

      fireEvent.click(card('item-1').getByText('archive'));

      await waitFor(() =>
        expect(screen.getByText('✅ Archived (already deleted in Reader)')).toBeInTheDocument()
      );
      expect(screen.queryByTestId('card-item-1')).not.toBeInTheDocument();
    });

    it('shows the server error and keeps the card on failure', async () => {
      setRoutes({ '/api/reader/archive': () => jsonResponse({ error: 'Reader unreachable' }, false) });
      await renderWithItems();

      fireEvent.click(card('item-1').getByText('archive'));

      await waitFor(() => expect(screen.getByText('Error: Reader unreachable')).toBeInTheDocument());
      expect(screen.getByTestId('card-item-1')).toBeInTheDocument();
    });

    it('reports an unknown error when archive rejects with a non-Error', async () => {
      setRoutes({ '/api/reader/archive': () => Promise.reject('nope') });
      await renderWithItems();

      fireEvent.click(card('item-1').getByText('archive'));

      await waitFor(() => expect(screen.getByText('Error: Unknown error')).toBeInTheDocument());
      expect(screen.getByTestId('card-item-1')).toBeInTheDocument();
    });

    it('falls back to a generic message when the archive error body is empty', async () => {
      setRoutes({ '/api/reader/archive': () => jsonResponse({}, false) });
      await renderWithItems();

      fireEvent.click(card('item-1').getByText('archive'));

      await waitFor(() => expect(screen.getByText('Error: Archive failed')).toBeInTheDocument());
    });
  });

  // --- Notes ---

  describe('save note', () => {
    it('updates the card with the server-returned note and clears the message after 3s', async () => {
      spyTimeouts();
      setRoutes({ '/api/reader/note': () => jsonResponse({ success: true, note: 'server note' }) });
      await renderWithItems();

      fireEvent.click(card('item-1').getByText('save-note'));

      await waitFor(() => expect(screen.getByText('✅ Note saved successfully')).toBeInTheDocument());
      expect(card('item-1').getByTestId('note')).toHaveTextContent('server note');
      expect(card('item-2').getByTestId('note')).toHaveTextContent('');
      const noteCall = callsTo('/api/reader/note')[0];
      expect(JSON.parse(noteCall[1]!.body as string)).toEqual({ itemId: 'item-1', note: 'my note' });

      await fireTimeoutsOf(3000);
      expect(screen.queryByText('✅ Note saved successfully')).not.toBeInTheDocument();
    });

    it('falls back to the submitted note when the server returns none', async () => {
      setRoutes({ '/api/reader/note': () => jsonResponse({ success: true }) });
      await renderWithItems();

      fireEvent.click(card('item-1').getByText('save-note'));

      await waitFor(() => expect(card('item-1').getByTestId('note')).toHaveTextContent('my note'));
    });

    it('keeps the note locally and explains when Reader sync failed (502)', async () => {
      setRoutes({ '/api/reader/note': () => jsonResponse({ error: 'Reader sync failed' }, false, 502) });
      await renderWithItems();

      fireEvent.click(card('item-1').getByText('save-note'));

      await waitFor(() =>
        expect(screen.getByText(/Note saved locally\. Reader sync failed/)).toBeInTheDocument()
      );
      expect(card('item-1').getByTestId('note')).toHaveTextContent('my note');
      expect(card('item-1').queryByTestId('card-error')).not.toBeInTheDocument();
    });

    it('re-throws other failures so the card can handle them', async () => {
      setRoutes({ '/api/reader/note': () => jsonResponse({ error: 'Note too long' }, false, 400) });
      await renderWithItems();

      fireEvent.click(card('item-1').getByText('save-note'));

      await waitFor(() => expect(card('item-1').getByTestId('card-error')).toHaveTextContent('Note too long'));
      expect(card('item-1').getByTestId('note')).toHaveTextContent('');
      expect(screen.queryByText(/^Error:/)).not.toBeInTheDocument();
    });

    it('uses a generic message when the note error body is empty', async () => {
      setRoutes({ '/api/reader/note': () => jsonResponse({}, false, 400) });
      await renderWithItems();

      fireEvent.click(card('item-1').getByText('save-note'));

      await waitFor(() =>
        expect(card('item-1').getByTestId('card-error')).toHaveTextContent('Failed to save note')
      );
    });
  });

  // --- Ratings ---

  describe('save rating', () => {
    it('updates the card rating on success', async () => {
      setRoutes({ '/api/reader/rating': () => jsonResponse({ success: true }) });
      await renderWithItems();

      fireEvent.click(card('item-1').getByText('save-rating'));

      await waitFor(() => expect(card('item-1').getByTestId('rating')).toHaveTextContent('5'));
      expect(card('item-2').getByTestId('rating')).toHaveTextContent('null');
      const ratingCall = callsTo('/api/reader/rating')[0];
      expect(JSON.parse(ratingCall[1]!.body as string)).toEqual({ itemId: 'item-1', rating: 5 });
    });

    it('re-throws the server error so the card can handle it', async () => {
      setRoutes({ '/api/reader/rating': () => jsonResponse({ error: 'Invalid rating' }, false, 400) });
      await renderWithItems();

      fireEvent.click(card('item-1').getByText('save-rating'));

      await waitFor(() => expect(card('item-1').getByTestId('card-error')).toHaveTextContent('Invalid rating'));
      expect(card('item-1').getByTestId('rating')).toHaveTextContent('null');
    });

    it('uses a generic message when the rating error body is empty', async () => {
      setRoutes({ '/api/reader/rating': () => jsonResponse({}, false, 400) });
      await renderWithItems();

      fireEvent.click(card('item-1').getByText('save-rating'));

      await waitFor(() =>
        expect(card('item-1').getByTestId('card-error')).toHaveTextContent('Failed to save rating')
      );
    });
  });

  // --- Click-through signal ---

  describe('click-through signal', () => {
    it('fires a POST to the signal endpoint', async () => {
      setRoutes({ '/api/reader/signal': () => jsonResponse({ success: true }) });
      await renderWithItems();

      fireEvent.click(card('item-2').getByText('click-through'));

      await waitFor(() => expect(callsTo('/api/reader/signal')).toHaveLength(1));
      const signalCall = callsTo('/api/reader/signal')[0];
      expect(signalCall[1]).toMatchObject({ method: 'POST' });
      expect(JSON.parse(signalCall[1]!.body as string)).toEqual({ itemId: 'item-2' });
    });

    it('logs and swallows a network failure without surfacing an error', async () => {
      setRoutes({ '/api/reader/signal': () => Promise.reject(new Error('offline')) });
      await renderWithItems();

      fireEvent.click(card('item-1').getByText('click-through'));

      await waitFor(() =>
        expect(console.error).toHaveBeenCalledWith('[Signal] Failed to record click_through:', expect.any(Error))
      );
      expect(screen.queryByText(/^Error:/)).not.toBeInTheDocument();
    });
  });

  // --- Regenerate summary ---

  describe('regenerate summary', () => {
    it('applies the new summary, tags, and truncation flag to the card', async () => {
      setRoutes({
        '/api/reader/regenerate-summary': () =>
          jsonResponse({ summary: 'Fresh summary', tags: ['new'], contentTruncated: true }),
      });
      await renderWithItems();

      fireEvent.click(card('item-1').getByText('regen-summary'));

      await waitFor(() => expect(card('item-1').getByTestId('summary')).toHaveTextContent('Fresh summary'));
      expect(card('item-1').getByTestId('tags')).toHaveTextContent('new');
      expect(card('item-1').getByTestId('truncated')).toHaveTextContent('true');
      expect(card('item-2').getByTestId('summary')).toHaveTextContent('No summary available');
      const call = callsTo('/api/reader/regenerate-summary')[0];
      expect(JSON.parse(call[1]!.body as string)).toEqual({ itemId: 'item-1' });
    });

    it('keeps existing values for fields the server omits', async () => {
      setRoutes({ '/api/reader/regenerate-summary': () => jsonResponse({}) });
      await renderWithItems();

      fireEvent.click(card('item-1').getByText('regen-summary'));

      await waitFor(() => expect(callsTo('/api/reader/regenerate-summary')).toHaveLength(1));
      await flush();
      expect(card('item-1').getByTestId('summary')).toHaveTextContent('Summary one');
      expect(card('item-1').getByTestId('tags')).toHaveTextContent('ai,reading');
      expect(card('item-1').getByTestId('truncated')).toHaveTextContent('false');
    });

    it('throws the server error to the card', async () => {
      setRoutes({ '/api/reader/regenerate-summary': () => jsonResponse({ error: 'Perplexity down' }, false) });
      await renderWithItems();

      fireEvent.click(card('item-1').getByText('regen-summary'));

      await waitFor(() =>
        expect(card('item-1').getByTestId('card-error')).toHaveTextContent('Perplexity down')
      );
    });

    it('uses a generic message when the error body is empty', async () => {
      setRoutes({ '/api/reader/regenerate-summary': () => jsonResponse({}, false) });
      await renderWithItems();

      fireEvent.click(card('item-1').getByText('regen-summary'));

      await waitFor(() =>
        expect(card('item-1').getByTestId('card-error')).toHaveTextContent('Failed to regenerate summary')
      );
    });
  });

  // --- Commentariat ---

  describe('generate commentariat', () => {
    it('stores the analysis and timestamp on the card', async () => {
      setRoutes({
        '/api/reader/commentariat': () =>
          jsonResponse({ commentariat: 'The pundits say...', generatedAt: '2026-02-02T00:00:00Z' }),
      });
      await renderWithItems();

      fireEvent.click(card('item-2').getByText('gen-commentariat'));

      await waitFor(() =>
        expect(card('item-2').getByTestId('commentariat')).toHaveTextContent('The pundits say...')
      );
      expect(card('item-2').getByTestId('commentariat-at')).toHaveTextContent('2026-02-02T00:00:00Z');
      expect(card('item-1').getByTestId('commentariat')).toHaveTextContent('');
      const call = callsTo('/api/reader/commentariat')[0];
      expect(JSON.parse(call[1]!.body as string)).toEqual({ itemId: 'item-2' });
    });

    it('nulls the fields when the server returns none', async () => {
      setRoutes({ '/api/reader/commentariat': () => jsonResponse({}) });
      await renderWithItems([item({ commentariat_summary: 'old', commentariat_generated_at: 'then' })]);

      expect(card('item-1').getByTestId('commentariat')).toHaveTextContent('old');

      fireEvent.click(card('item-1').getByText('gen-commentariat'));

      await waitFor(() => expect(callsTo('/api/reader/commentariat')).toHaveLength(1));
      await flush();
      expect(card('item-1').getByTestId('commentariat')).toHaveTextContent('');
      expect(card('item-1').getByTestId('commentariat-at')).toHaveTextContent('');
    });

    it('throws the server error to the card', async () => {
      setRoutes({ '/api/reader/commentariat': () => jsonResponse({ error: 'No sources found' }, false) });
      await renderWithItems();

      fireEvent.click(card('item-1').getByText('gen-commentariat'));

      await waitFor(() =>
        expect(card('item-1').getByTestId('card-error')).toHaveTextContent('No sources found')
      );
    });

    it('uses a generic message when the error body is empty', async () => {
      setRoutes({ '/api/reader/commentariat': () => jsonResponse({}, false) });
      await renderWithItems();

      fireEvent.click(card('item-1').getByText('gen-commentariat'));

      await waitFor(() =>
        expect(card('item-1').getByTestId('card-error')).toHaveTextContent('Failed to generate analysis')
      );
    });
  });
});
