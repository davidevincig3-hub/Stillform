import { z } from 'zod';
import { gymStoreSchema, type GymStore } from './gym-storage';
const arrayKeys = [
  'exercises',
  'routines',
  'history',
  'legacyArchive',
  'importBatches',
] as const;
const mapKeys = ['exercisePreferences', 'hevyMappings'] as const;
export const gymChangesSchema = z.object({
  arrays: z
    .partialRecord(
      z.enum(arrayKeys),
      z.object({ upsert: z.array(z.unknown()), remove: z.array(z.string()) }),
    )
    .default({}),
  maps: z
    .partialRecord(
      z.enum(mapKeys),
      z.object({
        set: z.record(z.string(), z.unknown()),
        remove: z.array(z.string()),
      }),
    )
    .default({}),
  active: z.object({ value: z.unknown() }).optional(),
});
export type GymChanges = z.infer<typeof gymChangesSchema>;
export function gymChanges(before: GymStore, after: GymStore): GymChanges {
  const result: GymChanges = { arrays: {}, maps: {} };
  for (const key of arrayKeys) {
    const old = new Map(before[key].map((x) => [x.id, JSON.stringify(x)]));
    const ids = new Set(after[key].map((x) => x.id));
    const upsert = after[key].filter(
      (x) => old.get(x.id) !== JSON.stringify(x),
    );
    const remove = before[key].filter((x) => !ids.has(x.id)).map((x) => x.id);
    if (upsert.length || remove.length) result.arrays[key] = { upsert, remove };
  }
  for (const key of mapKeys) {
    const set = Object.fromEntries(
      Object.entries(after[key]).filter(
        ([id, v]) => JSON.stringify(before[key][id]) !== JSON.stringify(v),
      ),
    );
    const remove = Object.keys(before[key]).filter((id) => !(id in after[key]));
    if (Object.keys(set).length || remove.length)
      result.maps[key] = { set, remove };
  }
  if (JSON.stringify(before.active) !== JSON.stringify(after.active))
    result.active = { value: after.active };
  return result;
}
export function applyGymChanges(store: GymStore, input: GymChanges): GymStore {
  const changes = gymChangesSchema.parse(input);
  const next = structuredClone(store);
  for (const key of arrayKeys) {
    const change = changes.arrays[key];
    if (!change) continue;
    const rows = new Map<string, unknown>(next[key].map((x) => [x.id, x]));
    for (const id of change.remove) rows.delete(id);
    for (const row of change.upsert) {
      const { id } = z.object({ id: z.string().min(1) }).parse(row);
      rows.set(id, row);
    }
    Object.assign(next, { [key]: [...rows.values()] });
  }
  for (const key of mapKeys) {
    const change = changes.maps[key];
    if (!change) continue;
    for (const id of change.remove) delete next[key][id];
    Object.assign(next[key], change.set);
  }
  if (changes.active) Object.assign(next, { active: changes.active.value });
  return gymStoreSchema.parse(next);
}
