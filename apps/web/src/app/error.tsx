"use client";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="container page" id="main">
      <div className="notice" role="alert">
        <h2>Something broke on this page</h2>
        <p>{error.message || "An unexpected error happened."}</p>
        <p>
          <button type="button" className="btn btn-primary" onClick={reset}>Try again</button>
        </p>
      </div>
    </main>
  );
}
