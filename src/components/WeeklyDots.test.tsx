// ABOUT: Tests for the weekly reading-day dots
// ABOUT: Renders from the API, hides the text when compact, renders nothing on failure

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import WeeklyDots from './WeeklyDots';

describe('WeeklyDots', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('renders seven dots and the week line from the API', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ days: [true, true, false, true, false, false, false], count: 3, target: 5 }),
    } as Response);

    render(<WeeklyDots />);

    await waitFor(() => expect(screen.getByRole('img', { name: '3 of 5 reading days this week' })).toBeInTheDocument());
    expect(screen.getAllByTestId('dot-filled')).toHaveLength(3);
    expect(screen.getAllByTestId('dot-empty')).toHaveLength(4);
    expect(screen.getByText('3 of 5 this week')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/fika/reading-days');
  });

  it('hides the text in compact mode', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ days: [false, false, false, false, false, false, false], count: 0, target: 5 }),
    } as Response);
    render(<WeeklyDots compact />);
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());
    expect(screen.queryByText(/this week/)).toBeNull();
  });

  it('renders nothing when the request fails, returns non-ok, or returns junk', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
    const { container, unmount } = render(<WeeklyDots />);
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
    unmount();

    vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response);
    const second = render(<WeeklyDots />);
    await new Promise((r) => setTimeout(r, 0));
    expect(second.container).toBeEmptyDOMElement();
    second.unmount();

    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ nope: true }) } as Response);
    const third = render(<WeeklyDots />);
    await new Promise((r) => setTimeout(r, 0));
    expect(third.container).toBeEmptyDOMElement();
  });
});
