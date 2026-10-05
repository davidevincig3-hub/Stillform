import 'server-only';
import { z } from 'zod';
import {
  recoveryFamilies,
  recoveryInputs,
  recoveryRecordCounts,
} from '../domain/recovery-inputs';
import type { PolarStore } from '../domain/polar';
import { validityOverrideSchema } from '../domain/observation-quality';
import type { IntegrationRepository } from './integration-repository';
import { PolarError } from './polar-client';

export const validityRequestSchema = z
  .object({
    records: z
      .array(
        z.object({
          family: z.enum(recoveryFamilies),
          date: z.iso.date(),
          device: z.string().nullable(),
        }),
      )
      .min(1)
      .max(100),
    status: validityOverrideSchema.shape.status,
    reason: validityOverrideSchema.shape.reason.default(null),
  })
  .strict();
export async function setPolarValidity(
  owner: string,
  repo: IntegrationRepository,
  input: unknown,
) {
  const request = validityRequestSchema.parse(input);
  return repo.lock(owner, async () => {
    const snapshot = await repo.readPolar(owner);
    const targets = request.records.map((identity) => {
      const candidates = snapshot.state[identity.family].filter(
        (r) => r.date === identity.date && r.device === identity.device,
      );
      if (candidates.length !== 1)
        throw new PolarError(
          'Recovery record not found or ambiguous; reload history',
          409,
        );
      return candidates[0];
    });
    const override = validityOverrideSchema.parse({
      status: request.status,
      reason: request.status === 'valid' ? null : request.reason,
      adjudicatedAt: new Date().toISOString(),
      adjudicatedBy: 'user',
    });
    for (const target of targets) target.validityOverride = override;
    await repo.savePolar(owner, snapshot.version, snapshot.state);
    return {
      updated: targets.length,
      counts: recoveryRecordCounts(snapshot.state),
    };
  });
}
export function publicRecovery(
  state: PolarStore,
  connected: boolean,
  asOf = new Date().toISOString(),
) {
  const eligible = recoveryInputs(state);
  const safe = <T extends { raw: unknown; previous: unknown }>(r: T) => {
    const { raw, previous, ...record } = r;
    void raw;
    void previous;
    return record;
  };
  return {
    realMode: state.realMode || connected,
    connected,
    sleep: eligible.sleep.map(safe),
    nightly: eligible.nightly.map(safe),
    continuousDays: eligible.continuous.length,
    ppiDays: new Set(eligible.ppi.map((r) => r.date)).size,
    recordCounts: recoveryRecordCounts(state),
    history: recoveryFamilies.flatMap((family) =>
      state[family].map((r) => ({
        family,
        date: r.date,
        source: r.source,
        device: r.device,
        syncedAt: r.syncedAt,
        sensorQuality: r.sensorQuality,
        validityOverride: r.validityOverride ?? null,
        summary:
          'asleepSeconds' in r
            ? {
                start: r.start,
                end: r.end,
                asleepSeconds: r.asleepSeconds,
                complete: r.complete,
              }
            : 'rmssdMs' in r
              ? {
                  rmssdMs: r.rmssdMs,
                  rriMs: r.rriMs,
                  respirationIntervalMs: r.respirationIntervalMs,
                }
              : { sampleCount: r.samples.length },
      })),
    ),
    asOf,
  };
}
