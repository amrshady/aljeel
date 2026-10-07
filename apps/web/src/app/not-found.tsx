export default function NotFound() {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.5rem', color: '#006EB3' }}>Page not found</h1>
          <p style={{ color: '#5c6b76' }}>That address is not part of the portal.</p>
          <a href="/en/login" style={{ color: '#006EB3' }}>
            Back to sign in
          </a>
        </div>
      </body>
    </html>
  );
}
