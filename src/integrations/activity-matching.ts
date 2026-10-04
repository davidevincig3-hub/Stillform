import type {
  CanonicalActivity,
  ActivityRegistry,
  GymLink,
  ExternalActivitySource,
} from '../domain/activity';
export interface MatchCandidate {
  activityId: string;
  confidence: 'high' | 'possible';
  reasons: string[];
}
export function matchCandidates(
  incoming: CanonicalActivity,
  activities: CanonicalActivity[],
): MatchCandidate[] {
  return activities
    .filter(
      (a) =>
        a.id !== incoming.id &&
        a.status === 'confirmed' &&
        a.sport === incoming.sport,
    )
    .flatMap((a) => {
      const start =
        Math.abs(Date.parse(a.startedAt) - Date.parse(incoming.startedAt)) /
        1000;
      if (start > 600) return [];
      const duration =
        a.elapsedSeconds !== null && incoming.elapsedSeconds !== null
          ? Math.abs(a.elapsedSeconds - incoming.elapsedSeconds)
          : null;
      const distance =
        a.distanceM !== null && incoming.distanceM !== null
          ? Math.abs(a.distanceM - incoming.distanceM) /
            Math.max(1, a.distanceM, incoming.distanceM)
          : null;
      if (
        duration !== null &&
        duration > Math.max(900, (a.elapsedSeconds ?? 0) * 0.25)
      )
        return [];
      const high =
        start <= 60 &&
        duration !== null &&
        duration <= Math.max(60, (a.elapsedSeconds ?? 0) * 0.02) &&
        (incoming.sport === 'strength' ||
          (distance !== null && distance <= 0.02));
      return [
        {
          activityId: a.id,
          confidence: high ? ('high' as const) : ('possible' as const),
          reasons: [
            `Start differs by ${Math.round(start)} s`,
            duration === null
              ? 'Duration unavailable'
              : `Elapsed duration differs by ${Math.round(duration)} s`,
            distance === null
              ? 'Distance unavailable'
              : `Distance differs by ${(distance * 100).toFixed(1)}%`,
            'Policy v1 heuristic; not statistical confidence',
          ],
        },
      ];
    });
}
export function attachSource(
  registry: ActivityRegistry,
  target: CanonicalActivity,
  incoming: CanonicalActivity,
  source: ExternalActivitySource,
) {
  source.activityId = target.id;
  if (!target.sourceKeys.includes(source.key))
    target.sourceKeys.push(source.key);
  // Existing selected values retain their provider; new sources supply only absent fields.
  for (const field of [
    'elapsedSeconds',
    'movingSeconds',
    'distanceM',
    'elevationM',
    'averageHr',
    'maxHr',
    'averageSpeed',
    'device',
    'timeZone',
    'localStart',
  ] as const)
    if (target[field] === null && incoming[field] !== null) {
      Object.assign(target, { [field]: incoming[field] });
      target.fieldSources[field] = incoming.fieldSources[field] ?? source.key;
    }
  target.updatedAt = source.syncedAt;
  target.quality.available = [
    ...new Set([...target.quality.available, ...incoming.quality.available]),
  ];
  target.quality.missing = target.quality.missing.filter(
    (f) => !target.quality.available.includes(f),
  );
  if (target.status === 'source_deleted') target.status = 'confirmed';
  if (!registry.sources.some((s) => s.key === source.key))
    registry.sources.push(source);
}
export function registerGymLinks(
  registry: ActivityRegistry,
  links: GymLink[],
  now: string,
) {
  for (const g of links) {
    const id = `gym-${g.id}`;
    if (registry.activities.some((a) => a.gymWorkoutId === g.id)) continue;
    const key = `${g.source === 'hevy_import' ? 'hevy' : 'internal'}:${g.id}`;
    registry.activities.push({
      id,
      sport: 'strength',
      title: g.title,
      startedAt: g.startedAt,
      localStart: null,
      timeZone: null,
      elapsedSeconds:
        g.durationMinutes === null ? null : g.durationMinutes * 60,
      movingSeconds: null,
      distanceM: null,
      elevationM: null,
      averageHr: null,
      maxHr: null,
      averageSpeed: null,
      device: null,
      status: 'confirmed',
      quality: {
        available: [
          'startedAt',
          ...(g.durationMinutes === null ? [] : ['elapsedSeconds']),
        ],
        missing: [],
        confidence: 'recorded',
      },
      fieldSources: { title: key, startedAt: key, elapsedSeconds: key },
      sourceKeys: [key],
      gymWorkoutId: g.id,
      plannedSessionId: null,
      createdAt: now,
      updatedAt: now,
    });
    registry.sources.push({
      key,
      provider: g.source === 'hevy_import' ? 'hevy' : 'internal',
      externalId: g.id,
      athleteId: null,
      activityId: id,
      providerType: 'CompletedWorkout',
      syncedAt: now,
      device: null,
      fingerprint: g.id,
      deleted: false,
      raw: { ...g },
      previous: [],
    });
  }
  // A previously unmatched Strava shell can be reviewed when Gym summaries arrive later.
  for (const a of registry.activities.filter(
    (a) =>
      a.sport === 'strength' && !a.gymWorkoutId && a.status === 'confirmed',
  )) {
    const source = registry.sources.find(
      (s) => s.activityId === a.id && s.provider === 'strava',
    );
    if (!source || registry.decisions[source.key]) continue;
    const candidates = matchCandidates(
      a,
      registry.activities.filter((c) => c.gymWorkoutId !== null),
    );
    if (!candidates.length) continue;
    a.status = 'review';
    if (!registry.reviews.some((r) => r.sourceKey === source.key))
      registry.reviews.push({
        sourceKey: source.key,
        incomingId: a.id,
        candidates,
      });
  }
}
export function ingestActivity(
  registry: ActivityRegistry,
  incoming: CanonicalActivity,
  source: ExternalActivitySource,
): 'new' | 'linked' | 'review' | 'existing' {
  const old = registry.sources.find((s) => s.key === source.key);
  if (old) {
    old.syncedAt = source.syncedAt;
    old.providerType = source.providerType;
    if (old.fingerprint !== source.fingerprint) {
      old.previous.push(old.raw);
      old.raw = source.raw;
      old.fingerprint = source.fingerprint;
      old.syncedAt = source.syncedAt;
      if (source.device !== null) old.device = source.device;
      old.deleted = false;
      const a = registry.activities.find((a) => a.id === old.activityId)!;
      for (const f of [
        'title',
        'sport',
        'startedAt',
        'elapsedSeconds',
        'movingSeconds',
        'distanceM',
        'elevationM',
        'averageHr',
        'maxHr',
        'averageSpeed',
        'device',
        'localStart',
        'timeZone',
      ] as const)
        if (a.fieldSources[f] === source.key && incoming[f] !== null)
          Object.assign(a, { [f]: incoming[f] });
      attachSource(registry, a, incoming, old);
    } else if (old.deleted) {
      old.deleted = false;
      attachSource(
        registry,
        registry.activities.find((a) => a.id === old.activityId)!,
        incoming,
        old,
      );
    }
    return 'existing';
  }
  const decision = registry.decisions[source.key];
  const candidates = matchCandidates(incoming, registry.activities);
  for (const c of candidates) {
    if (
      registry.sources.some(
        (s) => s.activityId === c.activityId && s.provider === source.provider,
      )
    ) {
      c.confidence = 'possible';
      c.reasons.push(
        'Different permanent IDs from the same provider require review',
      );
    }
  }
  const high = candidates.filter((c) => c.confidence === 'high');
  const targetId =
    decision?.action === 'link'
      ? decision.targetId
      : !decision && high.length === 1 && candidates.length === 1
        ? high[0].activityId
        : null;
  const target = registry.activities.find((a) => a.id === targetId);
  if (target) {
    attachSource(registry, target, incoming, source);
    return 'linked';
  }
  if (!decision && candidates.length) {
    incoming.status = 'review';
    registry.reviews.push({
      sourceKey: source.key,
      incomingId: incoming.id,
      candidates,
    });
  }
  registry.activities.push(incoming);
  registry.sources.push(source);
  return incoming.status === 'review' ? 'review' : 'new';
}
export function resolveActivityMatch(
  registry: ActivityRegistry,
  sourceKey: string,
  targetId: string | null,
  now: string,
) {
  const review = registry.reviews.find((r) => r.sourceKey === sourceKey);
  if (!review) throw new Error('Review not found');
  const incoming = registry.activities.find((a) => a.id === review.incomingId)!;
  if (targetId) {
    if (!review.candidates.some((c) => c.activityId === targetId))
      throw new Error('Candidate not found');
    const target = registry.activities.find((a) => a.id === targetId);
    if (!target) throw new Error('Target not found');
    for (const linked of registry.sources.filter((s) =>
      incoming.sourceKeys.includes(s.key),
    ))
      attachSource(registry, target, incoming, linked);
    registry.activities = registry.activities.filter(
      (a) => a.id !== incoming.id,
    );
    registry.aliases[incoming.id] = target.id;
    for (const key of Object.keys(registry.aliases))
      if (registry.aliases[key] === incoming.id)
        registry.aliases[key] = target.id;
  } else incoming.status = 'confirmed';
  registry.decisions[sourceKey] = {
    action: targetId ? 'link' : 'separate',
    targetId,
    decidedAt: now,
  };
  registry.reviews = registry.reviews.filter((r) => r.sourceKey !== sourceKey);
}
export function activitiesInWindow(
  registry: ActivityRegistry,
  from: string,
  to: string,
) {
  return registry.activities.filter(
    (a) => a.status === 'confirmed' && a.startedAt >= from && a.startedAt <= to,
  );
}
