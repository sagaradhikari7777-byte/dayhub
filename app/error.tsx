"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="main-content">
      <section className="glass empty">
        <h1>Let’s try that again.</h1>
        <p>
          DayHub hit a temporary problem. Your saved records are still in the
          database.
        </p>
        <button className="primary" onClick={reset}>
          Try again
        </button>
      </section>
    </main>
  );
}
