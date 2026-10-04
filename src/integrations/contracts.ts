import type {
  Activity,
  RawRecord,
  RecoveryNight,
  Source,
} from '../domain/models';
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
  async preview() {
    return {
      available: false,
      exerciseAliases: [],
      warnings: ['CSV import is planned; no file has been imported.'],
    };
  },
};
