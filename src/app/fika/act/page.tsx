// ABOUT: GET landing page for Fika email action links
// ABOUT: Renders a form that auto-submits the token to the POST endpoint; a GET alone never writes

import AutoSubmitForm from './AutoSubmitForm';

export const dynamic = 'force-dynamic';

// This is the one URL that carries a token; keep it out of search indexes
export const metadata = { robots: { index: false, follow: false } };

const wrap: React.CSSProperties = {
  maxWidth: '600px',
  margin: '0 auto',
  padding: '32px 16px',
  fontFamily: "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
  color: '#212529',
};
const card: React.CSSProperties = { background: '#fff', border: '1px solid #dee2e6', borderRadius: '6px', padding: '22px' };

export default async function FikaActPage({ searchParams }: { searchParams: Promise<{ t?: string | string[] }> }) {
  const params = await searchParams;
  const token = Array.isArray(params.t) ? params.t[0] : params.t;

  return (
    <div style={{ background: '#f4f4f2', minHeight: '100vh' }}>
      <div style={wrap}>
        <div style={{ fontSize: '15px', fontWeight: 700, margin: '0 4px 14px' }}>
          Ansible <span style={{ color: '#6c757d', fontWeight: 500 }}>Fika</span>
        </div>
        <div style={card}>
          {token ? (
            <AutoSubmitForm token={token} />
          ) : (
            <>
              <div style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>Missing link</div>
              <p style={{ margin: '0 0 16px', color: '#6c757d', fontSize: '14px' }}>This page needs an action link from a Fika email.</p>
              <a href="/summaries" style={{ color: '#0d6efd', textDecoration: 'none', fontWeight: 600 }}>
                Open Ansible
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
