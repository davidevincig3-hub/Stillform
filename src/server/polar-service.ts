import 'server-only';
import { z } from 'zod';
import { gymLinkSchema, type RichActivityData } from '../domain/activity';
import {
  addDays,
  polarFamilies,
  familyScope,
  windowDays,
  newPolarJob,
  type PolarStore,
} from '../domain/polar';
import {
  ingestActivity,
  registerGymLinks,
} from '../integrations/activity-matching';
import type { IntegrationRepository } from './integration-repository';
import type { Connection } from './strava-client';
import { polarCalendarDate } from '../domain/polar-training-range';
import { recoveryRecordCounts } from '../domain/recovery-inputs';
import { PolarClient, PolarError, POLAR_PATHS } from './polar-client';
import {
  object,
  familyRows,
  rowDate,
  storePolarRows,
  normalizePolarTraining,
  trainingRows,
  normalizePolarFeatures,
  parsePolarSports,
} from './polar-normalize';
export async function polarAuthorized<T>(
  owner: string,
  repo: IntegrationRepository,
  client: PolarClient,
  fn: (c: Connection) => Promise<T>,
) {
  let c = await repo.account(owner, 'polar');
  if (!c) throw new PolarError('Connect Polar first', 409);
  let refreshed = false;
  let refreshAttempted = false;
  try {
    if (c.expiresAt * 1000 < Date.now() + 60000) {
      refreshAttempted = true;
      c = await client.refresh(c);
      await repo.saveAccount(owner, c, 'polar');
      refreshed = true;
    }
    try {
      return await fn(c);
    } catch (e) {
      if (!(e instanceof PolarError) || e.status !== 401) throw e;
      refreshAttempted = true;
      c = await client.refresh(c);
      await repo.saveAccount(owner, c, 'polar');
      refreshed = true;
      return await fn(c);
    }
  } catch (e) {
    if (e instanceof PolarError && e.diagnostic) {
      e.diagnostic.refreshed = refreshed;
      e.diagnostic.refreshAttempted = refreshAttempted;
    }
    throw e;
  }
}
function throttle(state: PolarStore) {
  if (state.blockedUntil > Date.now())
    throw new PolarError(
      'Polar synchronization paused; resume after the retry time',
      429,
      state.blockedUntil,
    );
  if (Date.now() - state.lastRequestAt < 1100)
    throw new PolarError(
      'Polar synchronization paced; continue shortly',
      429,
      state.lastRequestAt + 1100,
    );
}
const syncInput = z
  .object({
    families: z.array(z.enum(polarFamilies)).min(1).max(5),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    restart: z.boolean().default(false),
    gym: z.array(gymLinkSchema).max(20000).default([]),
  })
  .refine((v) => !v.restart || (!!v.from && !!v.to), 'New sync requires dates')
  .refine(
    (v) => !v.from || !v.to || v.from < v.to,
    'Use a valid past range; to is exclusive',
  );
