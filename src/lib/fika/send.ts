// ABOUT: Sends the Fika email through the Resend REST API
// ABOUT: Same direct-fetch pattern the contact form uses; no SDK

export interface SendEmailInput {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type SendEmailResult =
  | { ok: true; id: string | null }
  | { ok: false; status: number | null; message: string };

export const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export async function sendViaResend(input: SendEmailInput): Promise<SendEmailResult> {
  let response: Response;
  try {
    response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `Ansible <${input.from}>`,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });
  } catch (error) {
    return { ok: false, status: null, message: error instanceof Error ? error.message : 'Network error' };
  }

  if (!response.ok) {
    let message = `Resend responded ${response.status}`;
    try {
      const body = (await response.json()) as { message?: string };
      if (body?.message) message = `${message}: ${body.message}`;
    } catch {
      // body was not JSON; keep the status message
    }
    return { ok: false, status: response.status, message };
  }

  try {
    const body = (await response.json()) as { id?: string };
    return { ok: true, id: body?.id ?? null };
  } catch {
    return { ok: true, id: null };
  }
}
