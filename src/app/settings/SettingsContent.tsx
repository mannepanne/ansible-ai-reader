// ABOUT: Settings page client component with sync interval configuration
// ABOUT: Fetches and updates user settings via API

'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/Header';

interface SettingsContentProps {
  userEmail: string;
}

export default function SettingsContent({ userEmail }: SettingsContentProps) {
  const [syncInterval, setSyncInterval] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

  async function saveSettings() {
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sync_interval: syncInterval }),
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
