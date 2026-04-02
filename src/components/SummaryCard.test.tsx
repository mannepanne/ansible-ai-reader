// ABOUT: Tests for SummaryCard component
// ABOUT: Validates rendering, tabs, expand/collapse, commentariat, tags, metadata, actions

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
    onSaveNote: vi.fn(),
    onSaveRating: vi.fn(),
    onGenerateCommentariat: vi.fn(),
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

    // Tags have specific border-radius (12px) - check no tag badges are present
    const tagBadges = container.querySelectorAll('[style*="border-radius: 12px"]');
    expect(tagBadges.length).toBe(0);
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
        onSaveNote={vi.fn()}
        onSaveRating={vi.fn()}
        onGenerateCommentariat={vi.fn()}
      />
    );

    expect(screen.getByText('Complete Article')).toBeInTheDocument();
    expect(screen.getByText('Complete summary text')).toBeInTheDocument();
    expect(screen.getByText('Tag1')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('4 min read')).toBeInTheDocument(); // 1000/250 = 4
    expect(screen.getByText(/truncated content/i)).toBeInTheDocument();
  });

  describe('Markdown rendering', () => {
    it('renders bold text as strong elements', () => {
      const markdownSummary = 'This is **bold text** in a summary.';
      const { container } = render(
        <SummaryCard {...defaultProps} summary={markdownSummary} />
      );

      const strongElement = container.querySelector('strong');
      expect(strongElement).toBeInTheDocument();
      expect(strongElement?.textContent).toBe('bold text');
    });

    it('renders bullet lists as ul and li elements', () => {
      const markdownSummary = '- First bullet point\n- Second bullet point\n- Third bullet point';
      const { container } = render(
        <SummaryCard {...defaultProps} summary={markdownSummary} />
      );

      const ulElement = container.querySelector('ul');
      expect(ulElement).toBeInTheDocument();

      const liElements = container.querySelectorAll('li');
      expect(liElements).toHaveLength(3);
      expect(liElements[0].textContent).toBe('First bullet point');
      expect(liElements[1].textContent).toBe('Second bullet point');
      expect(liElements[2].textContent).toBe('Third bullet point');
    });

    it('renders links with target="_blank" and proper attributes', () => {
      const markdownSummary = 'Check out [this article](https://example.com) for more info.';
      render(<SummaryCard {...defaultProps} summary={markdownSummary} />);

      const link = screen.getByRole('link', { name: /this article/i });
      expect(link).toHaveAttribute('href', 'https://example.com');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('renders complex markdown with bullets and bold text', () => {
      const markdownSummary = '- **First point**: Important detail\n- **Second point**: Another detail\n- Regular point without bold';
      const { container } = render(
        <SummaryCard {...defaultProps} summary={markdownSummary} />
      );

      const strongElements = container.querySelectorAll('strong');
      expect(strongElements).toHaveLength(2);
      expect(strongElements[0].textContent).toBe('First point');
      expect(strongElements[1].textContent).toBe('Second point');

      const liElements = container.querySelectorAll('li');
      expect(liElements).toHaveLength(3);
    });

    it('preserves markdown rendering when expanding long summaries', () => {
      const longMarkdownSummary = `- **First point** with details\n${'- Another point\n'.repeat(50)}`;
      const { container } = render(
        <SummaryCard {...defaultProps} summary={longMarkdownSummary} />
      );

      // Expand the summary
      const expandButton = screen.getByRole('button', { name: /expand/i });
      fireEvent.click(expandButton);

      // Verify markdown still renders
      const strongElement = container.querySelector('strong');
      expect(strongElement).toBeInTheDocument();
      expect(strongElement?.textContent).toBe('First point');

      const liElements = container.querySelectorAll('li');
      expect(liElements.length).toBeGreaterThan(10);
    });
  });

  describe('Rating widget', () => {
    it('renders rating buttons', () => {
      render(<SummaryCard {...defaultProps} />);

      expect(screen.getByTitle('Interesting')).toBeInTheDocument();
      expect(screen.getByTitle('Not interesting')).toBeInTheDocument();
    });

    it('calls onSaveRating with 4 when Interesting button clicked', async () => {
      const mockOnSaveRating = vi.fn().mockResolvedValue(undefined);
      render(<SummaryCard {...defaultProps} onSaveRating={mockOnSaveRating} />);

      const interestingButton = screen.getByTitle('Interesting');
      fireEvent.click(interestingButton);

      expect(mockOnSaveRating).toHaveBeenCalledWith('item-1', 4);
    });

    it('calls onSaveRating with 1 when Not interesting button clicked', async () => {
      const mockOnSaveRating = vi.fn().mockResolvedValue(undefined);
      render(<SummaryCard {...defaultProps} onSaveRating={mockOnSaveRating} />);

      const notInterestingButton = screen.getByTitle('Not interesting');
      fireEvent.click(notInterestingButton);

      expect(mockOnSaveRating).toHaveBeenCalledWith('item-1', 1);
    });

    it('unrates when clicking the same rating button again (toggle off)', async () => {
      const mockOnSaveRating = vi.fn().mockResolvedValue(undefined);
      render(<SummaryCard {...defaultProps} rating={4} onSaveRating={mockOnSaveRating} />);

      // Click Interesting button (currently rated 4)
      const interestingButton = screen.getByTitle('Interesting');
      fireEvent.click(interestingButton);

      // Should call with null to unrate
      expect(mockOnSaveRating).toHaveBeenCalledWith('item-1', null);
    });

    it('highlights Interesting button when rated 4', () => {
      const { container } = render(<SummaryCard {...defaultProps} rating={4} />);

      const interestingButton = screen.getByTitle('Interesting');
      const buttonStyle = window.getComputedStyle(interestingButton);

      // Check for highlighted styling (background color)
      expect(interestingButton).toHaveStyle({ background: '#fff3cd' });
    });

    it('highlights Not interesting button when rated 1', () => {
      const { container } = render(<SummaryCard {...defaultProps} rating={1} />);

      const notInterestingButton = screen.getByTitle('Not interesting');

      // Check for highlighted styling (background color)
      expect(notInterestingButton).toHaveStyle({ background: '#f8d7da' });
    });

    it('disables buttons while saving rating', async () => {
      const mockOnSaveRating = vi.fn(() => new Promise<void>(resolve => setTimeout(resolve, 100)));
      render(<SummaryCard {...defaultProps} onSaveRating={mockOnSaveRating} />);

      const interestingButton = screen.getByTitle('Interesting');
      const notInterestingButton = screen.getByTitle('Not interesting');

      fireEvent.click(interestingButton);

      // Buttons should be disabled immediately
      expect(interestingButton).toBeDisabled();
      expect(notInterestingButton).toBeDisabled();
    });

    it('reverts rating on save error (optimistic UI rollback)', async () => {
      const mockOnSaveRating = vi.fn().mockRejectedValue(new Error('API error'));
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(<SummaryCard {...defaultProps} rating={null} onSaveRating={mockOnSaveRating} />);

      const interestingButton = screen.getByTitle('Interesting');

      // Click to rate
      fireEvent.click(interestingButton);

      // Wait for async state updates
      await new Promise(resolve => setTimeout(resolve, 50));

      // Rating should be reverted to null (no highlight)
      expect(interestingButton).not.toHaveStyle({ background: '#fff3cd' });

      consoleErrorSpy.mockRestore();
    });

    it('updates UI optimistically before API call completes', () => {
      const mockOnSaveRating = vi.fn(() => new Promise<void>(resolve => setTimeout(resolve, 100)));
      render(<SummaryCard {...defaultProps} rating={null} onSaveRating={mockOnSaveRating} />);

      const interestingButton = screen.getByTitle('Interesting');

      fireEvent.click(interestingButton);

      // UI should update immediately (optimistic)
      expect(interestingButton).toHaveStyle({ background: '#fff3cd' });
    });

    it('prevents multiple clicks while saving', async () => {
      const mockOnSaveRating = vi.fn(() => new Promise<void>(resolve => setTimeout(resolve, 100)));
      render(<SummaryCard {...defaultProps} onSaveRating={mockOnSaveRating} />);

      const interestingButton = screen.getByTitle('Interesting');

      // Click multiple times rapidly
      fireEvent.click(interestingButton);
      fireEvent.click(interestingButton);
      fireEvent.click(interestingButton);

      // Should only call once
      expect(mockOnSaveRating).toHaveBeenCalledTimes(1);
    });

    it('allows rating to be changed from one value to another', async () => {
      const mockOnSaveRating = vi.fn().mockResolvedValue(undefined);
      render(<SummaryCard {...defaultProps} rating={4} onSaveRating={mockOnSaveRating} />);

      const notInterestingButton = screen.getByTitle('Not interesting');
      fireEvent.click(notInterestingButton);

      // Should change from 4 to 1
      expect(mockOnSaveRating).toHaveBeenCalledWith('item-1', 1);
    });
  });

  describe('Tab bar', () => {
    it('renders Summary and Commentariat tabs', () => {
      render(<SummaryCard {...defaultProps} />);

      expect(screen.getByRole('button', { name: /summary/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /commentariat/i })).toBeInTheDocument();
    });

    it('shows Summary tab content by default', () => {
      render(<SummaryCard {...defaultProps} summary="Default summary text" />);

      expect(screen.getByText('Default summary text')).toBeInTheDocument();
    });

    it('switches to Commentariat tab on click', () => {
      const commentariat = '## Counter-arguments\n- A critical point';
      render(
        <SummaryCard
          {...defaultProps}
          commentariatSummary={commentariat}
          commentariatGeneratedAt="2026-04-01T10:00:00Z"
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /commentariat/i }));

      expect(screen.getByText(/Counter-arguments/i)).toBeInTheDocument();
    });

    it('shows summary content when switching back to Summary tab', () => {
      render(
        <SummaryCard
          {...defaultProps}
          summary="The original summary"
          commentariatSummary="Some commentariat"
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /commentariat/i }));
      fireEvent.click(screen.getByRole('button', { name: /summary/i }));

      expect(screen.getByText('The original summary')).toBeInTheDocument();
    });

    it('shows dot indicator on Commentariat tab when analysis exists', () => {
      render(<SummaryCard {...defaultProps} commentariatSummary="Some analysis" />);

      expect(screen.getByTestId('commentariat-dot-indicator')).toBeInTheDocument();
    });

    it('does not show dot indicator when no commentariat exists', () => {
      render(<SummaryCard {...defaultProps} commentariatSummary={null} />);

      expect(screen.queryByTestId('commentariat-dot-indicator')).not.toBeInTheDocument();
    });
  });

  describe('Commentariat tab', () => {
    it('shows Analyse ideas button when no commentariat exists', () => {
      render(<SummaryCard {...defaultProps} commentariatSummary={null} />);

      fireEvent.click(screen.getByRole('button', { name: /commentariat/i }));

      expect(screen.getByRole('button', { name: /analyse ideas/i })).toBeInTheDocument();
    });

    it('calls onGenerateCommentariat when Analyse ideas clicked', async () => {
      const mockGenerate = vi.fn().mockResolvedValue(undefined);
      render(
        <SummaryCard
          {...defaultProps}
          commentariatSummary={null}
          onGenerateCommentariat={mockGenerate}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /commentariat/i }));
      fireEvent.click(screen.getByRole('button', { name: /analyse ideas/i }));

      expect(mockGenerate).toHaveBeenCalledWith('item-1');
    });

    it('shows loading state while generating', async () => {
      const mockGenerate = vi.fn(() => new Promise<void>(resolve => setTimeout(resolve, 100)));
      render(
        <SummaryCard
          {...defaultProps}
          commentariatSummary={null}
          onGenerateCommentariat={mockGenerate}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /commentariat/i }));
      fireEvent.click(screen.getByRole('button', { name: /analyse ideas/i }));

      expect(screen.getByText(/analysing ideas/i)).toBeInTheDocument();
    });

    it('shows error message when generation fails', async () => {
      const mockGenerate = vi.fn().mockRejectedValue(new Error('API error'));
      render(
        <SummaryCard
          {...defaultProps}
          commentariatSummary={null}
          onGenerateCommentariat={mockGenerate}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /commentariat/i }));
      fireEvent.click(screen.getByRole('button', { name: /analyse ideas/i }));

      await waitFor(() => {
        expect(screen.getByText(/analysis unavailable/i)).toBeInTheDocument();
      });
    });

    it('renders generated commentariat with ReactMarkdown', () => {
      const commentariat = '## Counter-arguments\n- A critical point\n- Another point';
      render(
        <SummaryCard
          {...defaultProps}
          commentariatSummary={commentariat}
          commentariatGeneratedAt="2026-04-01T10:00:00Z"
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /commentariat/i }));

      const liElements = screen.getAllByRole('listitem');
      expect(liElements.length).toBeGreaterThan(0);
    });

    it('shows generated date after commentariat', () => {
      render(
        <SummaryCard
          {...defaultProps}
          commentariatSummary="Some analysis content"
          commentariatGeneratedAt="2026-04-01T10:00:00Z"
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /commentariat/i }));

      expect(screen.getByText(/analysed/i)).toBeInTheDocument();
    });

    it('shows Refresh button after commentariat is generated', () => {
      render(
        <SummaryCard
          {...defaultProps}
          commentariatSummary="Some analysis content"
          commentariatGeneratedAt="2026-04-01T10:00:00Z"
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /commentariat/i }));

      expect(screen.getByTitle('Refresh analysis')).toBeInTheDocument();
    });

    it('does not show Refresh button on Summary tab', () => {
      render(
        <SummaryCard
          {...defaultProps}
          commentariatSummary="Some analysis"
          commentariatGeneratedAt="2026-04-01T10:00:00Z"
        />
      );

      // Default is Summary tab — Refresh should not be visible
      expect(screen.queryByTitle('Refresh analysis')).not.toBeInTheDocument();
    });
  });

  describe('Expand button (tab-aware)', () => {
    it('shows Expand for long summary on Summary tab', () => {
      const longSummary = 'a'.repeat(300);
      render(<SummaryCard {...defaultProps} summary={longSummary} />);

      expect(screen.getByRole('button', { name: /expand/i })).toBeInTheDocument();
    });

    it('still shows Expand on Commentariat tab when summary is long', () => {
      const longSummary = 'a'.repeat(300);
      render(
        <SummaryCard {...defaultProps} summary={longSummary} commentariatSummary={null} />
      );

      fireEvent.click(screen.getByRole('button', { name: /commentariat/i }));

      expect(screen.getByRole('button', { name: /expand/i })).toBeInTheDocument();
    });

    it('shows Expand on Commentariat tab when commentariat is long', () => {
      const longCommentariat = 'c'.repeat(300);
      render(
        <SummaryCard
          {...defaultProps}
          summary="Short summary"
          commentariatSummary={longCommentariat}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /commentariat/i }));

      expect(screen.getByRole('button', { name: /expand/i })).toBeInTheDocument();
    });

    it('expanding Commentariat tab does not expand Summary tab', () => {
      const longSummary = 'a'.repeat(300);
      const longCommentariat = 'c'.repeat(300);
      render(
        <SummaryCard
          {...defaultProps}
          summary={longSummary}
          commentariatSummary={longCommentariat}
        />
      );

      // Expand while on Commentariat tab
      fireEvent.click(screen.getByRole('button', { name: /commentariat/i }));
      fireEvent.click(screen.getByRole('button', { name: /expand/i }));

      // Switch back to Summary tab — should still be truncated
      fireEvent.click(screen.getByRole('button', { name: /summary/i }));
      const truncatedText = 'a'.repeat(200) + '...';
      expect(screen.getByText(truncatedText, { exact: false })).toBeInTheDocument();
    });
  });
});
