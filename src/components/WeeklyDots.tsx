// ABOUT: Seven dots for the current week's reading days, Monday first, plus "N of M this week"
// ABOUT: Progress without a streak: it resets on Monday and never counts a chain

'use client';

import { useEffect, useState } from 'react';

interface WeekSummary {
  days: boolean[];
  count: number;
  target: number;
}

export default function WeeklyDots({ compact = false }: { compact?: boolean }) {
  const [week, setWeek] = useState<WeekSummary | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch('/api/fika/reading-days');
        if (!response?.ok) return;
        const data = (await response.json()) as WeekSummary;
        if (active && Array.isArray(data?.days)) setWeek(data);
      } catch {
        // The dots are decoration; a failed fetch renders nothing
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (!week) return null;

  const label = `${week.count} of ${week.target} reading days this week`;

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', lineHeight: 1 }}
    >
      <span style={{ display: 'inline-flex', gap: '4px' }}>
        {week.days.map((filled, i) => (
          <span
            key={i}
            data-testid={filled ? 'dot-filled' : 'dot-empty'}
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              display: 'inline-block',
              background: filled ? '#ffc107' : 'transparent',
              border: `1px solid ${filled ? '#ffc107' : '#6c757d'}`,
            }}
          />
        ))}
      </span>
      {!compact && (
        <span style={{ color: '#adb5bd', fontSize: '0.8em', whiteSpace: 'nowrap' }}>
          {week.count} of {week.target} this week
        </span>
      )}
    </span>
  );
}
