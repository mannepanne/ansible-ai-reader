// ABOUT: Home page - Hello world for Phase 1
// ABOUT: Will be replaced with login redirect in Phase 2

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">Ansible</h1>
        <p className="text-xl text-gray-600">
          AI-Powered Reading Triage for Readwise Reader
        </p>
        <p className="mt-8 text-sm text-gray-500">
          Phase 1: Foundation - Hello World ✓
        </p>
      </div>
    </main>
  );
}
