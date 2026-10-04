import type { Confidence } from './models';
interface SeriesBase {
  metric: string;
  unit: string;
  points: { date: string; value: number }[];
  confidence: Confidence;
  inputReferences: string[];
  isMock: boolean;
}
export type ProgressionSeries = SeriesBase &
  (
    | { kind: 'historical-actual' | 'planned' | 'candidate'; rationale: string }
    | {
        kind: 'statistical-forecast';
        modelVersion: string;
        supportingObservations: number;
        validationReference: string;
        uncertaintyBounds: { date: string; lower: number; upper: number }[];
      }
  );
export interface ProgressionContext {
  series: ProgressionSeries[];
  forecastStatus: 'insufficient' | 'supported';
  personalDataGate: string;
  scientificRationaleGate: string;
}
