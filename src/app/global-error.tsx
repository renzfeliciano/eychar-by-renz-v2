"use client";

// Only when the root layout itself fails (app/error.tsx can't render then):
// a bare page with no providers or styles beyond these inline ones.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#faf8f4", color: "#171e2b" }}>
        <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div role="alert" style={{ maxWidth: 380, textAlign: "center", background: "#fff", borderRadius: 12, padding: "32px 24px", boxShadow: "0 1px 3px rgba(0,0,0,.1)" }}>
            <h1 style={{ fontSize: 18, margin: "0 0 8px" }}>The app couldn&apos;t load</h1>
            <p style={{ fontSize: 14, color: "#52514e", margin: "0 0 16px" }}>Try again in a moment. If it keeps happening, send your administrator the reference below.</p>
            {error.digest && <p style={{ fontFamily: "monospace", fontSize: 12, color: "#52514e" }}>Reference: {error.digest}</p>}
            <button type="button" onClick={reset} style={{ font: "inherit", fontSize: 14, padding: "8px 16px", borderRadius: 8, border: 0, background: "#1463ff", color: "#fff", cursor: "pointer" }}>
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
