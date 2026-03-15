// ABOUT: Tests for login page redirect
// ABOUT: Validates that /login redirects to home page

import { describe, it, expect, vi } from 'vitest';
import { redirect } from 'next/navigation';
import LoginPage from './page';

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

describe('LoginPage', () => {
  it('redirects to home page', () => {
    // Calling the component triggers redirect
    LoginPage();
    expect(redirect).toHaveBeenCalledWith('/');
  });
});
