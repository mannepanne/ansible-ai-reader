// ABOUT: Client component for home page content
// ABOUT: Shows login form or welcome message based on auth state

'use client';

import { useState } from 'react';
import Link from 'next/link';

interface HomeContentProps {
  isAuthenticated: boolean;
  userEmail?: string;
}

export default function HomeContent({
  isAuthenticated,
  userEmail,
}: HomeContentProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, returnTo: '/summaries' }),
      });

      const data = (await response.json()) as { error?: string };

      if (response.ok) {
        setMessage({
          type: 'success',
          text: 'Check your email for the magic link!',
        });
        setEmail('');
      } else {
        setMessage({
          type: 'error',
          text: data.error || 'Failed to send magic link',
        });
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: 'An unexpected error occurred',
      });
    } finally {
      setLoading(false);
    }
  }

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.reload();
  };

  return (
    <div
      style={{
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
        lineHeight: 1.6,
        color: '#333',
        maxWidth: '500px',
        margin: '80px auto',
        padding: '20px',
      }}
    >
      {/* Welcome Section */}
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <h1
          style={{
            fontSize: '2em',
            marginBottom: '0.5em',
            color: '#212529',
          }}
        >
          Ansible AI Reader
        </h1>
        <p
          style={{
            fontSize: '1.1em',
            color: '#6c757d',
            marginBottom: '1em',
          }}
        >
          AI-powered reading triage for your Readwise library
        </p>
        <p style={{ color: '#495057', lineHeight: 1.5 }}>
          Get AI-generated summaries of your unread articles and decide what
          deserves your time. Powered by Perplexity AI.
        </p>
      </div>

      {/* Authenticated View */}
      {isAuthenticated ? (
        <div>
          <div
            style={{
              padding: '20px',
              background: '#d4edda',
              borderRadius: '4px',
              marginBottom: '20px',
              textAlign: 'center',
            }}
          >
            <p style={{ color: '#155724', margin: 0 }}>
              Welcome back, <strong>{userEmail}</strong>!
            </p>
          </div>

          <Link
            href="/summaries"
            style={{
              display: 'block',
              background: '#007bff',
              color: 'white',
              padding: '12px 30px',
              fontSize: '16px',
              fontWeight: 600,
              border: 'none',
              borderRadius: '4px',
              textAlign: 'center',
              textDecoration: 'none',
              marginBottom: '12px',
            }}
          >
            View Summaries
          </Link>

          <button
            onClick={handleLogout}
            style={{
              display: 'block',
              width: '100%',
              background: 'transparent',
              color: '#6c757d',
              padding: '8px 20px',
              fontSize: '14px',
              border: '1px solid #ced4da',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Logout
          </button>
        </div>
      ) : (
        /* Login Form */
        <>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '20px' }}>
              <label
                htmlFor="email"
                style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontWeight: 600,
                  color: '#495057',
                }}
              >
                Email Address
              </label>
              <input
                type="email"
                id="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '12px',
                  fontSize: '16px',
                  border: '1px solid #ced4da',
                  borderRadius: '4px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {message && (
              <div
                style={{
                  padding: '12px',
                  borderRadius: '4px',
                  marginBottom: '20px',
                  background:
                    message.type === 'success' ? '#d4edda' : '#f8d7da',
                  color: message.type === 'success' ? '#155724' : '#dc3545',
                }}
              >
                {message.text}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                background: loading ? '#6c757d' : '#007bff',
                color: 'white',
                padding: '12px 30px',
                fontSize: '16px',
                fontWeight: 600,
                border: 'none',
                borderRadius: '4px',
                cursor: loading ? 'not-allowed' : 'pointer',
                width: '100%',
              }}
            >
              {loading ? 'Sending...' : 'Send Login Link'}
            </button>
          </form>

          <div
            style={{
              marginTop: '30px',
              padding: '15px',
              background: '#f8f9fa',
              borderRadius: '4px',
              fontSize: '14px',
              color: '#6c757d',
            }}
          >
            <p style={{ margin: '0 0 8px 0' }}>
              <strong>How it works:</strong>
            </p>
            <p style={{ margin: 0 }}>
              Enter your email address and we'll send you a secure login link.
              The link will expire in 15 minutes and can only be used once.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
