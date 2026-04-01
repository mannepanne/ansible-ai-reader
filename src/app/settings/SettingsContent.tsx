// ABOUT: Settings page client component with sync interval and summary prompt configuration
// ABOUT: Fetches and updates user settings via API

'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/Header';

interface SettingsContentProps {
  userEmail: string;
}

export default function SettingsContent({ userEmail }: SettingsContentProps) {
  const [syncInterval, setSyncInterval] = useState<number>(0);
  const [summaryPrompt, setSummaryPrompt] = useState<string>('');
  const [promptError, setPromptError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const MAX_PROMPT_LENGTH = 2000;

  // Load settings on mount
  useEffect(() => {
    async function loadSettings() {
      try {
        const response = await fetch('/api/settings');
        if (!response.ok) {
          throw new Error('Failed to load settings');
        }
        const data = (await response.json()) as {
          sync_interval: number;
          summary_prompt: string | null;
        };
        setSyncInterval(data.sync_interval);
        setSummaryPrompt(data.summary_prompt ?? '');
      } catch (error) {
        setMessage({
          type: 'error',
          text: 'Failed to load settings. Please refresh the page.',
        });
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, []);

  async function resetPromptToDefault() {
    setSummaryPrompt('');
    setPromptError(null);

    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sync_interval: syncInterval, summary_prompt: null }),
      });

      if (!response.ok) {
        throw new Error('Failed to save settings');
      }

      setMessage({ type: 'success', text: 'Settings saved successfully!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({
        type: 'error',
        text: 'Failed to save settings. Please try again.',
      });
    } finally {
      setSaving(false);
    }
  }

  async function saveSettings() {
    setPromptError(null);

    // Validate prompt: non-empty prompts must be at least 10 characters
    if (summaryPrompt.length > 0 && summaryPrompt.length < 10) {
      setPromptError('Prompt must be at least 10 characters.');
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sync_interval: syncInterval,
          summary_prompt: summaryPrompt.length > 0 ? summaryPrompt : null,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save settings');
      }

      setMessage({ type: 'success', text: 'Settings saved successfully!' });

      // Clear success message after 3 seconds
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({
        type: 'error',
        text: 'Failed to save settings. Please try again.',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Header userEmail={userEmail} />
      <main style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
        <h1 style={{ color: '#212529', marginBottom: '20px', fontSize: '1.5rem' }}>
          Settings
        </h1>

        {/* Success/Error messages */}
        {message && (
          <div
            style={{
              padding: '12px',
              borderRadius: '4px',
              marginBottom: '20px',
              background: message.type === 'success' ? '#d4edda' : '#f8d7da',
              color: message.type === 'success' ? '#155724' : '#721c24',
              border: message.type === 'success' ? '1px solid #c3e6cb' : '1px solid #f5c6cb',
            }}
          >
            {message.text}
          </div>
        )}

        {/* Settings form */}
        <div
          style={{
            background: '#fff',
            padding: '24px',
            borderRadius: '6px',
            boxShadow: '0 1px 3px rgba(0,0,0,.1)',
            border: '1px solid #dee2e6',
          }}
        >
          <label
            style={{
              display: 'block',
              marginBottom: '8px',
              color: '#212529',
              fontWeight: 600,
              fontSize: '0.95rem',
            }}
          >
            Automatic Sync Interval
          </label>
          <select
            value={syncInterval}
            onChange={(e) => setSyncInterval(Number(e.target.value))}
            disabled={loading || saving}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #ced4da',
              borderRadius: '4px',
              fontSize: '1em',
              boxSizing: 'border-box',
              marginBottom: '12px',
              cursor: loading || saving ? 'not-allowed' : 'pointer',
              backgroundColor: loading || saving ? '#e9ecef' : '#fff',
            }}
          >
            <option value={0}>Disabled</option>
            <option value={1}>Every hour</option>
            <option value={2}>Every 2 hours</option>
            <option value={3}>Every 3 hours</option>
            <option value={4}>Every 4 hours</option>
            <option value={6}>Every 6 hours</option>
            <option value={8}>Every 8 hours</option>
            <option value={12}>Every 12 hours</option>
            <option value={24}>Every 24 hours</option>
          </select>

          <p
            style={{
              fontSize: '0.9em',
              color: '#6c757d',
              marginBottom: '16px',
              lineHeight: '1.5',
            }}
          >
            {syncInterval === 0
              ? 'Auto-sync is disabled. You will need to sync manually.'
              : `Ansible will automatically sync new items every ${syncInterval} hour${syncInterval > 1 ? 's' : ''}.`}
          </p>

          {/* Summary Prompt */}
          <label
            htmlFor="summary-prompt"
            style={{
              display: 'block',
              marginBottom: '8px',
              color: '#212529',
              fontWeight: 600,
              fontSize: '0.95rem',
              marginTop: '24px',
            }}
          >
            Summary Prompt
          </label>
          <textarea
            id="summary-prompt"
            value={summaryPrompt}
            onChange={(e) => setSummaryPrompt(e.target.value.slice(0, MAX_PROMPT_LENGTH))}
            disabled={loading || saving}
            placeholder="Describe your interests or focus areas to personalise AI summaries..."
            rows={4}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: promptError ? '1px solid #dc3545' : '1px solid #ced4da',
              borderRadius: '4px',
              fontSize: '1em',
              boxSizing: 'border-box',
              resize: 'vertical',
              fontFamily: 'inherit',
              backgroundColor: loading || saving ? '#e9ecef' : '#fff',
            }}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: '8px',
            }}
          >
            <div>
              {promptError && (
                <p style={{ color: '#dc3545', fontSize: '0.875em', margin: 0 }}>
                  {promptError}
                </p>
              )}
              <p style={{ fontSize: '0.875em', color: '#6c757d', margin: 0, marginTop: promptError ? '4px' : 0 }}>
                This only affects new summaries — existing ones are unchanged.
              </p>
            </div>
            <span
              style={{
                fontSize: '0.875em',
                color: summaryPrompt.length > MAX_PROMPT_LENGTH * 0.9 ? '#dc3545' : '#6c757d',
                whiteSpace: 'nowrap',
                marginLeft: '8px',
                flexShrink: 0,
              }}
            >
              {summaryPrompt.length} / {MAX_PROMPT_LENGTH}
            </span>
          </div>

          {summaryPrompt.length === 0 ? null : (
            <button
              onClick={resetPromptToDefault}
              disabled={loading || saving}
              style={{
                background: 'none',
                border: '1px solid #6c757d',
                color: '#6c757d',
                padding: '6px 12px',
                borderRadius: '4px',
                cursor: loading || saving ? 'not-allowed' : 'pointer',
                fontSize: '0.9em',
                marginBottom: '12px',
              }}
            >
              Reset to Default
            </button>
          )}

          <button
            onClick={saveSettings}
            disabled={loading || saving}
            style={{
              width: '100%',
              background: loading || saving ? '#6c757d' : '#007bff',
              color: '#fff',
              padding: '10px 16px',
              borderRadius: '4px',
              border: 'none',
              cursor: loading || saving ? 'not-allowed' : 'pointer',
              fontSize: '1em',
              fontWeight: 600,
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => {
              if (!loading && !saving) {
                e.currentTarget.style.background = '#0056b3';
              }
            }}
            onMouseLeave={(e) => {
              if (!loading && !saving) {
                e.currentTarget.style.background = '#007bff';
              }
            }}
          >
            {loading ? 'Loading...' : saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </main>
    </>
  );
}
