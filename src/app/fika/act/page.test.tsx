// ABOUT: Tests for the Fika action landing page and its auto-submitting form
// ABOUT: Renders the form with the token, submits on mount, and shows a friendly state without a token

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import FikaActPage from './page';
import AutoSubmitForm from './AutoSubmitForm';

describe('FikaActPage', () => {
  beforeEach(() => {
    HTMLFormElement.prototype.requestSubmit = vi.fn();
    sessionStorage.clear();
  });

  it('renders a POST form carrying the token and submits it on mount', async () => {
    const ui = await FikaActPage({ searchParams: Promise.resolve({ t: 'abc.def' }) });
    render(ui);

    const button = screen.getByRole('button', { name: 'Continue' });
    const form = button.closest('form') as HTMLFormElement;
    expect(form).toHaveAttribute('method', 'post');
    expect(form).toHaveAttribute('action', '/api/fika/act');
    expect(form.querySelector('input[name="t"]')).toHaveValue('abc.def');
    expect(HTMLFormElement.prototype.requestSubmit).toHaveBeenCalledTimes(1);
  });

  it('takes the first token when the parameter repeats', async () => {
    const ui = await FikaActPage({ searchParams: Promise.resolve({ t: ['first', 'second'] }) });
    render(ui);
    expect(document.querySelector('input[name="t"]')).toHaveValue('first');
  });

  it('shows a friendly message when there is no token', async () => {
    const ui = await FikaActPage({ searchParams: Promise.resolve({}) });
    render(ui);
    expect(screen.getByText('Missing link')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Ansible' })).toHaveAttribute('href', '/summaries');
    expect(document.querySelector('form')).toBeNull();
  });

  it('auto-submits a token only once per session, then shows the button instead', () => {
    const { unmount } = render(<AutoSubmitForm token="same" />);
    expect(HTMLFormElement.prototype.requestSubmit).toHaveBeenCalledTimes(1);
    unmount();
    render(<AutoSubmitForm token="same" />);
    expect(HTMLFormElement.prototype.requestSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
    render(<AutoSubmitForm token="different" />);
    expect(HTMLFormElement.prototype.requestSubmit).toHaveBeenCalledTimes(2);
  });

  it('still submits when session storage is unavailable', () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error('blocked');
    };
    try {
      render(<AutoSubmitForm token="x" />);
      expect(HTMLFormElement.prototype.requestSubmit).toHaveBeenCalledTimes(1);
    } finally {
      Storage.prototype.getItem = original;
    }
  });

  it('keeps the button as a fallback when requestSubmit throws', () => {
    HTMLFormElement.prototype.requestSubmit = vi.fn(() => {
      throw new Error('not implemented');
    });
    render(<AutoSubmitForm token="x" />);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
  });
});
