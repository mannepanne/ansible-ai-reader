// ABOUT: Tests for SettingsContent component
// ABOUT: Validates sync interval + custom prompt UI, tab navigation, save/reset behaviour, character counter

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsContent from './SettingsContent';

vi.mock('@/components/Header', () => ({
  default: ({ userEmail }: { userEmail: string }) => <div data-testid="header">{userEmail}</div>,
}));

global.fetch = vi.fn();

const defaultFetchResponse = (overrides = {}) =>
  Promise.resolve({
    ok: true,
    json: async () => ({ sync_interval: 2, summary_prompt: null, ...overrides }),
  });

describe('SettingsContent', () => {
  beforeEach(() => {
    vi.resetAllMocks(); // resetAllMocks (not clearAllMocks) also wipes mockImplementationOnce queues
    (global.fetch as any).mockImplementation(() => defaultFetchResponse());
  });

  it('renders the settings heading', async () => {
    render(<SettingsContent userEmail="test@example.com" />);
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('loads and displays saved sync interval', async () => {
    render(<SettingsContent userEmail="test@example.com" />);
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toHaveValue('2');
    });
  });

  // --- Tab navigation ---

  it('renders Custom Prompt and Full Prompt tabs', async () => {
    render(<SettingsContent userEmail="test@example.com" />);
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /custom prompt/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /full prompt/i })).toBeInTheDocument();
    });
  });

  it('shows Custom Prompt tab as active by default', async () => {
    render(<SettingsContent userEmail="test@example.com" />);
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /custom prompt/i })).toBeInTheDocument();
    });
  });

  it('switches to Full Prompt tab and shows system message content', async () => {
    render(<SettingsContent userEmail="test@example.com" />);
    await waitFor(() => screen.getByRole('tab', { name: /full prompt/i }));

    fireEvent.click(screen.getByRole('tab', { name: /full prompt/i }));

    await waitFor(() => {
      expect(screen.getByText(/evidence-driven/i)).toBeInTheDocument();
    });
  });

  it('shows user message template with readable placeholders on Full Prompt tab', async () => {
    render(<SettingsContent userEmail="test@example.com" />);
    await waitFor(() => screen.getByRole('tab', { name: /full prompt/i }));

    fireEvent.click(screen.getByRole('tab', { name: /full prompt/i }));

    await waitFor(() => {
      expect(screen.getByText(/\[Article Title\]/i)).toBeInTheDocument();
      expect(screen.getByText(/\[Article Content\]/i)).toBeInTheDocument();
    });
  });

  it('hides the textarea when Full Prompt tab is active', async () => {
    render(<SettingsContent userEmail="test@example.com" />);
    await waitFor(() => screen.getByRole('tab', { name: /full prompt/i }));

    fireEvent.click(screen.getByRole('tab', { name: /full prompt/i }));

    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: /custom prompt/i })).not.toBeInTheDocument();
    });
  });

  it('switches back to Custom Prompt tab', async () => {
    render(<SettingsContent userEmail="test@example.com" />);
    await waitFor(() => screen.getByRole('tab', { name: /full prompt/i }));

    fireEvent.click(screen.getByRole('tab', { name: /full prompt/i }));
    fireEvent.click(screen.getByRole('tab', { name: /custom prompt/i }));

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /custom prompt/i })).toBeInTheDocument();
    });
  });

  // --- Custom Prompt tab behaviour ---

  it('displays custom prompt textarea', async () => {
    render(<SettingsContent userEmail="test@example.com" />);
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /custom prompt/i })).toBeInTheDocument();
    });
  });

  it('pre-fills textarea with saved prompt', async () => {
    (global.fetch as any).mockImplementation(() =>
      defaultFetchResponse({ summary_prompt: 'I am interested in AI and product management.' })
    );

    render(<SettingsContent userEmail="test@example.com" />);

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /custom prompt/i })).toHaveValue(
        'I am interested in AI and product management.'
      );
    });
  });

  it('shows empty textarea when no prompt is saved', async () => {
    render(<SettingsContent userEmail="test@example.com" />);

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /custom prompt/i })).toHaveValue('');
    });
  });

  it('shows character counter that updates as user types', async () => {
    const user = userEvent.setup();
    render(<SettingsContent userEmail="test@example.com" />);

    await waitFor(() => screen.getByRole('textbox', { name: /custom prompt/i }));

    const textarea = screen.getByRole('textbox', { name: /custom prompt/i });
    await user.type(textarea, 'Hello');

    expect(screen.getByText(/5\s*\/\s*2000/)).toBeInTheDocument();
  });

  it('shows info text that custom prompt is prepended to the full prompt', async () => {
    render(<SettingsContent userEmail="test@example.com" />);

    await waitFor(() => {
      expect(screen.getByText(/prepended to the full prompt/i)).toBeInTheDocument();
    });
  });

  it('shows info text that prompt only affects new summaries', async () => {
    render(<SettingsContent userEmail="test@example.com" />);

    await waitFor(() => {
      expect(screen.getByText(/only affects new summaries/i)).toBeInTheDocument();
    });
  });

  it('saves both sync interval and summary prompt together', async () => {
    const user = userEvent.setup();
    (global.fetch as any)
      .mockImplementationOnce(() => defaultFetchResponse())
      .mockImplementationOnce(() => Promise.resolve({ ok: true, json: async () => ({ success: true }) }));

    render(<SettingsContent userEmail="test@example.com" />);

    await waitFor(() => screen.getByRole('textbox', { name: /custom prompt/i }));

    const textarea = screen.getByRole('textbox', { name: /custom prompt/i });
    await user.type(textarea, 'I like reading about technology and science.');

    fireEvent.click(screen.getByRole('button', { name: /save settings/i }));

    await waitFor(() => {
      const patchCall = (global.fetch as any).mock.calls.find(
        (call: any[]) => call[1]?.method === 'PATCH'
      );
      expect(patchCall).toBeTruthy();
      const body = JSON.parse(patchCall[1].body);
      expect(body.sync_interval).toBe(2);
      expect(body.summary_prompt).toBe('I like reading about technology and science.');
    });
  });

  it('sends null for summary_prompt when reset to default', async () => {
    (global.fetch as any)
      .mockImplementationOnce(() =>
        defaultFetchResponse({ summary_prompt: 'My custom prompt here.' })
      )
      .mockImplementationOnce(() => Promise.resolve({ ok: true, json: async () => ({ success: true }) }));

    render(<SettingsContent userEmail="test@example.com" />);

    await waitFor(() => screen.getByRole('button', { name: /reset to default/i }));

    fireEvent.click(screen.getByRole('button', { name: /reset to default/i }));

    await waitFor(() => {
      const patchCall = (global.fetch as any).mock.calls.find(
        (call: any[]) => call[1]?.method === 'PATCH'
      );
      expect(patchCall).toBeTruthy();
      const body = JSON.parse(patchCall[1].body);
      expect(body.summary_prompt).toBeNull();
    });
  });

  it('clears textarea after reset to default', async () => {
    (global.fetch as any)
      .mockImplementationOnce(() =>
        defaultFetchResponse({ summary_prompt: 'My custom prompt here.' })
      )
      .mockImplementationOnce(() => Promise.resolve({ ok: true, json: async () => ({ success: true }) }));

    render(<SettingsContent userEmail="test@example.com" />);

    await waitFor(() => screen.getByRole('button', { name: /reset to default/i }));
    fireEvent.click(screen.getByRole('button', { name: /reset to default/i }));

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /custom prompt/i })).toHaveValue('');
    });
  });

  it('shows validation error for prompt under 10 characters', async () => {
    const user = userEvent.setup();
    (global.fetch as any)
      .mockImplementationOnce(() => defaultFetchResponse())
      .mockImplementationOnce(() => Promise.resolve({ ok: true, json: async () => ({ success: true }) }));

    render(<SettingsContent userEmail="test@example.com" />);

    await waitFor(() => screen.getByRole('textbox', { name: /custom prompt/i }));

    const textarea = screen.getByRole('textbox', { name: /custom prompt/i });
    await user.type(textarea, 'Too short');

    fireEvent.click(screen.getByRole('button', { name: /save settings/i }));

    await waitFor(() => {
      expect(screen.getByText(/at least 10 characters/i)).toBeInTheDocument();
    });
  });

  it('shows success message after save', async () => {
    (global.fetch as any)
      .mockImplementationOnce(() => defaultFetchResponse())
      .mockImplementationOnce(() => Promise.resolve({ ok: true, json: async () => ({ success: true }) }));

    render(<SettingsContent userEmail="test@example.com" />);

    await waitFor(() => screen.getByRole('button', { name: /save settings/i }));
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }));

    await waitFor(() => {
      expect(screen.getByText(/settings saved/i)).toBeInTheDocument();
    });
  });

  it('shows error message when save fails', async () => {
    (global.fetch as any)
      .mockImplementationOnce(() => defaultFetchResponse())
      .mockImplementationOnce(() => Promise.resolve({ ok: false }));

    render(<SettingsContent userEmail="test@example.com" />);

    await waitFor(() => screen.getByRole('button', { name: /save settings/i }));
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }));

    await waitFor(() => {
      expect(screen.getByText(/failed to save/i)).toBeInTheDocument();
    });
  });
});
