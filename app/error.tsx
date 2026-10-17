"use client";

export default function Error({ reset }: { reset: () => void }) {
  return (
    <main className="shell center">
      <div className="card notice error">
        <p>Something went wrong.</p>
        <button className="btn" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
