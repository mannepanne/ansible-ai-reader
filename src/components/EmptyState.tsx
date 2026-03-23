// ABOUT: Empty state component for when all items are processed
// ABOUT: Shows reversed Ansible symbol with "transmission complete" message

'use client';

import { useId } from 'react';

export default function EmptyState() {
  const glowId = useId();
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '80px 24px',
        background: '#fff',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,.1)',
      }}
    >
      {/* Reversed Ansible Symbol - Knowledge flowing outward */}
      <div style={{ marginBottom: '40px' }}>
        <svg
          width="400"
          height="120"
          viewBox="0 0 400 120"
          style={{ maxWidth: '100%', height: 'auto', margin: '0 auto' }}
          role="img"
          aria-label="Ansible symbol: knowledge flowing outward from you to the world"
        >
          <title>Transmission Complete</title>
          <desc>
            The ansible symbol showing knowledge flowing outward - you've
            absorbed the information and are ready to transmit it to the world
          </desc>

          {/* Define glow filter for the right circle */}
          <defs>
            <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Left node - Question (consumed) */}
          <circle
            cx="60"
            cy="60"
            r="35"
            fill="none"
            stroke="#ccc"
            strokeWidth="2"
          />
          <text
            x="60"
            y="72"
            textAnchor="middle"
            fontFamily="Georgia, serif"
            fontSize="48"
            fill="#ccc"
          >
            ?
          </text>

          {/* Transmission waves - flowing outward (reversed) */}
          <path
            d="M 300 60 Q 250 30, 200 60 T 100 60"
            fill="none"
            stroke="#4a90e2"
            strokeWidth="2"
            strokeDasharray="5,5"
            opacity="0.6"
          />
          <path
            d="M 300 60 Q 250 90, 200 60 T 100 60"
            fill="none"
            stroke="#4a90e2"
            strokeWidth="2"
            strokeDasharray="5,5"
            opacity="0.6"
          />

          {/* Small nodes along the path - knowledge transmission */}
          <circle cx="250" cy="45" r="3" fill="#4a90e2" opacity="0.8" />
          <circle cx="200" cy="60" r="3" fill="#4a90e2" opacity="0.8" />
          <circle cx="150" cy="45" r="3" fill="#4a90e2" opacity="0.8" />

          {/* Right node - You (glowing, active) */}
          <circle
            cx="340"
            cy="60"
            r="35"
            fill="none"
            stroke="#4a90e2"
            strokeWidth="2.5"
            filter={`url(#${glowId})`}
          />
          <text
            x="340"
            y="68"
            textAnchor="middle"
            fontFamily="Courier, monospace"
            fontSize="32"
            fill="#4a90e2"
            filter={`url(#${glowId})`}
          >
            ∴
          </text>
        </svg>
      </div>

      {/* Message */}
      <div style={{ maxWidth: '500px', margin: '0 auto' }}>
        <h2
          style={{
            fontSize: '1.5em',
            fontWeight: 600,
            color: '#212529',
            marginBottom: '16px',
          }}
        >
          Knowledge Synchronized
        </h2>
        <p
          style={{
            fontSize: '1em',
            color: '#6c757d',
            lineHeight: 1.6,
            marginBottom: '8px',
          }}
        >
          All articles processed. Your ansible is fully charged.
        </p>
        <p
          style={{
            fontSize: '1em',
            color: '#6c757d',
            lineHeight: 1.6,
          }}
        >
          Time to transmit what you&apos;ve learned to the world.
        </p>
      </div>
    </div>
  );
}
