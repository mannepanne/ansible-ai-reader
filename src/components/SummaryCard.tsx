// ABOUT: Summary card component for displaying article summaries
// ABOUT: Shows title, summary, tags, metadata, and actions

'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { MAX_NOTE_LENGTH } from '@/lib/constants';

interface SummaryCardProps {
  id: string;
  title: string;
  url: string;
  summary: string;
  tags: string[];
  author?: string;
  wordCount?: number;
  contentTruncated: boolean;
  documentNote?: string | null;
  rating?: number | null;
  onArchive: (id: string) => void;
  onSaveNote: (id: string, note: string) => Promise<void>;
  onSaveRating: (id: string, rating: number | null) => Promise<void>;
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
  documentNote,
  rating,
  onArchive,
  onSaveNote,
  onSaveRating,
}: SummaryCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [savedNote, setSavedNote] = useState<string | null>(
    documentNote || null
  );
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  // Rating state
  const [currentRating, setCurrentRating] = useState<number | null>(rating || null);
  const [isSavingRating, setIsSavingRating] = useState(false);

  // Note handlers
  const handleAddEditNote = () => {
    setIsEditingNote(true);
    setNoteText(savedNote || '');
    setNoteError(null);
  };

  const handleCancelNote = () => {
    // Confirm if there are unsaved changes
    if (noteText.trim() !== (savedNote || '').trim()) {
      if (
        !window.confirm(
          'You have unsaved changes. Are you sure you want to cancel?'
        )
      ) {
        return;
      }
    }
    setIsEditingNote(false);
    setNoteText('');
    setNoteError(null);
  };

  const handleSaveNote = async () => {
    const trimmedNote = noteText.trim();

    if (trimmedNote.length === 0) {
      setNoteError('Note cannot be empty');
      return;
    }

    if (trimmedNote.length > MAX_NOTE_LENGTH) {
      setNoteError(`Note must be under ${MAX_NOTE_LENGTH.toLocaleString()} characters`);
      return;
    }

    setIsSavingNote(true);
    setNoteError(null);

    try {
      await onSaveNote(id, trimmedNote);
      setSavedNote(trimmedNote);
      setIsEditingNote(false);
      setNoteText('');
    } catch (error) {
      setNoteError(
        error instanceof Error ? error.message : 'Failed to save note'
      );
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSaveNote();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelNote();
    }
  };

  // Rating handlers
  const handleRatingClick = async (targetRating: number) => {
    if (isSavingRating) return; // Prevent double-clicks

    // Toggle: if clicking the same rating, unrate (set to null)
    const newRating = currentRating === targetRating ? null : targetRating;

    // Optimistic UI update
    const previousRating = currentRating;
    setCurrentRating(newRating);
    setIsSavingRating(true);

    try {
      await onSaveRating(id, newRating);
    } catch (error) {
      // Revert on error
      setCurrentRating(previousRating);
      console.error('Failed to save rating:', error);
    } finally {
      setIsSavingRating(false);
    }
  };

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
            // Style links (open in new tab)
            a: ({ ...props }) => (
              <a
                style={{
                  color: '#0d6efd',
                  textDecoration: 'underline',
                }}
                target="_blank"
                rel="noopener noreferrer"
                {...props}
              />
            ),
          }}
        >
          {displaySummary}
        </ReactMarkdown>
        {/* Action links: Expand/Collapse | Add/Edit note */}
        {(shouldTruncate || isExpanded || !isEditingNote) && (
          <div style={{ marginTop: '4px', fontSize: 'inherit' }}>
            {shouldTruncate && !isExpanded && (
              <button
                onClick={() => setIsExpanded(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#0d6efd',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: 'inherit',
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
                  fontSize: 'inherit',
                }}
              >
                Collapse
              </button>
            )}
            {(shouldTruncate || isExpanded) && !isEditingNote && (
              <span style={{ color: '#6c757d', margin: '0 8px' }}>|</span>
            )}
            {!isEditingNote && (
              <button
                onClick={handleAddEditNote}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#0d6efd',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: 'inherit',
                }}
              >
                {savedNote ? 'Edit note' : 'Add note'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Note editing form */}
      {isEditingNote && (
        <div style={{ marginTop: '12px' }}>
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add your thoughts about this article..."
            autoFocus={window.innerWidth > 768}
            style={{
              width: '100%',
              minHeight: '80px',
              padding: '12px',
              border: '1px solid #ced4da',
              borderRadius: '4px',
              fontSize: '0.9em',
              fontFamily: 'inherit',
              lineHeight: 1.5,
              resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '8px',
            }}
          >
            <span
              style={{
                fontSize: '0.85em',
                color: noteText.length > MAX_NOTE_LENGTH * 0.99 ? '#e65100' : '#6c757d',
              }}
            >
              {noteText.length} / {MAX_NOTE_LENGTH.toLocaleString()} characters
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleCancelNote}
                disabled={isSavingNote}
                style={{
                  background: '#6c757d',
                  color: '#fff',
                  padding: '6px 16px',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: isSavingNote ? 'not-allowed' : 'pointer',
                  fontSize: '0.85em',
                  fontWeight: 500,
                  opacity: isSavingNote ? 0.6 : 1,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNote}
                disabled={isSavingNote}
                style={{
                  background: isSavingNote ? '#6c757d' : '#007bff',
                  color: '#fff',
                  padding: '6px 16px',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: isSavingNote ? 'not-allowed' : 'pointer',
                  fontSize: '0.85em',
                  fontWeight: 500,
                }}
              >
                {isSavingNote ? 'Saving...' : 'Save Note'}
              </button>
            </div>
          </div>
          {noteError && (
            <div
              style={{
                marginTop: '8px',
                padding: '8px 12px',
                background: '#f8d7da',
                color: '#dc3545',
                borderRadius: '4px',
                fontSize: '0.85em',
              }}
            >
              {noteError}
            </div>
          )}
        </div>
      )}

      {/* Saved note display */}
      {!isEditingNote && savedNote && (
        <div style={{ marginTop: '12px' }}>
          <div
            style={{
              fontSize: '0.85em',
              color: '#495057',
              fontWeight: 600,
              marginBottom: '6px',
            }}
          >
            📝 Your note:
          </div>
          <div
            style={{
              background: '#f8f9fa',
              border: '1px solid #e9ecef',
              borderRadius: '4px',
              padding: '12px',
              fontSize: '0.9em',
              color: '#495057',
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              wordWrap: 'break-word',
            }}
          >
            {savedNote}
          </div>
        </div>
      )}

      {/* Rating widget */}
      <div style={{ marginTop: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button
          onClick={() => handleRatingClick(4)}
          disabled={isSavingRating}
          style={{
            background: currentRating === 4 ? '#fff3cd' : '#f8f9fa',
            border: currentRating === 4 ? '2px solid #ffc107' : '1px solid #ced4da',
            borderRadius: '4px',
            padding: '6px 12px',
            cursor: isSavingRating ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.9em',
            fontWeight: currentRating === 4 ? 600 : 400,
            opacity: isSavingRating ? 0.6 : 1,
            transition: 'all 0.2s',
          }}
          title="Mark as interesting"
        >
          <span style={{ fontSize: '1.2em' }}>💡</span>
          <span>Interesting</span>
        </button>

        <button
          onClick={() => handleRatingClick(1)}
          disabled={isSavingRating}
          style={{
            background: currentRating === 1 ? '#f8d7da' : '#f8f9fa',
            border: currentRating === 1 ? '2px solid #dc3545' : '1px solid #ced4da',
            borderRadius: '4px',
            padding: '6px 12px',
            cursor: isSavingRating ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.9em',
            fontWeight: currentRating === 1 ? 600 : 400,
            opacity: isSavingRating ? 0.6 : 1,
            transition: 'all 0.2s',
          }}
          title="Mark as not interesting"
        >
          <span style={{ fontSize: '1.2em' }}>🤷</span>
          <span>Not interesting</span>
        </button>

        {currentRating !== null && (
          <span
            style={{
              fontSize: '0.75em',
              color: '#6c757d',
              marginLeft: '4px',
            }}
          >
            (click again to unrate)
          </span>
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
