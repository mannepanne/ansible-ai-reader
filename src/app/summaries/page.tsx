// ABOUT: Summaries page placeholder (Phase 3 implementation pending)
// ABOUT: Shows authenticated user info and logout button

import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';

export default async function SummariesPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow rounded-lg p-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Summaries
          </h1>

          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-md">
            <p className="text-green-800">
              ✅ Authentication successful!
            </p>
            <p className="text-sm text-green-600 mt-2">
              Logged in as: <strong>{session.user.email}</strong>
            </p>
          </div>

          <div className="prose max-w-none">
            <p className="text-gray-600">
              This is a placeholder page. The actual summaries feature will be implemented in Phase 3 (Reader Integration).
            </p>

            <div className="mt-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">
                Phase 2 Complete ✅
              </h2>
              <ul className="text-gray-600 space-y-1">
                <li>✅ Magic link authentication working</li>
                <li>✅ Protected routes redirect to login</li>
                <li>✅ Session management active</li>
                <li>✅ Middleware protecting routes</li>
              </ul>
            </div>

            <div className="mt-8">
              <form action="/api/auth/logout" method="POST">
                <button
                  type="submit"
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                >
                  Logout
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
