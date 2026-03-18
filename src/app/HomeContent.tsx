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

  const [showLogin, setShowLogin] = useState(false);

  // If authenticated or login form requested, show the old experience
  if (isAuthenticated || showLogin) {
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
              Enter your email address and we&apos;ll send you a secure login
              link. The link will expire in 15 minutes and can only be used
              once.
            </p>
          </div>
        </>
      )}
    </div>
    );
  }

  // Landing page for non-authenticated users
  return (
    <div
      style={{
        fontFamily: 'Georgia, "Times New Roman", Times, serif',
        lineHeight: 1.6,
        color: '#000',
        maxWidth: '800px',
        margin: '0 auto',
        padding: '40px 40px',
      }}
    >
      {/* Ansible Symbol */}
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <svg
          width="400"
          height="120"
          viewBox="0 0 400 120"
          style={{ maxWidth: '100%', height: 'auto' }}
        >
          {/* Left node - Question */}
          <circle cx="60" cy="60" r="35" fill="none" stroke="#666" strokeWidth="2" />
          <text
            x="60"
            y="72"
            textAnchor="middle"
            fontFamily="Georgia, serif"
            fontSize="48"
            fill="#666"
          >
            ?
          </text>

          {/* Transmission waves - instantaneous */}
          <path
            d="M 100 60 Q 150 30, 200 60 T 300 60"
            fill="none"
            stroke="#666"
            strokeWidth="2"
            strokeDasharray="5,5"
          />
          <path
            d="M 100 60 Q 150 90, 200 60 T 300 60"
            fill="none"
            stroke="#666"
            strokeWidth="2"
            strokeDasharray="5,5"
          />

          {/* Small nodes along the path - representing distributed knowledge */}
          <circle cx="150" cy="45" r="3" fill="#666" />
          <circle cx="200" cy="60" r="3" fill="#666" />
          <circle cx="250" cy="45" r="3" fill="#666" />

          {/* Right node - Answer/You */}
          <circle cx="340" cy="60" r="35" fill="none" stroke="#666" strokeWidth="2" />
          <text
            x="340"
            y="68"
            textAnchor="middle"
            fontFamily="Courier, monospace"
            fontSize="32"
            fill="#666"
          >
            ∴
          </text>
        </svg>
      </div>

      {/* Hero */}
      <div style={{ marginBottom: '40px' }}>
        <h1
          style={{
            fontSize: '1.5em',
            fontWeight: 'bold',
            marginBottom: '0.5em',
            lineHeight: 1.2,
          }}
        >
          Stop drowning in saved articles
        </h1>
        <p
          style={{
            fontSize: '1em',
            color: '#000',
            marginBottom: '0',
          }}
        >
          Ansible gives you AI-powered summaries of your Readwise library, so
          you can finally decide what deserves your attention.
        </p>
      </div>

      {/* The Problem */}
      <div style={{ marginBottom: '30px' }}>
        <h2
          style={{
            fontSize: '1.17em',
            fontWeight: 'bold',
            marginBottom: '0.5em',
          }}
        >
          The Problem
        </h2>
        <ul
          style={{
            fontSize: '1em',
            paddingLeft: '20px',
            listStyleType: 'none',
          }}
        >
          <li style={{ marginBottom: '0.5em' }}>
            → You save articles faster than you read them
          </li>
          <li style={{ marginBottom: '0.5em' }}>
            → Your reading list grows by hundreds while guilt grows by thousands
          </li>
          <li style={{ marginBottom: '0.5em' }}>
            → You need triage, not another productivity system
          </li>
        </ul>
      </div>

      {/* How It Works */}
      <div style={{ marginBottom: '30px' }}>
        <h2
          style={{
            fontSize: '1.17em',
            fontWeight: 'bold',
            marginBottom: '0.5em',
          }}
        >
          How It Works
        </h2>
        <ol
          style={{
            fontSize: '1em',
            paddingLeft: '20px',
          }}
        >
          <li style={{ marginBottom: '0.5em' }}>
            Sync your Readwise Reader library
          </li>
          <li style={{ marginBottom: '0.5em' }}>
            Get AI summaries of unread articles (Perplexity sonar-pro)
          </li>
          <li style={{ marginBottom: '0.5em' }}>
            Archive the fluff, read what matters
          </li>
        </ol>
      </div>

      {/* Key Features */}
      <div style={{ marginBottom: '30px' }}>
        <h2
          style={{
            fontSize: '1.17em',
            fontWeight: 'bold',
            marginBottom: '0.5em',
          }}
        >
          Key Features
        </h2>
        <ul
          style={{
            fontSize: '1em',
            paddingLeft: '20px',
            listStyleType: 'disc',
          }}
        >
          <li style={{ marginBottom: '0.5em' }}>
            AI summaries with smart tags
          </li>
          <li style={{ marginBottom: '0.5em' }}>
            Beautiful markdown rendering
          </li>
          <li style={{ marginBottom: '0.5em' }}>
            Two-way sync with Readwise Reader
          </li>
          <li style={{ marginBottom: '0.5em' }}>
            Zero cognitive overhead
          </li>
        </ul>
      </div>

      {/* Tech Stack */}
      <div style={{ marginBottom: '40px' }}>
        <h2
          style={{
            fontSize: '1.17em',
            fontWeight: 'bold',
            marginBottom: '0.5em',
          }}
        >
          Built With
        </h2>
        <p
          style={{
            fontSize: '0.9em',
            color: '#000',
            fontFamily: 'monospace',
          }}
        >
          Next.js 15 • React 19 • Cloudflare Workers • Perplexity AI • Supabase
          <br />
          240 tests • 95%+ coverage • TypeScript
        </p>
      </div>

      {/* Developer Login Link */}
      <div
        style={{
          paddingTop: '30px',
          borderTop: '1px solid #e0e0e0',
          textAlign: 'center',
        }}
      >
        <button
          type="button"
          onClick={() => {
            console.log('Developer login clicked');
            setShowLogin(true);
          }}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#0000EE',
            fontSize: '1em',
            cursor: 'pointer',
            textDecoration: 'underline',
            fontFamily: 'inherit',
            padding: '4px',
          }}
        >
          Developer login
        </button>
      </div>
    </div>
  );
}
