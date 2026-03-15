// ABOUT: Legacy login page - redirects to home page
// ABOUT: Maintained for backwards compatibility with old bookmarks/links

import { redirect } from 'next/navigation';

export default function LoginPage() {
  // Redirect to home page where login form is now integrated
  redirect('/');
}
