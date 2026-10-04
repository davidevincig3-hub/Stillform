'use client';
import { useState } from 'react';
import { useWorkout } from './workout-provider';
import {
  previewHevyImport,
  initialMappings,
  suggestedExercises,
  duplicateStatus,
  buildHevyPlan,
  commitHevyPlan,
  type HevyParsed,
  type ExerciseMapping,
  type DuplicateDecision,
  type HevyPlan,
} from '@/integrations/hevy-import';
export function HevyImportControls() {
  const { store, ready, error, save } = useWorkout();
  const [parsed, setParsed] = useState<HevyParsed | null>(null),
    [mappings, setMappings] = useState<ExerciseMapping[]>([]),
    [decisions, setDecisions] = useState<Record<string, DuplicateDecision>>({}),
    [plan, setPlan] = useState<HevyPlan | null>(null),
    [approved, setApproved] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [page, setPage] = useState(0),
    [timeZone, setTimeZone] = useState('Europe/Rome');
  const [result, setResult] = useState<HevyPlan['summary'] | null>(null);
  function change(mapping: ExerciseMapping) {
    setMappings((ms) =>
      ms.map((m) => (m.incomingName === mapping.incomingName ? mapping : m)),
    );
    setPlan(null);
    setApproved(false);
  }
  function custom(m: ExerciseMapping): ExerciseMapping {
    const id = crypto.randomUUID();
    return {
      ...m,
      exerciseId: id,
      resolution: 'create-new',
      custom: {
        id,
        name: m.incomingName,
        primaryMuscleGroup: 'Unassigned',
        secondaryMuscleGroups: [],
        custom: true,
      },
    };
  }
  const selectableExercises = [
    ...store.exercises,
    ...mappings
      .filter((m) => m.resolution === 'create-new' && m.custom)
      .map((m) => m.custom!),
  ];
  const unresolved = mappings.filter(
    (m) => m.resolution === 'unresolved',
  ).length;
  const duplicates =
    parsed?.workouts.filter(
      (w) => duplicateStatus(w, store, parsed ?? undefined) === 'duplicate',
    ).length ?? 0;
  const ambiguous =
    parsed?.workouts.filter(
      (w) => duplicateStatus(w, store, parsed ?? undefined) === 'ambiguous',
    ) ?? [];
  return (
    <section aria-label="Hevy import" className="hevy-import">
      <h3>Import Hevy history</h3>
      <p className="caption">
        Select → Preview → Map exercises → Review duplicates → Confirm. Preview
        does not save data. Export a JSON backup first.
      </p>
      <label htmlFor="hevy-zone">Source timezone (CSV has no offset)</label>
      <input
        id="hevy-zone"
        value={timeZone}
        disabled={busy}
        onChange={(e) => {
          setTimeZone(e.target.value);
          setParsed(null);
          setPlan(null);
          setResult(null);
        }}
      />
      <p className="caption">
        Europe/Rome preserves Italian local times with daylight saving. Verify
        this matches where the export was recorded; reselect the file after
        changing it.
      </p>
      <label htmlFor="hevy-file">Select Hevy CSV</label>
      <input
        id="hevy-file"
        type="file"
        accept=".csv,text/csv"
        disabled={!ready || Boolean(error) || busy}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setParsed(null);
          setPlan(null);
          setResult(null);
          setApproved(false);
          setMessage('');
          setDecisions({});
          setPage(0);
          if (file.size > 10_000_000) {
            setMessage('File exceeds the 10 MB import limit.');
            return;
          }
          setBusy(true);
          try {
            const preview = await previewHevyImport(
              await file.text(),
              timeZone,
            );
            setParsed(preview);
            setMappings(initialMappings(preview, store));
          } catch {
            setMessage('File could not be parsed. Nothing imported.');
          } finally {
            setBusy(false);
          }
        }}
      />
      {busy && <p role="status">Parsing and validating…</p>}
      {parsed && (
        <>
          <h3>Import preview</h3>
          <p>
            {parsed.workouts.length} workouts · {parsed.rowCount} set rows ·{' '}
            {parsed.names.length} exercise names
          </p>
          <p className="caption">
            {parsed.workouts[0]?.sourceStart} –{' '}
            {parsed.workouts.at(-1)?.sourceStart} · {timeZone}
          </p>
          <p>
            {duplicates} duplicates will be skipped · {ambiguous.length}{' '}
            possible duplicates · {unresolved} unresolved mappings
          </p>
          <details open={parsed.errors.length > 0 ? true : undefined}>
            <summary>
              Warnings / errors ({parsed.warnings.length + parsed.errors.length}
              )
            </summary>
            {parsed.errors.length > 0 && (
              <p className="notice">
                Import blocked: fix every source error and select the file
                again.
              </p>
            )}
            {[...parsed.errors, ...parsed.warnings]
              .slice(0, 100)
              .map((w, i) => (
                <p className="caption" key={i}>
                  {w}
                </p>
              ))}
            {parsed.errors.length + parsed.warnings.length > 100 && (
              <p>
                Additional issues omitted from display; all errors still block
                import.
              </p>
            )}
          </details>
          {!parsed.errors.length && (
            <>
              <h3>Exercise mapping</h3>
              <p className="caption">
                Suggestions are optional. Multiple source names may map to one
                exercise only through your selections. Unassigned metadata stays
                visible in analytics.
              </p>
              <button
                className="secondary"
                onClick={() => {
                  setMappings((ms) =>
                    ms.map((m) =>
                      m.resolution === 'unresolved' ? custom(m) : m,
                    ),
                  );
                  setPlan(null);
                  setApproved(false);
                }}
              >
                Prepare custom exercises for all unresolved names
              </button>
              {mappings.slice(page * 10, page * 10 + 10).map((m) => (
                <div className="card" key={m.incomingName}>
                  <strong className="import-name">{m.incomingName}</strong>
                  <label>
                    Map {m.incomingName}
                    <select
                      aria-label={`Map ${m.incomingName}`}
                      value={
                        m.resolution === 'create-new'
                          ? 'create'
                          : (m.exerciseId ?? '')
                      }
                      onChange={(e) => {
                        const value = e.target.value;
                        change(
                          value === 'create'
                            ? custom(m)
                            : {
                                incomingName: m.incomingName,
                                exerciseId: value || null,
                                resolution: value
                                  ? store.exercises.some((e) => e.id === value)
                                    ? 'existing'
                                    : 'synonym'
                                  : 'unresolved',
                              },
                        );
                      }}
                    >
                      <option value="">Unresolved — review required</option>
                      <option value="create">Create custom exercise</option>
                      {selectableExercises
                        .filter((e) => e.id !== m.custom?.id)
                        .map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name} · {e.primaryMuscleGroup}
                          </option>
                        ))}
                    </select>
                  </label>
                  {m.resolution === 'unresolved' && (
                    <p className="caption">
                      Suggestions:{' '}
                      {suggestedExercises(m.incomingName, store.exercises)
                        .map((e) => e.name)
                        .join(', ') || 'None'}
                      . No automatic merge.
                    </p>
                  )}
                  {m.custom && m.resolution === 'create-new' && (
                    <>
                      <label>
                        Custom name
                        <input
                          aria-label={`Custom name ${m.incomingName}`}
                          value={m.custom.name}
                          onChange={(e) =>
                            change({
                              ...m,
                              custom: { ...m.custom!, name: e.target.value },
                            })
                          }
                        />
                      </label>
                      <label>
                        Primary muscle group
                        <input
                          aria-label={`Muscle ${m.incomingName}`}
                          value={m.custom.primaryMuscleGroup}
                          onChange={(e) =>
                            change({
                              ...m,
                              custom: {
                                ...m.custom!,
                                primaryMuscleGroup: e.target.value,
                              },
                            })
                          }
                        />
                      </label>
                      <label>
                        Secondary groups (comma separated)
                        <input
                          value={m.custom.secondaryMuscleGroups.join(', ')}
                          onChange={(e) =>
                            change({
                              ...m,
                              custom: {
                                ...m.custom!,
                                secondaryMuscleGroups: e.target.value
                                  .split(',')
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                              },
                            })
                          }
                        />
                      </label>
                      <label>
                        Equipment
                        <input
                          value={m.custom.equipment ?? ''}
                          onChange={(e) =>
                            change({
                              ...m,
                              custom: {
                                ...m.custom!,
                                equipment: e.target.value,
                              },
                            })
                          }
                        />
                      </label>
                      <label>
                        Category
                        <input
                          value={m.custom.category ?? ''}
                          onChange={(e) =>
                            change({
                              ...m,
                              custom: {
                                ...m.custom!,
                                category: e.target.value,
                              },
                            })
                          }
                        />
                      </label>
                    </>
                  )}
                </div>
              ))}
              <div className="row start">
                <button
                  className="secondary"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous mappings
                </button>
                <span>
                  Page {page + 1} /{' '}
                  {Math.max(1, Math.ceil(mappings.length / 10))}
                </span>
                <button
                  className="secondary"
                  disabled={(page + 1) * 10 >= mappings.length}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next mappings
                </button>
              </div>
              {ambiguous.length > 0 && (
                <details>
                  <summary>Review possible duplicates</summary>
                  {ambiguous.map((w) => (
                    <label key={w.fingerprint}>
                      {w.title} · {w.sourceStart}
                      <select
                        aria-label={`Duplicate ${w.fingerprint}`}
                        value={decisions[w.fingerprint] ?? ''}
                        onChange={(e) => {
                          setDecisions((ds) => ({
                            ...ds,
                            [w.fingerprint]: e.target
                              .value as DuplicateDecision,
                          }));
                          setPlan(null);
                          setApproved(false);
                        }}
                      >
                        <option value="">Review required</option>
                        <option value="skip">Skip this workout</option>
                        <option value="separate">
                          Import as a separate workout
                        </option>
                      </select>
                    </label>
                  ))}
                </details>
              )}
              <button
                className="secondary"
                disabled={unresolved > 0 || Boolean(error)}
                onClick={() => {
                  try {
                    setPlan(buildHevyPlan(store, parsed, mappings, decisions));
                    setApproved(false);
                    setMessage('');
                  } catch (e) {
                    setMessage(
                      e instanceof Error ? e.message : 'Import plan invalid',
                    );
                  }
                }}
              >
                Review import summary
              </button>
            </>
          )}
        </>
      )}
      {plan && (
        <section className="notice">
          <h3>Confirm import</h3>
          <p>
            {plan.summary.workouts} workouts ready · {plan.summary.sets} sets ·{' '}
            {plan.summary.duplicates} skipped duplicates ·{' '}
            {plan.summary.customExercises} custom exercises ·{' '}
            {plan.summary.existingMappings} names mapped to existing exercises
          </p>
          {plan.summary.warnings.map((w, i) => (
            <p className="caption" key={i}>
              {w}
            </p>
          ))}
          <label className="row start">
            <input
              type="checkbox"
              checked={approved}
              onChange={(e) => setApproved(e.target.checked)}
            />
            I reviewed timezone, mappings, duplicates and warnings
          </label>
          <button
            disabled={!approved || busy || Boolean(error)}
            onClick={() => {
              try {
                const summary = commitHevyPlan(plan, store, approved, save);
                setResult(summary);
                setParsed(null);
                setPlan(null);
                setMessage('');
              } catch (e) {
                setMessage(e instanceof Error ? e.message : 'Import failed');
              }
            }}
          >
            Confirm and import Hevy history
          </button>
        </section>
      )}
      {result && (
        <section role="status" className="notice">
          <h3>Import complete</h3>
          <p>
            {result.workouts} workouts imported · {result.sets} sets imported ·{' '}
            {result.duplicates} duplicates skipped · {result.customExercises}{' '}
            custom exercises created · {result.existingMappings} names mapped to
            existing exercises · {result.skippedSets} duplicate set rows skipped
            · 0 unresolved rows
          </p>
          <p className="caption">
            {result.start} – {result.end}
          </p>
          {result.warnings.map((w, i) => (
            <p className="caption" key={i}>
              {w}
            </p>
          ))}
        </section>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {store.importBatches.length > 0 && (
        <details>
          <summary>Saved import batches ({store.importBatches.length})</summary>
          {store.importBatches
            .slice(-10)
            .reverse()
            .map((b) => (
              <p className="caption" key={b.id}>
                {new Date(b.importedAt).toLocaleString()} · {b.workouts}{' '}
                workouts · {b.sets} sets · {b.duplicates} skipped · {b.timeZone}
              </p>
            ))}
        </details>
      )}
    </section>
  );
}
