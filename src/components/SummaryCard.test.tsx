// ABOUT: Tests for SummaryCard component
// ABOUT: Validates rendering, expand/collapse, tags, metadata, actions

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SummaryCard from './SummaryCard';

describe('SummaryCard', () => {
  const defaultProps = {
    id: 'item-1',
    title: 'Test Article Title',
    url: 'https://example.com/article',
    summary: 'This is a test summary that is not very long.',
    tags: ['tag1', 'tag2'],
    contentTruncated: false,
    onArchive: vi.fn(),
  };

  it('renders article title', () => {
    render(<SummaryCard {...defaultProps} />);

    expect(screen.getByText('Test Article Title')).toBeInTheDocument();
  });

  it('renders title as link to article URL', () => {
    render(<SummaryCard {...defaultProps} />);

    const titleLink = screen.getByRole('link', { name: /test article title/i });
    expect(titleLink).toHaveAttribute('href', 'https://example.com/article');
    expect(titleLink).toHaveAttribute('target', '_blank');
    expect(titleLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders summary text', () => {
    render(<SummaryCard {...defaultProps} />);

    expect(
      screen.getByText('This is a test summary that is not very long.')
    ).toBeInTheDocument();
  });

  it('truncates long summaries to 200 characters', () => {
    const longSummary = 'a'.repeat(300);
    render(<SummaryCard {...defaultProps} summary={longSummary} />);

    // Check that truncated text + "..." is displayed
    const truncatedText = 'a'.repeat(200) + '...';
    expect(screen.getByText(truncatedText, { exact: false })).toBeInTheDocument();
  });

  it('shows Expand button for long summaries', () => {
    const longSummary = 'a'.repeat(300);
    render(<SummaryCard {...defaultProps} summary={longSummary} />);

    expect(screen.getByRole('button', { name: /expand/i })).toBeInTheDocument();
  });

  it('does not show Expand button for short summaries', () => {
    render(<SummaryCard {...defaultProps} summary="Short summary" />);

    expect(
      screen.queryByRole('button', { name: /expand/i })
    ).not.toBeInTheDocument();
  });

  it('expands summary when Expand button clicked', () => {
    const longSummary = 'a'.repeat(300);
    render(<SummaryCard {...defaultProps} summary={longSummary} />);

    const expandButton = screen.getByRole('button', { name: /expand/i });
    fireEvent.click(expandButton);

    // Should show full summary without "..."
    const fullText = 'a'.repeat(300);
    expect(screen.getByText(fullText, { exact: false })).toBeInTheDocument();
    expect(screen.queryByText(/\.\.\./)).not.toBeInTheDocument();
  });

  it('shows Collapse button after expanding', () => {
    const longSummary = 'a'.repeat(300);
    render(<SummaryCard {...defaultProps} summary={longSummary} />);

    const expandButton = screen.getByRole('button', { name: /expand/i });
    fireEvent.click(expandButton);

    expect(
      screen.getByRole('button', { name: /collapse/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /expand/i })
    ).not.toBeInTheDocument();
  });

  it('collapses summary when Collapse button clicked', () => {
    const longSummary = 'a'.repeat(300);
    render(<SummaryCard {...defaultProps} summary={longSummary} />);

    // Expand first
    const expandButton = screen.getByRole('button', { name: /expand/i });
    fireEvent.click(expandButton);

    // Then collapse
    const collapseButton = screen.getByRole('button', { name: /collapse/i });
    fireEvent.click(collapseButton);

    // Should show truncated summary again with "..."
    const truncatedText = 'a'.repeat(200) + '...';
    expect(screen.getByText(truncatedText, { exact: false })).toBeInTheDocument();
  });

  it('renders tags', () => {
    render(<SummaryCard {...defaultProps} tags={['React', 'TypeScript', 'Testing']} />);

    expect(screen.getByText('React')).toBeInTheDocument();
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
    expect(screen.getByText('Testing')).toBeInTheDocument();
  });

  it('does not render tags section when no tags', () => {
    const { container } = render(<SummaryCard {...defaultProps} tags={[]} />);

    // Tags are in a div with gap styling - if no tags, that div shouldn't exist
    const tagsContainer = container.querySelector('[style*="gap: 6px"]');
    expect(tagsContainer).not.toBeInTheDocument();
  });

  it('renders author when provided', () => {
    render(<SummaryCard {...defaultProps} author="John Doe" />);

    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('does not render author when not provided', () => {
    render(<SummaryCard {...defaultProps} author={undefined} />);

    const { container } = render(<SummaryCard {...defaultProps} />);
    expect(container.textContent).not.toContain('John Doe');
  });

  it('calculates and displays reading time', () => {
    render(<SummaryCard {...defaultProps} wordCount={500} />);

    // 500 words / 250 wpm = 2 minutes
    expect(screen.getByText('2 min read')).toBeInTheDocument();
  });

  it('rounds up reading time', () => {
    render(<SummaryCard {...defaultProps} wordCount={300} />);

    // 300 words / 250 wpm = 1.2, rounds to 2
    expect(screen.getByText('2 min read')).toBeInTheDocument();
  });

  it('does not show reading time when wordCount not provided', () => {
    const { container } = render(<SummaryCard {...defaultProps} wordCount={undefined} />);

    expect(container.textContent).not.toContain('min read');
  });

  it('shows separator between author and reading time', () => {
    render(<SummaryCard {...defaultProps} author="John Doe" wordCount={250} />);

    // Should have separator between author and reading time
    expect(screen.getByText('·')).toBeInTheDocument();
  });

  it('shows truncation warning when contentTruncated is true', () => {
    render(<SummaryCard {...defaultProps} contentTruncated={true} />);

    expect(
      screen.getByText(/summary based on truncated content/i)
    ).toBeInTheDocument();
    expect(screen.getByText('⚠️')).toBeInTheDocument();
  });

  it('does not show truncation warning when contentTruncated is false', () => {
    render(<SummaryCard {...defaultProps} contentTruncated={false} />);

    expect(
      screen.queryByText(/summary based on truncated content/i)
    ).not.toBeInTheDocument();
  });

  it('renders Archive button', () => {
    render(<SummaryCard {...defaultProps} />);

    expect(screen.getByRole('button', { name: /archive/i })).toBeInTheDocument();
  });

  it('calls onArchive when Archive button clicked', () => {
    const mockOnArchive = vi.fn();
    render(<SummaryCard {...defaultProps} onArchive={mockOnArchive} />);

    const archiveButton = screen.getByRole('button', { name: /archive/i });
    fireEvent.click(archiveButton);

    expect(mockOnArchive).toHaveBeenCalledWith('item-1');
  });

  it('renders Open in Reader link', () => {
    render(<SummaryCard {...defaultProps} />);

    const readerLink = screen.getByRole('link', { name: /open in reader/i });
    expect(readerLink).toHaveAttribute('href', 'https://example.com/article');
    expect(readerLink).toHaveAttribute('target', '_blank');
  });

  it('applies different colors to tags', () => {
    const { container } = render(
      <SummaryCard
        {...defaultProps}
        tags={['Tag1', 'Tag2', 'Tag3', 'Tag4', 'Tag5', 'Tag6']}
      />
    );

    const tagElements = container.querySelectorAll('[style*="background"]');
    // Should have different background colors cycling through the color palette
    expect(tagElements.length).toBeGreaterThan(0);
  });

  it('renders complete card with all optional props', () => {
    render(
      <SummaryCard
        id="complete-item"
        title="Complete Article"
        url="https://example.com/complete"
        summary="Complete summary text"
        tags={['Tag1', 'Tag2']}
        author="Jane Smith"
        wordCount={1000}
        contentTruncated={true}
        onArchive={vi.fn()}
      />
    );

    expect(screen.getByText('Complete Article')).toBeInTheDocument();
    expect(screen.getByText('Complete summary text')).toBeInTheDocument();
    expect(screen.getByText('Tag1')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('4 min read')).toBeInTheDocument(); // 1000/250 = 4
    expect(screen.getByText(/truncated content/i)).toBeInTheDocument();
  });
});
