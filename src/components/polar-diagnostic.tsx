import type { PolarDiagnostic } from '@/domain/polar';

export function PolarDiagnosticDetails({
  diagnostic,
}: {
  diagnostic: PolarDiagnostic | null | undefined;
}) {
  if (!diagnostic) return null;
  return (
    <details>
      <summary>Provider diagnostic</summary>
      <p className="caption">
        {diagnostic.family} · {diagnostic.endpoint} · HTTP {diagnostic.status} ·{' '}
        {diagnostic.contentType ?? 'Content type unavailable'} · refresh
        attempted: {diagnostic.refreshAttempted ? 'Yes' : 'No'} · token
        refreshed in this operation: {diagnostic.refreshed ? 'Yes' : 'No'}
      </p>
      <pre className="whitespace-pre-wrap break-all text-xs">
        {diagnostic.body || 'No provider error body'}
      </pre>
    </details>
  );
}
