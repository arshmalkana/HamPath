import Link from "next/link";

export default function NotFound() {
  return (
    <main className="container page" id="main">
      <div className="notice">
        <h2>That page doesn't exist</h2>
        <p>Lessons are numbered like the exam: 5.04 is section 5, topic 4.</p>
        <p><Link className="btn btn-primary" href="/">Course map</Link></p>
      </div>
    </main>
  );
}
