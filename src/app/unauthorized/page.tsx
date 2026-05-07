/**
 * Unauthorized page — shown when a user lacks the required role.
 * Will be styled in Phase 3.
 */
export default function UnauthorizedPage() {
  return (
    <main style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>Ingen tilgang</h1>
      <p>Du har ikke tilgang til denne siden.</p>
    </main>
  );
}
