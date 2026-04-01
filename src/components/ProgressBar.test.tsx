// ABOUT: Tests for ProgressBar component
// ABOUT: Validates progress display, counter, and width calculations

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProgressBar from './ProgressBar';

describe('ProgressBar', () => {
  it('renders title and progress counter', () => {
    render(
      <ProgressBar title="Test Progress" completed={5} failed={2} total={10} />
    );

    expect(screen.getByText('Test Progress')).toBeInTheDocument();
    expect(screen.getByText('7 / 10')).toBeInTheDocument();
  });

  it('calculates progress bar width correctly', () => {
    const { container } = render(
      <ProgressBar
        title="Test Progress"
        completed={3}
        failed={1}
        total={10}
      />
    );

    // Find the progress bar fill (inner div with width style)
    const progressBars = container.querySelectorAll('div[style*="width"]');
    // The second div with width is the progress bar fill (first is container at 100%)
    const progressBar = Array.from(progressBars).find((el) =>
      (el as HTMLElement).style.width.includes('40%')
    );

    expect(progressBar).toBeInTheDocument();
  });

  it('handles zero total gracefully', () => {
    render(
      <ProgressBar title="Empty Progress" completed={0} failed={0} total={0} />
    );

    expect(screen.getByText('Empty Progress')).toBeInTheDocument();
    expect(screen.getByText('0 / 0')).toBeInTheDocument();
  });

  it('handles 100% completion correctly', () => {
    const { container } = render(
      <ProgressBar
        title="Complete"
        completed={8}
        failed={2}
        total={10}
      />
    );

    const progressBars = container.querySelectorAll('div[style*="width"]');
    const progressBar = Array.from(progressBars).find((el) =>
      (el as HTMLElement).style.width.includes('100%')
    );

    expect(progressBar).toBeInTheDocument();
    expect(screen.getByText('10 / 10')).toBeInTheDocument();
  });

  it('includes both completed and failed in progress calculation', () => {
    const { container } = render(
      <ProgressBar
        title="Mixed Results"
        completed={6}
        failed={2}
        total={10}
      />
    );

    // 6 completed + 2 failed = 8 out of 10 = 80%
    const progressBars = container.querySelectorAll('div[style*="width"]');
    const progressBar = Array.from(progressBars).find((el) =>
      (el as HTMLElement).style.width.includes('80%')
    );

    expect(progressBar).toBeInTheDocument();
    expect(screen.getByText('8 / 10')).toBeInTheDocument();
  });

  it('uses correct styling colors', () => {
    const { container } = render(
      <ProgressBar title="Styled Progress" completed={5} failed={0} total={10} />
    );

    // Check container has light blue background (browsers normalize hex to RGB)
    const containerDiv = container.firstChild as HTMLElement;
    expect(containerDiv.style.background).toBe('rgb(209, 236, 241)');
    expect(containerDiv.style.border).toBe('1px solid rgb(190, 229, 235)');

    // Check progress bar has darker blue fill
    const progressBars = container.querySelectorAll('div[style*="background"]');
    const progressBar = Array.from(progressBars).find((el) =>
      (el as HTMLElement).style.background.includes('rgb(23, 162, 184)')
    );
    expect(progressBar).toBeInTheDocument();
  });

  it('renders with different titles correctly', () => {
    const { rerender } = render(
      <ProgressBar title="Sync Progress" completed={1} failed={0} total={5} />
    );
    expect(screen.getByText('Sync Progress')).toBeInTheDocument();

    rerender(
      <ProgressBar
        title="Tag Regeneration Progress"
        completed={1}
        failed={0}
        total={5}
      />
    );
    expect(screen.getByText('Tag Regeneration Progress')).toBeInTheDocument();
  });

  it('handles partial progress correctly', () => {
    render(
      <ProgressBar
        title="Partial"
        completed={2}
        failed={1}
        total={20}
      />
    );

    // 2 + 1 = 3 out of 20 = 15%
    expect(screen.getByText('3 / 20')).toBeInTheDocument();
  });
});
