import { Link } from 'react-router';

/** Deliberately reveals nothing about whether a resource exists (research.md §5). */
export function NotFound() {
  return (
    <div className="stack">
      <h1>Not found</h1>
      <p className="muted">This page doesn't exist or you don't have access to it.</p>
      <p>
        <Link to="/">Back to your dashboard</Link>
      </p>
    </div>
  );
}
