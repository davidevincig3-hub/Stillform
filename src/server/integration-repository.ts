import 'server-only';
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  open,
  unlink,
} from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  registrySchema,
  emptyRegistry,
  type ActivityRegistry,
  type RichActivityData,
} from '../domain/activity';
import type { Connection } from './strava-client';
import { seal, unseal, fingerprint } from './integration-security';
import type { IntegrationConfig } from './integration-config';
export interface WebhookEvent {
  object_type: 'activity' | 'athlete';
  object_id: number;
  aspect_type: 'create' | 'update' | 'delete';
  owner_id: number;
  subscription_id: number;
  event_time: number;
  updates: Record<string, string>;
}
export interface RegistrySnapshot {
  version: number;
  state: ActivityRegistry;
}
export interface IntegrationRepository {
  read(owner: string): Promise<RegistrySnapshot>;
  save(owner: string, base: number, state: ActivityRegistry): Promise<void>;
  account(owner: string): Promise<Connection | null>;
  saveAccount(owner: string, account: Connection): Promise<void>;
  removeAccount(owner: string): Promise<void>;
  ownerForAthlete(id: string): Promise<string | null>;
  rich(owner: string, key: string): Promise<RichActivityData | null>;
  saveRich(owner: string, key: string, data: RichActivityData): Promise<void>;
  enqueue(owner: string, event: WebhookEvent): Promise<void>;
  pending(owner: string): Promise<{ id: string; event: WebhookEvent }[]>;
  ack(owner: string, id: string): Promise<void>;
  lock<T>(owner: string, fn: () => Promise<T>): Promise<T>;
}
export class RepositoryError extends Error {}
export class SupabaseIntegrationRepository implements IntegrationRepository {
  constructor(
    private c: IntegrationConfig,
    private http: typeof fetch = fetch,
  ) {}
  private async request(path: string, init: RequestInit = {}) {
    const r = await this.http(
      `${this.c.supabaseUrl.replace(/\/$/, '')}/rest/v1/${path}`,
      {
        ...init,
        cache: 'no-store',
        headers: {
          apikey: this.c.serviceKey,
          Authorization: `Bearer ${this.c.serviceKey}`,
          'Content-Type': 'application/json',
          ...init.headers,
        },
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!r.ok)
      throw new RepositoryError(
        'Secure integration persistence failed; verify migrations and configuration.',
      );
    return r.status === 204 ? null : ((await r.json()) as unknown);
  }
  async read(owner: string) {
    const rows = (await this.request(
      `integration_registry?owner_id=eq.${encodeURIComponent(owner)}&select=version,state`,
    )) as { version: number; state: unknown }[];
    return rows[0]
      ? { version: rows[0].version, state: registrySchema.parse(rows[0].state) }
      : { version: 0, state: emptyRegistry() };
  }
  async save(owner: string, base: number, state: ActivityRegistry) {
    const ok = await this.request('rpc/save_integration_registry', {
      method: 'POST',
      body: JSON.stringify({
        p_owner: owner,
        p_version: base,
        p_state: registrySchema.parse(state),
      }),
    });
    if (ok !== true)
      throw new RepositoryError(
        'Registry changed. Resume the operation from fresh state.',
      );
  }
  async account(owner: string) {
    const rows = (await this.request(
      `integration_accounts?owner_id=eq.${encodeURIComponent(owner)}&provider=eq.strava&select=credential`,
    )) as { credential: string }[];
    return rows[0]
      ? unseal<Connection>(rows[0].credential, this.c.encryptionKey)
      : null;
  }
  async saveAccount(owner: string, a: Connection) {
    await this.request('integration_accounts?on_conflict=owner_id,provider', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        owner_id: owner,
        provider: 'strava',
        athlete_id: a.athleteId,
        credential: seal(a, this.c.encryptionKey),
      }),
    });
  }
  async removeAccount(owner: string) {
    await this.request(
      `integration_accounts?owner_id=eq.${encodeURIComponent(owner)}&provider=eq.strava`,
      { method: 'DELETE' },
    );
  }
  async ownerForAthlete(id: string) {
    const rows = (await this.request(
      `integration_accounts?provider=eq.strava&athlete_id=eq.${encodeURIComponent(id)}&select=owner_id`,
    )) as { owner_id: string }[];
    return rows[0]?.owner_id ?? null;
  }
  async rich(owner: string, key: string) {
    const rows = (await this.request(
      `integration_rich_data?owner_id=eq.${encodeURIComponent(owner)}&source_key=eq.${encodeURIComponent(key)}&select=data`,
    )) as { data: RichActivityData }[];
    return rows[0]?.data ?? null;
  }
  async saveRich(owner: string, key: string, data: RichActivityData) {
    await this.request(
      'integration_rich_data?on_conflict=owner_id,source_key',
      {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ owner_id: owner, source_key: key, data }),
      },
    );
  }
  async enqueue(owner: string, event: WebhookEvent) {
    await this.request('integration_webhook_jobs?on_conflict=owner_id,id', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({ owner_id: owner, id: fingerprint(event), event }),
    });
  }
  async pending(owner: string) {
    return (await this.request(
      `integration_webhook_jobs?owner_id=eq.${encodeURIComponent(owner)}&processed_at=is.null&order=created_at.asc&limit=1&select=id,event`,
    )) as { id: string; event: WebhookEvent }[];
  }
  async ack(owner: string, id: string) {
    await this.request(
      `integration_webhook_jobs?owner_id=eq.${encodeURIComponent(owner)}&id=eq.${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ processed_at: new Date().toISOString() }),
      },
    );
  }
  async lock<T>(owner: string, fn: () => Promise<T>) {
    const lease = randomUUID();
    const ok = await this.request('rpc/acquire_integration_lease', {
      method: 'POST',
      body: JSON.stringify({ p_owner: owner, p_lease: lease }),
    });
    if (ok !== true)
      throw new RepositoryError(
        'Another integration operation is in progress. Retry shortly.',
      );
    try {
      return await fn();
    } finally {
      await this.request('rpc/release_integration_lease', {
        method: 'POST',
        body: JSON.stringify({ p_owner: owner, p_lease: lease }),
      });
    }
  }
}
const DEV_OWNER = '00000000-0000-4000-8000-000000000001';
export { DEV_OWNER };
interface DevRecord {
  version: number;
  state: ActivityRegistry;
  account: Connection | null;
  rich: Record<string, RichActivityData>;
  queue: { id: string; event: WebhookEvent; done: boolean }[];
}
/** Explicit dev-only encrypted server files. Never a browser-token fallback. */
export class DevFileIntegrationRepository implements IntegrationRepository {
  private root = resolve('.integration-dev');
  constructor(private c: IntegrationConfig) {
    if (process.env.NODE_ENV !== 'development' || c.mode !== 'dev-file')
      throw new RepositoryError('Development persistence unavailable');
  }
  private path(owner: string, suffix = 'json') {
    if (owner !== DEV_OWNER)
      throw new RepositoryError('Development owner mismatch');
    return join(
      process.cwd(),
      '.integration-dev',
      `${fingerprint(owner)}.${suffix}`,
    );
  }
  private async load(owner: string): Promise<DevRecord> {
    try {
      return unseal<DevRecord>(
        await readFile(this.path(owner), 'utf8'),
        this.c.encryptionKey,
      );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      return {
        version: 0,
        state: emptyRegistry(),
        account: null,
        rich: {},
        queue: [],
      };
    }
  }
  private async write(owner: string, data: DevRecord) {
    await mkdir(this.root, { recursive: true });
    const file = this.path(owner),
      temp = `${file}.${randomUUID()}.tmp`;
    await writeFile(temp, seal(data, this.c.encryptionKey), { mode: 0o600 });
    await rename(temp, file);
  }
  async read(owner: string) {
    const r = await this.load(owner);
    return { version: r.version, state: registrySchema.parse(r.state) };
  }
  async save(owner: string, base: number, state: ActivityRegistry) {
    const r = await this.load(owner);
    if (r.version !== base)
      throw new RepositoryError('Registry changed. Retry.');
    await this.write(owner, {
      ...r,
      version: base + 1,
      state: registrySchema.parse(state),
    });
  }
  async account(owner: string) {
    return (await this.load(owner)).account;
  }
  async saveAccount(owner: string, account: Connection) {
    await this.write(owner, { ...(await this.load(owner)), account });
  }
  async removeAccount(owner: string) {
    await this.write(owner, { ...(await this.load(owner)), account: null });
  }
  async ownerForAthlete(id: string) {
    return (await this.account(DEV_OWNER))?.athleteId === id ? DEV_OWNER : null;
  }
  async rich(owner: string, key: string) {
    return (await this.load(owner)).rich[key] ?? null;
  }
  async saveRich(owner: string, key: string, data: RichActivityData) {
    const r = await this.load(owner);
    await this.write(owner, { ...r, rich: { ...r.rich, [key]: data } });
  }
  async enqueue(owner: string, event: WebhookEvent) {
    await this.lock(owner, async () => {
      const r = await this.load(owner),
        id = fingerprint(event);
      if (!r.queue.some((e) => e.id === id)) {
        r.queue.push({ id, event, done: false });
        await this.write(owner, r);
      }
    });
  }
  async pending(owner: string) {
    return (await this.load(owner)).queue.filter((e) => !e.done).slice(0, 1);
  }
  async ack(owner: string, id: string) {
    const r = await this.load(owner);
    r.queue = r.queue.map((e) => (e.id === id ? { ...e, done: true } : e));
    await this.write(owner, r);
  }
  async lock<T>(owner: string, fn: () => Promise<T>) {
    await mkdir(this.root, { recursive: true });
    const file = this.path(owner, 'lock'),
      id = randomUUID();
    let handle;
    try {
      handle = await open(file, 'wx', 0o600);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      const old = JSON.parse(await readFile(file, 'utf8')) as {
        expires: number;
      };
      if (old.expires > Date.now())
        throw new RepositoryError(
          'Another integration operation is in progress',
        );
      if (!resolve(file).startsWith(this.root + requireSeparator()))
        throw new RepositoryError('Invalid lock path');
      await unlink(file);
      handle = await open(file, 'wx', 0o600);
    }
    await handle.writeFile(
      JSON.stringify({ id, expires: Date.now() + 180000 }),
    );
    await handle.close();
    try {
      return await fn();
    } finally {
      const lease = JSON.parse(await readFile(file, 'utf8')) as { id: string };
      if (lease.id === id) await unlink(file);
    }
  }
}
function requireSeparator() {
  return process.platform === 'win32' ? '\\' : '/';
}
export function integrationRepository(
  c: IntegrationConfig,
): IntegrationRepository {
  return c.mode === 'dev-file'
    ? new DevFileIntegrationRepository(c)
    : new SupabaseIntegrationRepository(c);
}
