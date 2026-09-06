// ABOUT: Client form that posts a Fika action token as soon as it mounts
// ABOUT: The GET landing page is what link prefetchers see; only this POST performs the action

'use client';

import { useEffect, useRef } from 'react';

export default function AutoSubmitForm({ token }: { token: string }) {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    try {
      formRef.current?.requestSubmit();
    } catch {
      // Leave the button as the fallback
    }
  }, []);

  return (
    <form ref={formRef} method="post" action="/api/fika/act" style={{ margin: 0 }}>
      <input type="hidden" name="t" value={token} />
      <p style={{ margin: '0 0 16px', color: '#6c757d', fontSize: '14px' }}>One moment.</p>
      <button
        type="submit"
        style={{
          display: 'inline-block',
          padding: '11px 16px',
          border: '1px solid #ced4da',
          borderRadius: '6px',
          background: '#fff',
          color: '#212529',
          fontSize: '15px',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Continue
      </button>
    </form>
  );
}
