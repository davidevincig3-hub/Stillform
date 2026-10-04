import type { Exercise, GymWorkout } from '../domain/gym';
import { gymStoreSchema, type GymStore } from '../repositories/gym-storage';
export const hevyColumns = [
  'title',
  'start_time',
  'end_time',
  'description',
  'exercise_title',
  'superset_id',
  'exercise_notes',
  'set_index',
  'set_type',
  'weight_kg',
  'reps',
  'distance_km',
  'duration_seconds',
  'rpe',
] as const;
export interface HevyRow {
  order: number;
  name: string;
  notes: string;
  index: number;
  type: string;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  distance: number | null;
  duration: number | null;
  superset: string | null;
}
export interface HevyWorkout {
  title: string;
  description: string;
  start: string;
  end: string;
  sourceStart: string;
  sourceEnd: string;
  rows: HevyRow[];
  fingerprint: string;
}
export interface HevyParsed {
  workouts: HevyWorkout[];
  names: string[];
  rowCount: number;
  errors: string[];
  warnings: string[];
  timeZone: string;
}
export interface ExerciseMapping {
  incomingName: string;
  exerciseId: string | null;
  resolution: 'unresolved' | 'existing' | 'create-new' | 'synonym';
  custom?: Exercise;
}
export interface HevyCsvParser {
  parse(csv: string, timeZone: string): HevyParsed;
}
// Quoted fields, embedded newlines and escaped quotes. Never log source rows.
export function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let closed = false;
  const input = csv.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
    } else if (c === ',' || c === '\n' || c === '\r') {
      row.push(cell);
      cell = '';
      closed = false;
      if (c !== ',') {
        if (row.some((v) => v !== '')) rows.push(row);
        row = [];
        if (c === '\r' && input[i + 1] === '\n') i++;
      }
    } else if (c === '"' && !cell && !closed) quoted = true;
    else {
      if (closed || c === '"') throw new Error('Invalid CSV quoting');
      cell += c;
    }
  }
  if (quoted) throw new Error('Unclosed CSV quote');
  row.push(cell);
  if (row.some((v) => v !== '')) rows.push(row);
  return rows;
}
const months = [
  'gen',
  'feb',
  'mar',
  'apr',
  'mag',
  'giu',
  'lug',
  'ago',
  'set',
  'ott',
  'nov',
  'dic',
];
// Wall time in an explicitly selected IANA zone. Reject DST gaps and ambiguous times.
export function parseItalianDate(value: string, timeZone: string): string {
  const m = /^(\d{1,2}) ([a-z]{3}) (\d{4}), (\d{2}):(\d{2})$/i.exec(
    value.trim(),
  );
  if (!m) throw new Error('Unknown Italian timestamp format');
  const month = months.indexOf(m[2].toLowerCase()),
    day = Number(m[1]),
    year = Number(m[3]),
    hour = Number(m[4]),
    minute = Number(m[5]);
  const wall = Date.UTC(year, month, day, hour, minute),
    check = new Date(wall);
  if (
    month < 0 ||
    year < 1900 ||
    year > 2200 ||
    check.getUTCMonth() !== month ||
    check.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59
  )
    throw new Error('Invalid Italian date');
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  function localStamp(t: number) {
    const p = Object.fromEntries(
      formatter.formatToParts(t).map((p) => [p.type, p.value]),
    );
    return Date.UTC(
      Number(p.year),
      Number(p.month) - 1,
      Number(p.day),
      Number(p.hour),
      Number(p.minute),
      Number(p.second),
    );
  }
  const offsets = new Set(
    [-86400000, 0, 86400000].map(
      (delta) => localStamp(wall + delta) - (wall + delta),
    ),
  );
  const matches = [...offsets]
    .map((offset) => wall - offset)
    .filter((t) => localStamp(t) === wall);
  if (matches.length !== 1)
    throw new Error('Ambiguous or nonexistent local timestamp');
  return new Date(matches[0]).toISOString();
}
export const verifiedHevyParser: HevyCsvParser = {
  parse(csv, timeZone) {
    const result: HevyParsed = {
      workouts: [],
      names: [],
      rowCount: 0,
      errors: [],
      warnings: [],
      timeZone,
    };
    let table: string[][];
    try {
      table = parseCsv(csv);
    } catch {
      result.errors.push('Invalid CSV quoting; nothing can be imported.');
      return result;
    }
    const header = table.shift() ?? [];
    if (
      header.length !== hevyColumns.length ||
      new Set(header).size !== header.length ||
      hevyColumns.some((c) => !header.includes(c))
    ) {
      result.errors.push(
        'CSV must contain exactly the 14 verified Hevy columns.',
      );
      return result;
    }
    result.rowCount = table.length;
    const groups = new Map<string, HevyWorkout>(),
      dateCache = new Map<string, string>();
    const date = (raw: string) => {
      if (!dateCache.has(raw))
        dateCache.set(raw, parseItalianDate(raw, timeZone));
      return dateCache.get(raw)!;
    };
    let unknownEffort = 0,
      unrecordedLoad = 0,
      nonResistance = 0;
    table.forEach((cells, i) => {
      try {
        if (cells.length !== header.length)
          throw new Error('Column count mismatch');
        const record = Object.fromEntries(header.map((h, j) => [h, cells[j]]));
        const number = (
          key: string,
          integer = false,
          max = Number.MAX_SAFE_INTEGER,
        ) => {
          const v = record[key].trim();
          if (!v) return null;
          if (!/^\d+(?:\.\d+)?$/.test(v)) throw new Error(`Invalid ${key}`);
          const n = Number(v);
          if (
            !Number.isFinite(n) ||
            n > max ||
            (integer && !Number.isInteger(n))
          )
            throw new Error(`Invalid ${key}`);
          return n;
        };
        const start = date(record.start_time),
          end = date(record.end_time);
        if (end < start) throw new Error('End precedes start');
        if (!record.exercise_title.trim() || !record.title.trim())
          throw new Error('Missing workout/exercise title');
        const index = number('set_index', true);
        if (index === null) throw new Error('Missing set_index');
        const weight = number('weight_kg', false, 1000),
          reps = number('reps', true),
          rpe = number('rpe', false, 10),
          distance = number('distance_km'),
          duration = number('duration_seconds');
        if (rpe !== null && rpe < 1) throw new Error('RPE outside 1-10');
        if (!record.set_type.trim()) throw new Error('Missing set_type');
        const row: HevyRow = {
          order: 0,
          name: record.exercise_title,
          notes: record.exercise_notes,
          index,
          type: record.set_type,
          weight,
          reps,
          rpe,
          distance,
          duration,
          superset: record.superset_id || null,
        };
        if (reps === null && distance === null && duration === null)
          result.warnings.push(
            `Row ${i + 2}: no repetitions, distance or duration recorded; preserved as unknown.`,
          );
        if (!['normal', 'failure', 'warmup', 'dropset'].includes(row.type))
          result.warnings.push(
            `Row ${i + 2}: unfamiliar set type; preserved unchanged.`,
          );
        if (rpe === null && row.type !== 'failure') unknownEffort++;
        if (weight === null) unrecordedLoad++;
        if (distance !== null || duration !== null) nonResistance++;
        const key = JSON.stringify([
          record.start_time,
          record.end_time,
          record.title,
          record.description,
        ]);
        let w = groups.get(key);
        if (!w) {
          w = {
            title: record.title,
            description: record.description,
            start,
            end,
            sourceStart: record.start_time,
            sourceEnd: record.end_time,
            rows: [],
            fingerprint: '',
          };
          groups.set(key, w);
        }
        row.order = w.rows.length;
        w.rows.push(row);
      } catch (error) {
        result.errors.push(
          `Row ${i + 2}: ${error instanceof Error ? error.message : 'Invalid value'}.`,
        );
      }
    });
    result.workouts = [...groups.values()].sort((a, b) =>
      a.start.localeCompare(b.start),
    );
    let repeatedIndices = 0;
    for (const workout of result.workouts) {
      let name = '';
      const seen = new Set<number>();
      for (const row of workout.rows) {
        if (row.name !== name) {
          name = row.name;
          seen.clear();
        }
        if (seen.has(row.index)) {
          repeatedIndices++;
          seen.clear();
        }
        seen.add(row.index);
      }
    }
    if (repeatedIndices)
      result.warnings.push(
        `${repeatedIndices} repeated set indices within exercise runs; preserved as separate exercise blocks. Review original ordering in workout detail.`,
      );
    result.names = [
      ...new Set(result.workouts.flatMap((w) => w.rows.map((r) => r.name))),
    ].sort();
    result.warnings.push(
      `${unknownEffort} sets lack effort information; RIR remains unknown on every imported set.`,
      `${unrecordedLoad} sets have unrecorded load; no bodyweight assumption is made.`,
      `${nonResistance} rows contain distance/duration; preserved unchanged. All completed set types count in descriptive set totals.`,
    );
    if (!result.rowCount) result.errors.push('No set rows found.');
    return result;
  },
};
export async function previewHevyImport(
  csv: string,
  timeZone = 'Europe/Rome',
  parser: HevyCsvParser = verifiedHevyParser,
): Promise<HevyParsed> {
  const parsed = parser.parse(csv, timeZone);
  for (const w of parsed.workouts) {
    const source = JSON.stringify([
      'hevy-csv-v1',
      timeZone,
      w.sourceStart,
      w.sourceEnd,
      w.title,
      w.description,
      w.rows,
    ]);
    const hash = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(source),
    );
    w.fingerprint = Array.from(new Uint8Array(hash), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
  }
  return parsed;
}
export function initialMappings(
  parsed: HevyParsed,
  store: GymStore,
): ExerciseMapping[] {
  return parsed.names.map((incomingName) => {
    const id = store.hevyMappings[incomingName],
      valid = store.exercises.some((e) => e.id === id);
    return {
      incomingName,
      exerciseId: valid ? id : null,
      resolution: valid ? 'existing' : 'unresolved',
    };
  });
}
export function suggestedExercises(name: string, exercises: Exercise[]) {
  const words = name.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return exercises
    .filter((e) =>
      words.some((w) => w.length > 3 && e.name.toLowerCase().includes(w)),
    )
    .slice(0, 5);
}
export type DuplicateDecision = 'skip' | 'separate';
export function duplicateStatus(
  w: HevyWorkout,
  store: GymStore,
  parsed?: HevyParsed,
): 'new' | 'duplicate' | 'ambiguous' {
  if (store.history.some((h) => h.provenance.fingerprint === w.fingerprint))
    return 'duplicate';
  if (
    store.history.some((h) => h.startedAt === w.start) ||
    (parsed && parsed.workouts.filter((x) => x.start === w.start).length > 1)
  )
    return 'ambiguous';
  return 'new';
}
export interface HevyPlan {
  store: GymStore;
  base: string;
  summary: {
    workouts: number;
    sets: number;
    duplicates: number;
    skippedSets: number;
    customExercises: number;
    mappedNames: number;
    existingMappings: number;
    warnings: string[];
    start: string | null;
    end: string | null;
  };
}
export function buildHevyPlan(
  store: GymStore,
  parsed: HevyParsed,
  mappings: ExerciseMapping[],
  decisions: Record<string, DuplicateDecision>,
  now = new Date().toISOString(),
): HevyPlan {
  if (parsed.errors.length || !parsed.workouts.length)
    throw new Error('Resolve parser errors before import');
  if (
    parsed.names.some(
      (name) =>
        !mappings.some(
          (m) =>
            m.incomingName === name &&
            m.resolution !== 'unresolved' &&
            m.exerciseId,
        ),
    )
  )
    throw new Error('Resolve every exercise mapping');
  const batchId = crypto.randomUUID(),
    exercises = [...store.exercises],
    lookup = new Map<string, Exercise>();
  for (const m of mappings) {
    if (
      m.resolution === 'create-new' &&
      m.custom &&
      m.custom.id === m.exerciseId &&
      m.custom.custom &&
      !exercises.some((e) => e.id === m.custom!.id)
    )
      exercises.push(m.custom);
  }
  for (const name of parsed.names) {
    const mapping = mappings.find((m) => m.incomingName === name)!;
    let exercise = exercises.find((e) => e.id === mapping.exerciseId);
    if (
      !exercise &&
      mapping.resolution === 'create-new' &&
      mapping.custom &&
      mapping.custom.id === mapping.exerciseId &&
      mapping.custom.custom
    ) {
      exercise = mapping.custom;
      exercises.push(exercise);
    }
    if (!exercise) throw new Error('Mapping references an unknown exercise');
    lookup.set(name, exercise);
  }
  let duplicates = 0,
    skippedSets = 0;
  const workouts: GymWorkout[] = [];
  for (const w of parsed.workouts) {
    if (!/^[a-f0-9]{64}$/.test(w.fingerprint))
      throw new Error('Unverified fingerprint');
    const status = duplicateStatus(w, store, parsed);
    if (
      status === 'duplicate' ||
      (status === 'ambiguous' && decisions[w.fingerprint] === 'skip')
    ) {
      duplicates++;
      skippedSets += w.rows.length;
      continue;
    }
    if (status === 'ambiguous' && decisions[w.fingerprint] !== 'separate')
      throw new Error('Review possible duplicates');
    const blocks: HevyRow[][] = [];
    for (const row of w.rows) {
      const last = blocks.at(-1);
      if (
        last?.[0].name === row.name &&
        !last.some((r) => r.index === row.index)
      )
        last.push(row);
      else blocks.push([row]);
    }
    workouts.push({
      id: `hevy-${w.fingerprint}`,
      routineId: null,
      routineName: w.title,
      routineSnapshot: null,
      startedAt: w.start,
      endedAt: w.end,
      durationMinutes: (Date.parse(w.end) - Date.parse(w.start)) / 60000,
      status: 'completed',
      dataOrigin: 'user',
      notes: w.description,
      provenance: {
        source: 'hevy_import',
        recordedAt: now,
        fingerprint: w.fingerprint,
        externalId: w.fingerprint,
        batchId,
        originalTitle: w.title,
        sourceStart: w.sourceStart,
        sourceEnd: w.sourceEnd,
        timeZone: parsed.timeZone,
      },
      exercises: blocks.map((rows, ei) => {
        const e = lookup.get(rows[0].name)!;
        return {
          id: `hevy-${w.fingerprint}-e${ei}`,
          exerciseId: e.id,
          name: e.name,
          sourceName: rows[0].name,
          primaryMuscleGroup: e.primaryMuscleGroup,
          secondaryMuscleGroups: e.secondaryMuscleGroups,
          equipment: e.equipment,
          repRange: null,
          notes: [...new Set(rows.map((r) => r.notes).filter(Boolean))].join(
            '\n',
          ),
          sets: [...rows]
            .sort((a, b) => a.index - b.index)
            .map((r, si) => ({
              id: `hevy-${w.fingerprint}-e${ei}-s${si}`,
              weight: r.weight,
              reps: r.reps,
              rir: null,
              rpe: r.rpe,
              failure: r.type === 'failure',
              completed: true,
              loggedAt: null,
              setType: r.type,
              sourceSetIndex: r.index,
              sourceRowOrder: r.order,
              sourceExerciseNotes: r.notes,
              distanceKm: r.distance,
              durationSeconds: r.duration,
              supersetId: r.superset,
            })),
        };
      }),
    });
  }
  const warnings = [...parsed.warnings],
    unknown = [...lookup.values()].filter(
      (e) => e.primaryMuscleGroup === 'Unassigned',
    ).length;
  if (unknown)
    warnings.push(
      `${unknown} source names map to Unassigned muscle metadata; totals remain in an explicit Unassigned group.`,
    );
  const summary = {
    workouts: workouts.length,
    sets: workouts.reduce(
      (n, w) => n + w.exercises.reduce((t, e) => t + e.sets.length, 0),
      0,
    ),
    duplicates,
    skippedSets,
    customExercises: exercises.length - store.exercises.length,
    mappedNames: parsed.names.length,
    existingMappings: mappings.filter((m) =>
      store.exercises.some((e) => e.id === m.exerciseId),
    ).length,
    warnings,
    start: workouts[0]?.startedAt ?? null,
    end: workouts.at(-1)?.startedAt ?? null,
  };
  const next = gymStoreSchema.parse({
    ...store,
    exercises,
    history: [...store.history, ...workouts].sort((a, b) =>
      b.startedAt.localeCompare(a.startedAt),
    ),
    hevyMappings: {
      ...store.hevyMappings,
      ...Object.fromEntries(
        mappings.map((m) => [m.incomingName, m.exerciseId!]),
      ),
    },
    importBatches: [
      ...store.importBatches,
      {
        id: batchId,
        importedAt: now,
        source: 'hevy_import',
        workouts: summary.workouts,
        sets: summary.sets,
        duplicates,
        skippedSets,
        customExercises: summary.customExercises,
        warnings,
        timeZone: parsed.timeZone,
      },
    ],
  });
  return { store: next, base: JSON.stringify(store), summary };
}
// One validated writer call. localStorage.setItem is atomic, including quota failure.
export function commitHevyPlan(
  plan: HevyPlan,
  current: GymStore,
  explicitApproval: boolean,
  save: (store: GymStore) => boolean,
) {
  if (!explicitApproval) throw new Error('Explicit confirmation required');
  if (JSON.stringify(current) !== plan.base)
    throw new Error(
      'Gym changed since preview. Review a fresh import summary.',
    );
  const validated = gymStoreSchema.parse(plan.store);
  if (!save(validated))
    throw new Error('Batch could not be saved. Nothing imported.');
  return plan.summary;
}