export async function polarSyncStep(
  owner: string,
  repo: IntegrationRepository,
  client: PolarClient,
  input: unknown,
) {
  const body = syncInput.parse(input);
  if (
    body.to &&
    body.to > addDays(polarCalendarDate(new Date(), client.trainingTimeZone), 1)
  )
    throw new PolarError('Use a valid past range; to is exclusive', 400);
  return repo.lock(owner, async () => {
    const s = await repo.readPolar(owner),
      state = s.state;
    throttle(state);
    const account = await repo.account(owner, 'polar');
    if (!account) throw new PolarError('Connect Polar first', 409);
    state.realMode = true;
    for (const family of body.families) {
      if (body.restart || !state.jobs[family]) {
        if (!body.from || !body.to)
          throw new PolarError('Select a date range for this sync', 400);
        state.jobs[family] = newPolarJob(body.from, body.to);
      }
      const job = state.jobs[family]!;
      if (!account.scopes.includes(familyScope[family])) {
        job.unavailable = true;
        job.done = true;
        job.errors = ['Scope not granted: ' + familyScope[family]];
      }
    }
    const family = body.families.find((f) => !state.jobs[f]?.done);
    if (!family) {
      await repo.savePolar(owner, s.version, state);
      return publicPolarState(state);
    }
    const job = state.jobs[family]!,
      from = job.phase === 'hydrate' ? job.pending[0] : job.next,
      to =
        job.phase === 'hydrate'
          ? addDays(from, 1)
          : [addDays(from, windowDays[family]), job.to].sort()[0];
    state.lastRequestAt = Date.now();
    try {
      const raw = await polarAuthorized(owner, repo, client, (c) =>
          client.window(c, family, from, to, job.phase === 'hydrate'),
        ),
        rows = familyRows(raw, family),
        dates = rows.map((r) => rowDate(r, family));
      if (dates.some((d) => d < from || d >= to))
        throw new PolarError(
          'Polar returned data outside the requested window',
          502,
        );
      if (family === 'training') {
        const registry = await repo.read(owner);
        registerGymLinks(registry.state, body.gym, new Date().toISOString());
        for (const r of rows) {
          const n = normalizePolarTraining(r, account.athleteId, state.sports);
          ingestActivity(registry.state, n.activity, n.source);
        }
        await repo.save(owner, registry.version, registry.state);
      } else if (job.phase === 'hydrate' || !['sleep', 'ppi'].includes(family))
        storePolarRows(state, family, rows);
      if (!rows.length) job.emptyWindows.push({ from, to });
      for (const d of dates) {
        job.oldest = job.oldest === null || d < job.oldest ? d : job.oldest;
        job.newest = job.newest === null || d > job.newest ? d : job.newest;
      }
      if (job.phase === 'discover') {
        if (['sleep', 'ppi'].includes(family))
          job.pending = [...new Set([...job.pending, ...dates])].sort();
        job.next = to;
        if (to >= job.to) {
          if (job.pending.length) job.phase = 'hydrate';
          else job.done = true;
        }
      } else {
        job.pending.shift();
        job.done = job.pending.length === 0;
      }
      job.requests++;
      job.lastSuccess = new Date().toISOString();
      job.errors = [];
      job.diagnostic = null;
      await repo.savePolar(owner, s.version, state);
      return publicPolarState(state);
    } catch (e) {
      job.diagnostic = e instanceof PolarError ? e.diagnostic : null;
      job.errors = [
        e instanceof PolarError
          ? e.message
          : 'Polar response validation or persistence failed; checkpoint retained',
      ];
      if (e instanceof PolarError && e.status === 403) {
        job.unavailable = true;
        job.done = true;
      }
      state.blockedUntil =
        e instanceof PolarError ? e.retryAt : Date.now() + 30000;
      await repo.savePolar(owner, s.version, state);
      throw e;
    }
  });
}
export function publicPolarState(state: PolarStore) {
  return {
    recordCounts: recoveryRecordCounts(state),
    realMode: state.realMode,
    jobs: state.jobs,
    blockedUntil: state.blockedUntil,
    metadataSyncedAt: state.metadataSyncedAt,
    counts: {
      sleep: state.sleep.length,
      nightly: state.nightly.length,
      continuous: state.continuous.length,
      ppi: state.ppi.length,
    },
    devicesAvailable: Object.keys(state.devices).length > 0,
    sportsAvailable: state.sports.length,
    contextDiagnostic: state.contextDiagnostic,
  };
}
export async function polarMetadata(
  owner: string,
  repo: IntegrationRepository,
  client: PolarClient,
) {
  return repo.lock(owner, async () => {
    const snapshot = await repo.readPolar(owner),
      state = snapshot.state;
    throttle(state);
    const c = await repo.account(owner, 'polar');
    if (!c) throw new PolarError('Connect Polar first', 409);
    try {
      if (c.scopes.includes('sports:read')) {
        state.lastRequestAt = Date.now();
        const r = await polarAuthorized(owner, repo, client, (c) =>
          client.get(c, POLAR_PATHS.sports),
        );
        state.sports = parsePolarSports(r);
        await repo.savePolar(owner, snapshot.version, state);
        snapshot.version++;
        // Resolve already-imported sources using their saved payloads. Do not
        // restart discovery, fetch rich details, or replace permanent identity.
        const registry = await repo.read(owner);
        let changed = false;
        const names = new Set(state.sports.map((s) => s.name));
        for (const source of registry.state.sources) {
          if (source.provider !== 'polar' || source.deleted) continue;
          const normalized = normalizePolarTraining(
            source.raw,
            c.athleteId,
            state.sports,
          );
          if (
            normalized.source.key !== source.key ||
            !names.has(normalized.source.providerType) ||
            normalized.source.providerType === source.providerType
          )
            continue;
          ingestActivity(
            registry.state,
            normalized.activity,
            normalized.source,
          );
          changed = true;
        }
        if (changed) await repo.save(owner, registry.version, registry.state);
      }
      if (c.scopes.includes('devices:read')) {
        await new Promise((resolve) => setTimeout(resolve, 1100));
        state.lastRequestAt = Date.now();
        state.devices = object(
          await polarAuthorized(owner, repo, client, (c) =>
            client.get(c, POLAR_PATHS.devices),
          ),
        );
      }
      state.metadataSyncedAt = new Date().toISOString();
      state.contextDiagnostic = null;
      await repo.savePolar(owner, snapshot.version, state);
      return publicPolarState(state);
    } catch (e) {
      state.contextDiagnostic = e instanceof PolarError ? e.diagnostic : null;
      state.blockedUntil =
        e instanceof PolarError ? e.retryAt : Date.now() + 30000;
      await repo.savePolar(owner, snapshot.version, state);
      throw e;
    }
  });
}
export async function enrichPolar(
  owner: string,
  key: string,
  repo: IntegrationRepository,
  client: PolarClient,
): Promise<RichActivityData> {
  return repo.lock(owner, async () => {
    const p = await repo.readPolar(owner);
    throttle(p.state);
    const registry = await repo.read(owner),
      source = registry.state.sources.find(
        (s) => s.key === key && s.provider === 'polar' && !s.deleted,
      );
    if (!source) throw new PolarError('Polar source not found', 404);
    const from = rowDate(source.raw, 'training');
    p.state.lastRequestAt = Date.now();
    try {
      const raw = await polarAuthorized(owner, repo, client, (c) =>
          client.window(c, 'training', from, addDays(from, 1), true),
        ),
        r = trainingRows(raw).find(
          (r) => object(r.identifier).id === source.externalId,
        );
      if (!r)
        throw new PolarError(
          'Rich session data not available for this date',
          404,
        );
      const n = normalizePolarTraining(
        r,
        (await repo.account(owner, 'polar'))!.athleteId,
        p.state.sports,
      );
      ingestActivity(registry.state, n.activity, n.source);
      const features = normalizePolarFeatures(r, key),
        data: RichActivityData = {
          sourceKey: key,
          fetchedAt: new Date().toISOString(),
          streams: [],
          ...features,
          warnings: [
            'Polar sensor quality unknown. Speed sample units are provider-unspecified; no speed conversion or physiological analytics.',
          ],
        };
      await repo.saveRich(owner, key, data);
      await repo.save(owner, registry.version, registry.state);
      await repo.savePolar(owner, p.version, p.state);
      return data;
    } catch (e) {
      p.state.blockedUntil =
        e instanceof PolarError ? e.retryAt : Date.now() + 30000;
      await repo.savePolar(owner, p.version, p.state);
      throw e;
    }
  });
}
