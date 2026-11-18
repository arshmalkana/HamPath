export default function Loading() {
  return (
    <main className="container page" id="main" aria-busy="true" aria-label="Loading">
      <div className="skeleton" style={{ height: 40, maxWidth: 520, marginBottom: 16 }} />
      <div className="skeleton" style={{ height: 20, maxWidth: 380, marginBottom: 48 }} />
      <div className="lesson-grid">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="skeleton" style={{ height: 76 }} />
        ))}
      </div>
    </main>
  );
}
