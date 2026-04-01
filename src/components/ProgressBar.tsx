// ABOUT: Reusable progress bar component for async operations
// ABOUT: Shows progress counter and visual bar for sync, regenerate tags, etc.

interface ProgressBarProps {
  title: string;
  completed: number;
  failed: number;
  total: number;
}

export default function ProgressBar({
  title,
  completed,
  failed,
  total,
}: ProgressBarProps) {
  const progress =
    total > 0 ? ((completed + failed) / total) * 100 : 0;

  return (
    <div
      style={{
        padding: '16px',
        background: '#d1ecf1',
        border: '1px solid #bee5eb',
        borderRadius: '4px',
        marginBottom: '20px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: '8px',
        }}
      >
        <span style={{ fontWeight: 600, color: '#0c5460' }}>
          {title}
        </span>
        <span style={{ color: '#0c5460' }}>
          {completed + failed} / {total}
        </span>
      </div>
      <div
        style={{
          width: '100%',
          background: '#bee5eb',
          borderRadius: '4px',
          height: '8px',
        }}
      >
        <div
          style={{
            width: `${progress}%`,
            background: '#17a2b8',
            height: '8px',
            borderRadius: '4px',
            transition: 'width 0.3s',
          }}
        />
      </div>
    </div>
  );
}
