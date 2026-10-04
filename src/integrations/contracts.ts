import type {
  Activity,
  RawRecord,
  RecoveryNight,
  Source,
} from '../domain/models';
import { previewHevyImport } from './hevy-import';
export interface SourceNormalizer {
  normalize(record: RawRecord): Promise<{
    activity?: Activity;
    recoveryNight?: RecoveryNight;
    warnings: string[];
  }>;
}
export interface ImportResult {
  records: RawRecord[];
  warnings: string[];
  available: boolean;
}
export interface ActivityProvider {
  source: Source;
  fetchActivities(since: string): Promise<ImportResult>;
}
export interface CalendarProvider {
  getConstraints(
    from: string,
    to: string,
  ): Promise<{ available: boolean; events: unknown[] }>;
}
export interface HevyImportAdapter {
  preview(csv: string): Promise<{
    available: boolean;
    exerciseAliases: { incoming: string; canonical: string | null }[];
    warnings: string[];
  }>;
}
export const polarAdapter: ActivityProvider = {
  source: 'polar',
  async fetchActivities() {
    return {
      available: false,
      records: [],
      warnings: ['Polar is not connected.'],
    };
  },
};
// Legacy demo contract only. Real OAuth/sync uses server/strava-client + strava-service.
// Keep this adapter unavailable: credentials cannot enter this client-safe module.
export const stravaAdapter: ActivityProvider = {
  source: 'strava',
  async fetchActivities() {
    return {
      available: false,
      records: [],
      warnings: ['Strava is not connected.'],
    };
  },
};
export const calendarAdapter: CalendarProvider = {
  async getConstraints() {
    return { available: false, events: [] };
  },
};
export const hevyAdapter: HevyImportAdapter = {
  async preview(csv) {
    const parsed = await previewHevyImport(csv);
    return {
      available: parsed.errors.length === 0,
      exerciseAliases: parsed.names.map((incoming) => ({
        incoming,
        canonical: null,
      })),
      warnings: [...parsed.errors, ...parsed.warnings],
    };
  },
};
