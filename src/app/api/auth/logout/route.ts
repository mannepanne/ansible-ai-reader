// ABOUT: Logout endpoint for user sign-out
// ABOUT: Clears session and redirects to login page

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: NextRequest) {
  // Show logout confirmation page for GET requests
  const requestUrl = new URL(request.url);

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Logout - Ansible</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body {
            font-family: system-ui, -apple-system, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            background: #f9fafb;
          }
          .container {
            background: white;
            padding: 2rem;
            border-radius: 0.5rem;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            max-width: 400px;
            text-align: center;
          }
          h1 {
            margin: 0 0 1rem;
            color: #111827;
          }
          p {
            color: #6b7280;
            margin: 0 0 2rem;
          }
          button {
            background: #dc2626;
            color: white;
            border: none;
            padding: 0.5rem 1rem;
            border-radius: 0.375rem;
            font-size: 0.875rem;
            font-weight: 500;
            cursor: pointer;
          }
          button:hover {
            background: #b91c1c;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Logout</h1>
          <p>Are you sure you want to log out?</p>
          <form method="POST" action="${requestUrl.pathname}">
            <button type="submit">Logout</button>
          </form>
        </div>
      </body>
    </html>
  `;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html' },
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // Sign out the user
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Failed to logout' },
      { status: 500 }
    );
  }

  // Redirect to login page
  const requestUrl = new URL(request.url);
  return NextResponse.redirect(`${requestUrl.origin}/login`);
}
