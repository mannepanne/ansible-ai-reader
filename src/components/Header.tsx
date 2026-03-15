// ABOUT: Header component for authenticated pages
// ABOUT: Dark header bar with branding, sync button, user info, and logout

'use client';

import Link from 'next/link';

interface HeaderProps {
  userEmail: string;
  showSync?: boolean;
  onSync?: () => void;
  isSyncing?: boolean;
}

export default function Header({
  userEmail,
  showSync = false,
  onSync,
  isSyncing = false,
}: HeaderProps) {
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

      {/* User email */}
      <span
        style={{
          color: '#adb5bd',
          fontSize: '0.85em',
          marginRight: '12px',
        }}
      >
        {userEmail}
      </span>

      {/* Logout button */}
      <button
        onClick={handleLogout}
        style={{
          background: 'transparent',
          border: '1px solid #6c757d',
          color: '#adb5bd',
          padding: '4px 12px',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '0.85em',
        }}
      >
        Logout
      </button>
    </header>
  );
}
