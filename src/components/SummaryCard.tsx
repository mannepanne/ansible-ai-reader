// ABOUT: Summary card component for displaying article summaries
// ABOUT: Shows title, tabbed summary/commentariat, tags, metadata, and actions

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
  commentariatSummary?: string | null;
  commentariatGeneratedAt?: string | null;
  onArchive: (id: string) => void;
  onSaveNote: (id: string, note: string) => Promise<void>;
  onSaveRating: (id: string, rating: number | null) => Promise<void>;
  onRegenerateSummary: (id: string) => Promise<void>;
  onGenerateCommentariat: (id: string) => Promise<void>;
}

const TRUNCATE_THRESHOLD = 200;

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
  commentariatSummary,
  commentariatGeneratedAt,
  onArchive,
  onSaveNote,
  onSaveRating,
  onRegenerateSummary,
  onGenerateCommentariat,
}: SummaryCardProps) {
  // Tab state
  const [activeTab, setActiveTab] = useState<'summary' | 'commentariat'>('summary');

  // Expand state per tab
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  const [isCommentariatExpanded, setIsCommentariatExpanded] = useState(false);

  // Summary refresh state
  const [isSummaryRefreshing, setIsSummaryRefreshing] = useState(false);
  const [summaryRefreshError, setSummaryRefreshError] = useState<string | null>(null);

  // Note state
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [savedNote, setSavedNote] = useState<string | null>(documentNote || null);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  // Rating state
  const [currentRating, setCurrentRating] = useState<number | null>(rating || null);
  const [isSavingRating, setIsSavingRating] = useState(false);

  // Commentariat generation state
  const [isCommentariatGenerating, setIsCommentariatGenerating] = useState(false);
  const [commentariatError, setCommentariatError] = useState<string | null>(null);

  // Note handlers
  const handleAddEditNote = () => {
    setIsEditingNote(true);
    setNoteText(savedNote || '');
    setNoteError(null);
  };

  const handleCancelNote = () => {
    if (noteText.trim() !== (savedNote || '').trim()) {
      if (!window.confirm('You have unsaved changes. Are you sure you want to cancel?')) {
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
      setNoteError(error instanceof Error ? error.message : 'Failed to save note');
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
    if (isSavingRating) return;
    const newRating = currentRating === targetRating ? null : targetRating;
    const previousRating = currentRating;
    setCurrentRating(newRating);
    setIsSavingRating(true);

    try {
      await onSaveRating(id, newRating);
    } catch (error) {
      setCurrentRating(previousRating);
      console.error('Failed to save rating:', error);
    } finally {
      setIsSavingRating(false);
    }
  };

  // Summary refresh handler
  const handleRefreshSummary = async () => {
    setIsSummaryRefreshing(true);
    setSummaryRefreshError(null);

    try {
      await onRegenerateSummary(id);
    } catch (error) {
      setSummaryRefreshError('Refresh failed — try again');
    } finally {
      setIsSummaryRefreshing(false);
    }
  };

  // Commentariat handler
  const handleGenerateCommentariat = async () => {
    setIsCommentariatGenerating(true);
    setCommentariatError(null);

    try {
      await onGenerateCommentariat(id);
    } catch (error) {
      setCommentariatError('Analysis unavailable — try again');
    } finally {
      setIsCommentariatGenerating(false);
    }
  };

  // Summary truncation
  const shouldTruncateSummary = summary.length > TRUNCATE_THRESHOLD;
  const displaySummary =
    !isSummaryExpanded && shouldTruncateSummary
      ? summary.slice(0, TRUNCATE_THRESHOLD) + '...'
      : summary;

  // Commentariat truncation
  const shouldTruncateCommentariat =
    !!commentariatSummary && commentariatSummary.length > TRUNCATE_THRESHOLD;
  const displayCommentariat =
    commentariatSummary && !isCommentariatExpanded && shouldTruncateCommentariat
      ? commentariatSummary.slice(0, TRUNCATE_THRESHOLD) + '...'
      : commentariatSummary;

  // Controls row: expand button visible whenever either tab has expandable content
  const showExpandButton =
    shouldTruncateSummary || (shouldTruncateCommentariat && !!commentariatSummary);
  const isCurrentTabExpanded =
    activeTab === 'summary' ? isSummaryExpanded : isCommentariatExpanded;
  const handleExpandToggle = () => {
    if (activeTab === 'summary') {
      setIsSummaryExpanded((v) => !v);
    } else {
      setIsCommentariatExpanded((v) => !v);
    }
  };

  // Reading time estimate
  const readingTime = wordCount ? Math.ceil(wordCount / 250) : null;

  // Tag color palette
  const tagColors = [
    { bg: '#e3f2fd', text: '#1565c0' },
    { bg: '#f3e5f5', text: '#7b1fa2' },
    { bg: '#e8f5e9', text: '#2e7d32' },
    { bg: '#fff3e0', text: '#e65100' },
    { bg: '#fce4ec', text: '#c2185b' },
  ];

  // Shared ReactMarkdown components
  const markdownComponents = {
    ul: ({ ...props }) => (
      <ul style={{ margin: '8px 0', paddingLeft: '20px', listStyleType: 'disc' }} {...props} />
    ),
    li: ({ ...props }) => (
      <li style={{ marginBottom: '6px', lineHeight: 1.6 }} {...props} />
    ),
    p: ({ ...props }) => <p style={{ margin: '8px 0' }} {...props} />,
    strong: ({ ...props }) => (
      <strong style={{ fontWeight: 700, color: '#212529' }} {...props} />
    ),
    a: ({ ...props }) => (
      <a
        style={{ color: '#0d6efd', textDecoration: 'underline' }}
        target="_blank"
        rel="noopener noreferrer"
        {...props}
      />
    ),
    h2: ({ ...props }) => (
      <h2
        style={{ fontSize: '0.95em', fontWeight: 700, margin: '12px 0 4px', color: '#212529' }}
        {...props}
      />
    ),
    h3: ({ ...props }) => (
      <h3
        style={{ fontSize: '0.9em', fontWeight: 600, margin: '10px 0 4px', color: '#343a40' }}
        {...props}
      />
    ),
  };

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

      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid #dee2e6',
          gap: '0',
        }}
      >
        {/* Tab display labels — internal state stays as 'commentariat' to match DB columns */}
        {(['summary', 'commentariat'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid #0d6efd' : '2px solid transparent',
              color: activeTab === tab ? '#0d6efd' : '#6c757d',
              cursor: 'pointer',
              fontSize: '0.85em',
              fontWeight: activeTab === tab ? 600 : 400,
              padding: '6px 12px 8px',
              marginBottom: '-1px',
              transition: 'color 0.15s',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {tab === 'commentariat' ? 'Commentary' : 'Summary'}
            {tab === 'commentariat' && commentariatSummary && (
              <span
                aria-hidden="true"
                data-testid="commentariat-dot-indicator"
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: activeTab === 'commentariat' ? '#0d6efd' : '#6c757d',
                  display: 'inline-block',
                  flexShrink: 0,
                }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div
        style={{
          color: '#495057',
          fontSize: '0.9em',
          lineHeight: 1.5,
        }}
      >
        {activeTab === 'summary' && (
          <div className="summary-markdown">
            {isSummaryRefreshing ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '24px 0',
                  color: '#6c757d',
                  fontSize: '0.9em',
                }}
              >
                Refreshing summary…
              </div>
            ) : (
              <>
                <ReactMarkdown components={markdownComponents}>{displaySummary}</ReactMarkdown>
                {summaryRefreshError && (
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
                    {summaryRefreshError}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'commentariat' && (
          <div className="commentariat-content">
            {isCommentariatGenerating ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '24px 0',
                  color: '#6c757d',
                  fontSize: '0.9em',
                }}
              >
                Analysing ideas…
              </div>
            ) : commentariatSummary ? (
              <>
                <ReactMarkdown components={markdownComponents}>
                  {displayCommentariat || ''}
                </ReactMarkdown>
                {commentariatGeneratedAt && (
                  <div
                    style={{
                      marginTop: '8px',
                      fontSize: '0.75em',
                      color: '#adb5bd',
                    }}
                  >
                    Analysed{' '}
                    {new Date(commentariatGeneratedAt).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </div>
                )}
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                {commentariatError && (
                  <div
                    style={{
                      marginBottom: '12px',
                      padding: '8px 12px',
                      background: '#f8d7da',
                      color: '#dc3545',
                      borderRadius: '4px',
                      fontSize: '0.85em',
                    }}
                  >
                    {commentariatError}
                  </div>
                )}
                <button
                  onClick={handleGenerateCommentariat}
                  style={{
                    background: '#f8f9fa',
                    border: '1px solid #ced4da',
                    borderRadius: '4px',
                    color: '#495057',
                    cursor: 'pointer',
                    fontSize: '0.85em',
                    fontWeight: 500,
                    padding: '8px 16px',
                  }}
                >
                  Analyse ideas
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Controls row — outside tabs */}
      {!isEditingNote && (
        <div
          style={{
            marginTop: '4px',
            fontSize: '0.9em',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {showExpandButton && (
            <button
              onClick={handleExpandToggle}
              style={{
                background: 'none',
                border: 'none',
                color: '#0d6efd',
                cursor: 'pointer',
                padding: 0,
                fontSize: 'inherit',
              }}
            >
              {isCurrentTabExpanded ? 'Collapse' : 'Expand'}
            </button>
          )}
          {showExpandButton && (
            <span style={{ color: '#6c757d' }}>|</span>
          )}
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
          <span style={{ color: '#6c757d' }}>|</span>
          <button
            onClick={() => handleRatingClick(4)}
            disabled={isSavingRating}
            title="Interesting"
            aria-label="Mark as interesting"
            style={{
              background: currentRating === 4 ? '#fff3cd' : 'transparent',
              border: 'none',
              borderRadius: '4px',
              padding: '2px 4px',
              cursor: isSavingRating ? 'not-allowed' : 'pointer',
              fontSize: '1.1em',
              opacity: isSavingRating ? 0.6 : currentRating === 4 ? 1 : 0.5,
              transition: 'all 0.2s',
            }}
          >
            💡
          </button>
          <button
            onClick={() => handleRatingClick(1)}
            disabled={isSavingRating}
            title="Not interesting"
            aria-label="Mark as not interesting"
            style={{
              background: currentRating === 1 ? '#f8d7da' : 'transparent',
              border: 'none',
              borderRadius: '4px',
              padding: '2px 4px',
              cursor: isSavingRating ? 'not-allowed' : 'pointer',
              fontSize: '1.1em',
              opacity: isSavingRating ? 0.6 : currentRating === 1 ? 1 : 0.5,
              transition: 'all 0.2s',
            }}
          >
            🤷
          </button>

          {/* Refresh summary */}
          {activeTab === 'summary' && !isSummaryRefreshing && (
            <>
              <span style={{ color: '#6c757d' }}>|</span>
              <button
                onClick={handleRefreshSummary}
                title="Refresh summary"
                aria-label="Refresh summary"
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#6c757d',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: '0.85em',
                }}
              >
                ↺ Refresh
              </button>
            </>
          )}

          {/* Refresh commentariat (shown after generation) */}
          {activeTab === 'commentariat' && commentariatSummary && !isCommentariatGenerating && (
            <>
              <span style={{ color: '#6c757d' }}>|</span>
              <button
                onClick={handleGenerateCommentariat}
                title="Refresh analysis"
                aria-label="Refresh analysis"
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#6c757d',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: '0.85em',
                }}
              >
                ↺ Refresh
              </button>
            </>
          )}
        </div>
      )}

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
          {readingTime && <span>{readingTime} min read</span>}
        </div>
      )}

      {/* Truncated content warning */}
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
      <div style={{ height: '1px', background: '#f1f3f5', margin: '4px 0' }} />

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
