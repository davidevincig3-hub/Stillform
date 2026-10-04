import {
  emptyRegistry,
  registrySchema,
  type RichActivityData,
  type ActivityRegistry,
} from '../../src/domain/activity';
import type {
  IntegrationRepository,
  WebhookEvent,
} from '../../src/server/integration-repository';
import type { Connection } from '../../src/server/strava-client';
import { fingerprint } from '../../src/server/integration-security';
import { integrationConfig } from '../../src/server/integration-config';
import {
  emptyPolarStore,
  polarStoreSchema,
  type PolarStore,
} from '../../src/domain/polar';
export const config = integrationConfig({
  NODE_ENV: 'test',
  APP_ORIGIN: 'http://localhost:3100',
  STRAVA_CLIENT_ID: 'synthetic-id',
  STRAVA_CLIENT_SECRET: 'synthetic-secret',
  INTEGRATION_ENCRYPTION_KEY: 'ab'.repeat(32),
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'synthetic-publishable',
  SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service',
});
export const connection: Connection = {
  athleteId: '7',
  accessToken: 'synthetic-access',
  refreshToken: 'synthetic-refresh',
  expiresAt: 4102444800,
  scopes: ['activity:read_all', 'activity:read'],
  connectedAt: '2026-10-01T00:00:00Z',
};
export function activityRaw(id = 1, type = 'Run') {
  return {
    id,
    name: `Synthetic ${type} ${id}`,
    sport_type: type,
    start_date: '2026-10-01T08:00:00Z',
    elapsed_time: 3600,
    moving_time: 3500,
    distance: type === 'WeightTraining' ? 0 : 10000,
  };
}
export class MemoryRepository implements IntegrationRepository {
  polarState = emptyPolarStore();
  polarVersion = 0;
  polarCredential: Connection | null = null;
  state = emptyRegistry();
  version = 0;
  credential: Connection | null = { ...connection };
  saves: Connection[] = [];
  richData: Record<string, RichActivityData> = {};
  jobs: { id: string; event: WebhookEvent }[] = [];
  locked = false;
  async read() {
    return { version: this.version, state: structuredClone(this.state) };
  }
  async save(_owner: string, base: number, state: ActivityRegistry) {
    if (base !== this.version) throw new Error('CAS conflict');
    this.state = registrySchema.parse(structuredClone(state));
    this.version++;
  }
  async account(_owner?: string, provider: 'strava' | 'polar' = 'strava') {
    return provider === 'polar' ? this.polarCredential : this.credential;
  }
  async saveAccount(
    _owner: string,
    c: Connection,
    provider: 'strava' | 'polar' = 'strava',
  ) {
    if (provider === 'polar') this.polarCredential = c;
    else this.credential = c;
    this.saves.push(c);
  }
  async removeAccount(
    _owner?: string,
    provider: 'strava' | 'polar' = 'strava',
  ) {
    if (provider === 'polar') this.polarCredential = null;
    else this.credential = null;
  }
  async readPolar() {
    return {
      version: this.polarVersion,
      state: structuredClone(this.polarState),
    };
  }
  async savePolar(_owner: string, base: number, state: PolarStore) {
    if (base !== this.polarVersion) throw new Error('CAS conflict');
    this.polarState = polarStoreSchema.parse(structuredClone(state));
    this.polarVersion++;
  }
  async ownerForAthlete(id: string) {
    return id === this.credential?.athleteId ? 'owner' : null;
  }
  async rich(_owner: string, key: string) {
    return this.richData[key] ?? null;
  }
  async saveRich(_owner: string, key: string, data: RichActivityData) {
    this.richData[key] = data;
  }
  async enqueue(_owner: string, event: WebhookEvent) {
    const id = fingerprint(event);
    if (!this.jobs.some((j) => j.id === id)) this.jobs.push({ id, event });
  }
  async pending() {
    return this.jobs.slice(0, 1);
  }
  async ack(_owner: string, id: string) {
    this.jobs = this.jobs.filter((j) => j.id !== id);
  }
  async lock<T>(_owner: string, fn: () => Promise<T>) {
    if (this.locked) throw new Error('Lease held');
    this.locked = true;
    try {
      return await fn();
    } finally {
      this.locked = false;
    }
  }
}
export function json(value: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(value), { status, headers });
}
