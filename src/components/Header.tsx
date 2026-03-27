// ABOUT: Header component for authenticated pages
// ABOUT: Dark header bar with branding, sync button, user info, and logout

'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';

interface HeaderProps {
  userEmail: string;
  showSync?: boolean;
  onSync?: () => void;
  isSyncing?: boolean;
  showRegenerateTags?: boolean;
  onRegenerateTags?: () => void;
  isRegenerating?: boolean;
}

export default function Header({
  userEmail,
  showSync = false,
  onSync,
  isSyncing = false,
  showRegenerateTags = false,
  onRegenerateTags,
  isRegenerating = false,
}: HeaderProps) {
  const MOBILE_BREAKPOINT = 640;
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      // Guard against SSR (window undefined on server)
      if (typeof window === 'undefined') return;
      setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
    };

    // Check on mount
    checkMobile();

    // Add listener for window resize
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  };

  return (
    <header
        style={{
          background: '#212529',
          color: '#fff',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
        }}
      >
      {/* Branding */}
      <Link
        href="/"
        style={{
          fontWeight: 700,
          fontSize: '1.1em',
          flex: 1,
          color: '#fff',
          textDecoration: 'none',
        }}
      >
        Ansible AI Reader
      </Link>

      {/* Regenerate Tags button (orange, before Sync) */}
      {showRegenerateTags && (
        <button
          onClick={onRegenerateTags}
          disabled={isRegenerating}
          style={{
            background: isRegenerating ? '#6c757d' : '#ffc107',
            color: '#fff',
            padding: '6px 16px',
            fontSize: '0.9em',
            fontWeight: 600,
            border: 'none',
            borderRadius: '4px',
            cursor: isRegenerating ? 'not-allowed' : 'pointer',
          }}
        >
          {isRegenerating ? 'Processing...' : 'Regenerate Tags'}
        </button>
      )}

      {/* Sync button (only on summaries page) */}
      {showSync && (
        <button
          onClick={onSync}
          disabled={isSyncing}
          style={{
            background: isSyncing ? '#6c757d' : '#007bff',
            color: '#fff',
            padding: '6px 16px',
            fontSize: '0.9em',
            fontWeight: 600,
            border: 'none',
            borderRadius: '4px',
            cursor: isSyncing ? 'not-allowed' : 'pointer',
          }}
        >
          {isSyncing ? 'Syncing...' : 'Sync'}
        </button>
      )}

      {/* Settings link */}
      <Link
        href="/settings"
        style={{
          border: '1px solid #6c757d',
          color: '#adb5bd',
          padding: '6px 12px',
          borderRadius: '4px',
          textDecoration: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '0.85em',
        }}
        title="Settings"
      >
        <span>⚙️</span>
        {!isMobile && <span>Settings</span>}
      </Link>

      {/* User email - hidden on mobile */}
      {!isMobile && (
        <span
          style={{
            color: '#adb5bd',
            fontSize: '0.85em',
            marginRight: '12px',
          }}
        >
          {userEmail}
        </span>
      )}

      {/* Logout button */}
      <button
        onClick={handleLogout}
        style={{
          background: 'transparent',
          border: '1px solid #6c757d',
          color: '#adb5bd',
          padding: '6px 12px',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '0.85em',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        <span>➜</span>
        {!isMobile && <span>Logout</span>}
      </button>
    </header>
  );
}
