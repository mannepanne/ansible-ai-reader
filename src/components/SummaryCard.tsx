// ABOUT: Summary card component for displaying article summaries
// ABOUT: Shows title, summary, tags, metadata, and actions

'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';

interface SummaryCardProps {
  id: string;
  title: string;
  url: string;
  summary: string;
  tags: string[];
  author?: string;
  wordCount?: number;
  contentTruncated: boolean;
  onArchive: (id: string) => void;
}

export default function SummaryCard({
  id,
  title,
  url,
  summary,
  tags,
  author,
  wordCount,
  contentTruncated,
  onArchive,
}: SummaryCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Truncate summary to ~3-4 lines (roughly 200 chars)
  const shouldTruncate = summary.length > 200;
  const displaySummary =
    !isExpanded && shouldTruncate ? summary.slice(0, 200) + '...' : summary;

  // Calculate reading time estimate (250 words per minute)
  const readingTime = wordCount ? Math.ceil(wordCount / 250) : null;

  // Tag colors (cycle through a set of pleasant colors)
  const tagColors = [
    { bg: '#e3f2fd', text: '#1565c0' }, // Blue
    { bg: '#f3e5f5', text: '#7b1fa2' }, // Purple
    { bg: '#e8f5e9', text: '#2e7d32' }, // Green
    { bg: '#fff3e0', text: '#e65100' }, // Orange
    { bg: '#fce4ec', text: '#c2185b' }, // Pink
  ];

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: '6px',
        boxShadow: '0 1px 3px rgba(0,0,0,.1)',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        transition: 'box-shadow 0.2s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.15)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,.1)';
      }}
    >
      {/* Title */}
      <h3 style={{ margin: 0 }}>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: '#0d6efd',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: '1.05em',
            lineHeight: 1.3,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {title}
        </a>
      </h3>

      {/* Summary */}
      <div
        style={{
          color: '#495057',
          fontSize: '0.9em',
          lineHeight: 1.5,
        }}
        className="summary-markdown"
      >
        <ReactMarkdown
          components={{
            // Style unordered lists
            ul: ({ ...props }) => (
              <ul
                style={{
                  margin: '8px 0',
                  paddingLeft: '20px',
                  listStyleType: 'disc',
                }}
                {...props}
              />
            ),
            // Style list items
            li: ({ ...props }) => (
              <li
                style={{
                  marginBottom: '6px',
                  lineHeight: 1.6,
                }}
                {...props}
              />
            ),
            // Style paragraphs
            p: ({ ...props }) => (
              <p
                style={{
                  margin: '8px 0',
                }}
                {...props}
              />
            ),
            // Style bold text
            strong: ({ ...props }) => (
              <strong
                style={{
                  fontWeight: 700,
                  color: '#212529',
                }}
                {...props}
              />
            ),
          }}
        >
          {displaySummary}
        </ReactMarkdown>
        {shouldTruncate && !isExpanded && (
          <button
            onClick={() => setIsExpanded(true)}
            style={{
              background: 'none',
              border: 'none',
              color: '#0d6efd',
              cursor: 'pointer',
              padding: 0,
              marginTop: '4px',
              fontSize: 'inherit',
              display: 'block',
            }}
          >
            Expand
          </button>
        )}
        {isExpanded && (
          <button
            onClick={() => setIsExpanded(false)}
            style={{
              background: 'none',
              border: 'none',
              color: '#0d6efd',
              cursor: 'pointer',
              padding: 0,
              marginTop: '4px',
              fontSize: 'inherit',
              display: 'block',
            }}
          >
            Collapse
          </button>
        )}
      </div>

      {/* Tags */}
      {tags && tags.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {tags.map((tag, index) => {
            const color = tagColors[index % tagColors.length];
            return (
              <span
                key={tag}
                style={{
                  padding: '2px 10px',
                  borderRadius: '12px',
                  fontSize: '0.75em',
                  fontWeight: 600,
                  background: color.bg,
                  color: color.text,
                }}
              >
                {tag}
              </span>
            );
          })}
        </div>
      )}

      {/* Metadata */}
      {(author || readingTime) && (
        <div
          style={{
            fontSize: '0.8em',
            color: '#6c757d',
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          {author && <span>{author}</span>}
          {author && readingTime && <span>·</span>}
          {readingTime && (
            <span>
              {readingTime} min read
            </span>
          )}
        </div>
      )}

      {/* Truncated warning */}
      {contentTruncated && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 8px',
            background: '#fff3cd',
            color: '#856404',
            borderRadius: '4px',
            fontSize: '0.75em',
            fontWeight: 600,
            alignSelf: 'flex-start',
          }}
        >
          <span>⚠️</span>
          <span>Summary based on truncated content (&gt;30k chars)</span>
        </div>
      )}

      {/* Divider */}
      <div
        style={{
          height: '1px',
          background: '#f1f3f5',
          margin: '4px 0',
        }}
      />

      {/* Actions */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => onArchive(id)}
          style={{
            flex: 1,
            background: '#f8f9fa',
            color: '#495057',
            border: '1px solid #ced4da',
            padding: '8px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '0.85em',
            fontWeight: 500,
          }}
        >
          Archive
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            flex: 1,
            background: '#007bff',
            color: '#fff',
            border: 'none',
            padding: '8px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '0.85em',
            fontWeight: 500,
            textAlign: 'center',
            textDecoration: 'none',
            display: 'block',
          }}
        >
          Open in Reader
        </a>
      </div>
    </div>
  );
}
