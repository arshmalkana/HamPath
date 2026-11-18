export default function LessonLoading() {
  return (
    <main className="container page" id="main" aria-busy="true" aria-label="Loading lesson">
      <div className="skeleton" style={{ height: 8, marginBottom: 40 }} />
      <div className="skeleton" style={{ height: 36, maxWidth: 420, marginBottom: 16 }} />
      <div className="skeleton" style={{ height: 18, maxWidth: 560, marginBottom: 8 }} />
      <div className="skeleton" style={{ height: 18, maxWidth: 500, marginBottom: 32 }} />
      <div className="skeleton" style={{ height: 280 }} />
    </main>
  );
}
