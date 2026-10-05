import 'server-only';
import type {
  CanonicalActivity,
  ExternalActivitySource,
  RichActivityData,
} from '../domain/activity';
import { polarFallbackTitle } from '../domain/activity-presentation';
import { normalizePolarFeatures, object } from './polar-normalize';

// Read projections repair old normalized views without rewriting source payloads.
export function presentActivity(
  a: CanonicalActivity,
  sources: ExternalActivitySource[],
) {
  const source = sources.find(
    (s) => s.provider === 'polar' && s.key === a.fieldSources.title,
  );
  if (!source) return a;
  const name = source.raw.name;
  if (typeof name === 'string' && name.trim()) return { ...a, title: name };
  const sportId = object(source.raw.sport).id;
  if (
    a.title !== source.providerType &&
    a.title !== String(sportId) &&
    a.title !== a.sport.toUpperCase()
  )
    return a;
  return {
    ...a,
    title: polarFallbackTitle(a.sport, a.localStart ?? a.startedAt),
  };
}
export function presentRichActivity(saved: RichActivityData) {
  const rich = saved.polar
    ? { ...saved, ...normalizePolarFeatures(saved.polar.raw, saved.sourceKey) }
    : saved;
  return {
    sourceKey: rich.sourceKey,
    fetchedAt: rich.fetchedAt,
    streamStatus: [
      ...rich.streams.map((s) => ({
        kind: s.kind,
        samples: s.data.length,
        seriesType: s.seriesType,
      })),
      ...(rich.polar?.exercises.flatMap((e, i) =>
        e.samples
          .filter((s) => s.values.some((v) => v !== null))
          .map((s) => ({
            kind: `Polar exercise ${i + 1} · ${s.type}`,
            samples: s.values.filter((v) => v !== null).length,
            seriesType: `interval ${s.intervalMillis ?? 'unknown'} ms · ${s.unit === 'provider_unspecified' ? 'unit unverified' : s.unit}`,
          })),
      ) ?? []),
    ],
    laps: rich.laps.map(({ raw, ...lap }) => {
      void raw;
      return lap;
    }),
    warnings: rich.warnings,
    polar: rich.polar
      ? {
          sensorQuality: rich.polar.sensorQuality,
          exercises: rich.polar.exercises.map((e) => ({
            ...e,
            samples: e.samples.map(({ values, ...s }) => ({
              ...s,
              count: values.filter((v) => v !== null).length,
              missing: values.filter((v) => v === null).length,
            })),
          })),
        }
      : undefined,
  };
}
