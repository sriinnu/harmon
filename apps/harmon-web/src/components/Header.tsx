export function Header() {
  return (
    <header style={{ textAlign: 'center', padding: '2em 0 1em' }}>
      <p style={{ fontSize: '0.8em', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)' }}>Harmon</p>
      <h1 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.5rem)', fontWeight: 700 }}>Music, your way.</h1>
    </header>
  );
}
