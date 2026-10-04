import type { GymWorkout } from '../domain/gym';
export interface HevyParsedExercise {
  sourceName: string;
  sourceId?: string;
}
export interface HevyParsedWorkout {
  externalId: string;
  raw: unknown;
  exercises: HevyParsedExercise[];
}
export interface HevyCsvParser {
  schemaVersion: string;
  parse(csv: string): { workouts: HevyParsedWorkout[]; warnings: string[] };
}
export interface ExerciseMapping {
  incomingName: string;
  exerciseId: string | null;
  resolution: 'unresolved' | 'existing' | 'create-new' | 'synonym';
}
export interface HevyImportPreview {
  stage: 'unsupported' | 'mapping' | 'confirmation';
  workouts: HevyParsedWorkout[];
  mappings: ExerciseMapping[];
  duplicateCandidates: {
    externalId: string;
    existingWorkoutId: string;
    resolved: boolean;
  }[];
  warnings: string[];
}
export function previewHevyImport(
  csv: string,
  parser?: HevyCsvParser,
): HevyImportPreview {
  if (!parser)
    return {
      stage: 'unsupported',
      workouts: [],
      mappings: [],
      duplicateCandidates: [],
      warnings: [
        'No verified Hevy CSV schema/parser is available. Nothing has been imported.',
      ],
    };
  const result = parser.parse(csv);
  return {
    stage: 'mapping',
    workouts: result.workouts,
    mappings: [
      ...new Set(
        result.workouts.flatMap((w) => w.exercises.map((e) => e.sourceName)),
      ),
    ].map((incomingName) => ({
      incomingName,
      exerciseId: null,
      resolution: 'unresolved',
    })),
    duplicateCandidates: [],
    warnings: result.warnings,
  };
}
export function canConfirmHevyImport(preview: HevyImportPreview) {
  return (
    preview.stage === 'confirmation' &&
    preview.workouts.length > 0 &&
    preview.mappings.every(
      (m) => m.exerciseId !== null && m.resolution !== 'unresolved',
    ) &&
    preview.duplicateCandidates.every((d) => d.resolved)
  );
}
export interface HevyImportCommitter {
  commit(
    preview: HevyImportPreview,
    explicitApproval: boolean,
  ): Promise<GymWorkout[]>;
}
// A verified parser and duplicate scan must precede confirmation; imported provenance is hevy_import.
