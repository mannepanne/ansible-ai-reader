// @vitest-environment node
// ABOUT: Tests for the Resend sender
// ABOUT: Request shape, success, error classes, network failure, non-JSON bodies

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendViaResend, RESEND_ENDPOINT } from './send';

const input = {
  apiKey: 'key',
  from: 'fika@example.com',
  to: 'me@example.com',
  subject: 'Subject',
  html: '<p>hi</p>',
  text: 'hi',
};

describe('sendViaResend', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('posts the email to Resend with the Ansible sender and returns the id', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 'msg-1' }) } as Response);

    const result = await sendViaResend(input);

    expect(result).toEqual({ ok: true, id: 'msg-1' });
    expect(fetch).toHaveBeenCalledWith(RESEND_ENDPOINT, expect.objectContaining({ method: 'POST' }));
    const call = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect((call.headers as Record<string, string>).Authorization).toBe('Bearer key');
    expect(JSON.parse(call.body as string)).toEqual({
      from: 'Ansible <fika@example.com>',
      to: ['me@example.com'],
      subject: 'Subject',
      html: '<p>hi</p>',
      text: 'hi',
    });
  });

  it('returns the status and Resend message on failure', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 429, json: async () => ({ message: 'Too many' }) } as Response);
    expect(await sendViaResend(input)).toEqual({ ok: false, status: 429, message: 'Resend responded 429: Too many' });
  });

  it('copes with a non-JSON error body and a non-JSON success body', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500, json: async () => { throw new Error('nope'); } } as unknown as Response);
    expect(await sendViaResend(input)).toEqual({ ok: false, status: 500, message: 'Resend responded 500' });

    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, json: async () => { throw new Error('nope'); } } as unknown as Response);
    expect(await sendViaResend(input)).toEqual({ ok: true, id: null });
  });

  it('reports a network failure as ok:false with no status', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNRESET'));
    expect(await sendViaResend(input)).toEqual({ ok: false, status: null, message: 'ECONNRESET' });
    vi.mocked(fetch).mockRejectedValue('weird');
    expect(await sendViaResend(input)).toEqual({ ok: false, status: null, message: 'Network error' });
  });
});
