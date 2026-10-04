import 'server-only';
import { z } from 'zod';
import {
  gymLinkSchema,
  type RichActivityData,
  type ActivityRegistry,
} from '../domain/activity';
import {
  registerGymLinks,
  ingestActivity,
} from '../integrations/activity-matching';
import {
  StravaClient,
  StravaError,
  normalizeStrava,
  normalizeStreams,
  normalizeLaps,
  type Connection,
} from './strava-client';
import type { IntegrationConfig } from './integration-config';
import type {
  IntegrationRepository,
  WebhookEvent,
} from './integration-repository';
export async function authorizedCall<T>(
  owner: string,
  repo: IntegrationRepository,
  client: StravaClient,
  fn: (c: Connection) => Promise<T>,
) {
  let c = await repo.account(owner);
  if (!c) throw new StravaError('Connect or reconnect Strava first', 409);
  try {
    if (c.expiresAt * 1000 < Date.now() + 60000) {
      c = await client.refresh(c);
      await repo.saveAccount(owner, c);
    }
    try {
      return await fn(c);
    } catch (e) {
      if (!(e instanceof StravaError) || e.status !== 401) throw e;
      c = await client.refresh(c);
      await repo.saveAccount(owner, c);
      return await fn(c);
    }
  } catch (e) {
    if (e instanceof StravaError && (e.status === 401 || e.status === 403))
      await repo.removeAccount(owner);
    throw e;
  }
}
export async function syncPage(
  owner: string,
  repo: IntegrationRepository,
  c: IntegrationConfig,
  input: unknown,
  client = new StravaClient(c),
) {
  const body = z
    .object({
      gym: z.array(gymLinkSchema).max(20000).default([]),
      full: z.boolean().default(false),
    })
    .parse(input);
  return repo.lock(owner, async () => {
    const snapshot = await repo.read(owner),
      state = snapshot.state,
      now = Date.now();
    if (now < state.sync.blockedUntil)
      throw new StravaError(
        'Sync paused until the provider rate budget resets',
        429,
        state.sync.blockedUntil,
      );
    registerGymLinks(state, body.gym, new Date(now).toISOString());
    if (!state.sync.before || state.sync.done || body.full) {
      const after =
        body.full || !state.sync.before
          ? 0
          : Math.max(
              0,
              Math.floor(
                Math.max(
                  0,
                  ...state.sources
                    .filter((s) => s.provider === 'strava')
                    .map(
                      (s) => Date.parse(String(s.raw.start_date || '')) || 0,
                    ),
                ) / 1000,
              ) - 172800,
            );
      state.sync = {
        page: 1,
        before: Math.floor(now / 1000),
        after,
        done: false,
        discovered: 0,
        created: 0,
        linked: 0,
        review: 0,
        errors: [],
        blockedUntil: 0,
        lastRequestAt: state.sync.lastRequestAt,
      };
    }
    if (now - state.sync.lastRequestAt < 2000)
      throw new StravaError(
        'Sync throttled; continue shortly',
        429,
        state.sync.lastRequestAt + 2000,
      );
    try {
      const rows = await authorizedCall(owner, repo, client, (connection) =>
        client.activities(
          connection,
          state.sync.page,
          state.sync.before,
          state.sync.after,
        ),
      );
      const account = await repo.account(owner);
      if (!account) throw new StravaError('Reconnect Strava', 409);
      const page = rows.map((raw) => normalizeStrava(raw, account.athleteId));
      for (const normalized of page) {
        const result = ingestActivity(
          state,
          normalized.activity,
          normalized.source,
        );
        state.sync.discovered++;
        if (result === 'new') state.sync.created++;
        if (result === 'linked') state.sync.linked++;
        if (result === 'review') state.sync.review++;
      }
      state.sync.page++;
      state.sync.done = rows.length < 50;
      state.sync.blockedUntil = client.pauseUntil;
      state.sync.lastRequestAt = now;
      state.sync.errors = [];
      await repo.save(owner, snapshot.version, state);
      return state.sync;
    } catch (e) {
      state.sync.blockedUntil = Math.max(
        client.pauseUntil,
        e instanceof StravaError ? e.retryAt : now + 30000,
      );
      state.sync.errors = [
        e instanceof StravaError
          ? e.message
          : 'Sync page validation/persistence failed; resume safely.',
      ];
      await repo.save(owner, snapshot.version, state);
      throw e;
    }
  });
}
export async function enrichActivity(
  owner: string,
  key: string,
  repo: IntegrationRepository,
  c: IntegrationConfig,
  client = new StravaClient(c),
): Promise<RichActivityData> {
  return repo.lock(owner, async () => {
    const snapshot = await repo.read(owner),
      source = snapshot.state.sources.find(
        (s) => s.key === key && s.provider === 'strava',
      );
    if (!source || source.deleted)
      throw new StravaError('Strava source not available', 404);
    if (Date.now() < snapshot.state.sync.blockedUntil)
      throw new StravaError(
        'Enrichment paused for rate limits',
        429,
        snapshot.state.sync.blockedUntil,
      );
    try {
      const raw = await authorizedCall(owner, repo, client, (a) =>
        client.get(`/activities/${source.externalId}`, a),
      );
      const normalized = normalizeStrava(raw, source.athleteId!);
      ingestActivity(snapshot.state, normalized.activity, normalized.source);
      let streams: RichActivityData['streams'] = [],
        laps: RichActivityData['laps'] = [];
      const warnings: string[] = [];
      try {
        const response = await authorizedCall(owner, repo, client, (a) =>
          client.get(
            `/activities/${source.externalId}/streams?keys=time,distance,latlng,altitude,velocity_smooth,heartrate,cadence,moving,grade_smooth&key_by_type=true`,
            a,
          ),
        );
        const parsed = normalizeStreams(response);
        streams = parsed.streams;
        warnings.push(...parsed.warnings);
      } catch (e) {
        if (e instanceof StravaError && e.status === 404)
          warnings.push('No streams available for this activity.');
        else throw e;
      }
      const activity = snapshot.state.activities.find(
        (a) => a.id === source.activityId,
      )!;
      if (['run', 'trail_run'].includes(activity.sport)) {
        try {
          laps = normalizeLaps(
            await authorizedCall(owner, repo, client, (a) =>
              client.get(`/activities/${source.externalId}/laps`, a),
            ),
            source.key,
          );
        } catch (e) {
          if (e instanceof StravaError && e.status === 404)
            warnings.push('No laps available.');
          else throw e;
        }
      }
      const data = {
        sourceKey: key,
        fetchedAt: new Date().toISOString(),
        streams,
        laps,
        warnings,
      };
      for (const kind of ['latlng', 'heartrate'] as const) {
        const field = kind === 'latlng' ? 'gpsStream' : 'hrStream';
        if (streams.some((s) => s.kind === kind && s.data.length)) {
          if (!activity.fieldSources[field]) activity.fieldSources[field] = key;
          activity.quality.available = [
            ...new Set([...activity.quality.available, field]),
          ];
          activity.quality.missing = activity.quality.missing.filter(
            (f) => f !== field,
          );
        } else if (
          !activity.quality.available.includes(field) &&
          !activity.quality.missing.includes(field)
        )
          activity.quality.missing.push(field);
      }
      await repo.saveRich(owner, key, data);
      snapshot.state.sync.blockedUntil = client.pauseUntil;
      await repo.save(owner, snapshot.version, snapshot.state);
      return data;
    } catch (e) {
      snapshot.state.sync.blockedUntil = Math.max(
        client.pauseUntil,
        e instanceof StravaError ? e.retryAt : Date.now() + 30000,
      );
      await repo.save(owner, snapshot.version, snapshot.state);
      throw e;
    }
  });
}
export const webhookSchema = z.object({
  object_type: z.enum(['activity', 'athlete']),
  object_id: z.number().int().positive(),
  aspect_type: z.enum(['create', 'update', 'delete']),
  owner_id: z.number().int().positive(),
  subscription_id: z.number().int().positive(),
  event_time: z.number().int().positive(),
  updates: z.record(z.string(), z.string()).default({}),
});
export function webhookChallenge(url: URL, token: string) {
  if (
    !token ||
    url.searchParams.get('hub.mode') !== 'subscribe' ||
    url.searchParams.get('hub.verify_token') !== token ||
    !url.searchParams.get('hub.challenge')
  )
    throw new StravaError('Webhook verification rejected', 403);
  return { 'hub.challenge': url.searchParams.get('hub.challenge')! };
}
export async function queueWebhook(
  input: unknown,
  subscriptionId: number,
  repo: IntegrationRepository,
) {
  const event = webhookSchema.parse(input);
  if (!subscriptionId || event.subscription_id !== subscriptionId)
    throw new StravaError('Webhook subscription rejected', 403);
  const owner = await repo.ownerForAthlete(String(event.owner_id));
  if (owner) await repo.enqueue(owner, event);
}
export function markSourceDeleted(
  state: ActivityRegistry,
  externalId: number,
  athleteId: number,
) {
  const key = `strava:${athleteId}:${externalId}`,
    source = state.sources.find((s) => s.key === key);
  if (!source) return;
  source.deleted = true;
  const activity = state.activities.find((a) => a.id === source.activityId);
  if (
    activity &&
    activity.sourceKeys.every(
      (k) => state.sources.find((s) => s.key === k)?.deleted,
    )
  )
    activity.status = 'source_deleted';
}
export async function processWebhook(
  owner: string,
  repo: IntegrationRepository,
  c: IntegrationConfig,
  client = new StravaClient(c),
) {
  return repo.lock(owner, async () => {
    const job = (await repo.pending(owner))[0];
    if (!job) return { processed: 0 };
    const snapshot = await repo.read(owner);
    if (Date.now() < snapshot.state.sync.blockedUntil)
      throw new StravaError(
        'Webhook processing paused for rate limits',
        429,
        snapshot.state.sync.blockedUntil,
      );
    const e: WebhookEvent = job.event;
    if (e.object_type === 'athlete' && e.updates.authorized === 'false') {
      try {
        await authorizedCall(owner, repo, client, (a) =>
          client.get('/athlete', a),
        );
      } catch (error) {
        if (
          !(error instanceof StravaError) ||
          ![401, 403, 409].includes(error.status)
        ) {
          snapshot.state.sync.blockedUntil = Math.max(
            client.pauseUntil,
            error instanceof StravaError ? error.retryAt : Date.now() + 30000,
          );
          await repo.save(owner, snapshot.version, snapshot.state);
          throw error;
        }
        await repo.removeAccount(owner);
      }
      snapshot.state.sync.blockedUntil = client.pauseUntil;
      await repo.save(owner, snapshot.version, snapshot.state);
      await repo.ack(owner, job.id);
      return { processed: 1 };
    }
    if (e.object_type === 'activity') {
      try {
        const raw = await authorizedCall(owner, repo, client, (a) =>
          client.get(`/activities/${e.object_id}`, a),
        );
        const n = normalizeStrava(raw, String(e.owner_id));
        ingestActivity(snapshot.state, n.activity, n.source);
      } catch (error) {
        if (error instanceof StravaError && error.status === 404)
          markSourceDeleted(snapshot.state, e.object_id, e.owner_id);
        else {
          snapshot.state.sync.blockedUntil = Math.max(
            client.pauseUntil,
            error instanceof StravaError ? error.retryAt : Date.now() + 30000,
          );
          await repo.save(owner, snapshot.version, snapshot.state);
          throw error;
        }
      }
    }
    snapshot.state.sync.blockedUntil = Math.max(
      snapshot.state.sync.blockedUntil,
      client.pauseUntil,
    );
    await repo.save(owner, snapshot.version, snapshot.state);
    await repo.ack(owner, job.id);
    return { processed: 1 };
  });
}
