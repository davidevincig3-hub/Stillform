'use client';
import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { sampleChart } from '@/repositories/seed';
export function MetricChart({
  metric,
  projected = false,
}: {
  metric: string;
  projected?: boolean;
}) {
  const [days, setDays] = useState(28);
  const [analyze, setAnalyze] = useState(false);
  const baseContext = sampleChart(metric, days);
  const context = projected
    ? {
        ...baseContext,
        progression: {
          series: [
            {
              kind: 'planned' as const,
              metric,
              unit: baseContext.unit,
              points: baseContext.points,
              confidence: 'insufficient' as const,
              inputReferences: [],
              isMock: true,
              rationale: 'Illustrative planned duration, not a forecast',
            },
          ],
          forecastStatus: 'insufficient' as const,
          personalDataGate: 'insufficient',
          scientificRationaleGate: 'unverified',
        },
      }
    : baseContext;
  return (
    <section className="card chart-card">
      <div className="row">
        <div>
          <p className="eyebrow">
            {projected
              ? 'Planned trajectory · not a forecast'
              : 'Personal trend · sample'}
          </p>
          <h3>{metric}</h3>
          {projected && (
            <p className="caption">
              Planned · Actual / candidate: unavailable · Forecast: insufficient
              data
            </p>
          )}
        </div>
        <div className="segmented" aria-label={`${metric} timeframe`}>
          {[7, 28, 90].map((d) => (
            <button
              key={d}
              aria-pressed={days === d}
              onClick={() => setDays(d)}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>
      <div className="chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={context.points}
            margin={{ left: 0, right: 12, top: 14, bottom: 0 }}
          >
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="date"
              tickFormatter={(d) => d.slice(5)}
              minTickGap={40}
              tick={{ fontSize: 11, fill: 'var(--muted)' }}
              tickLine={false}
            />
            <YAxis
              domain={['auto', 'auto']}
              width={42}
              tick={{ fontSize: 11, fill: 'var(--muted)' }}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--panel)',
                border: '1px solid var(--border)',
                borderRadius: 12,
              }}
              formatter={(v) => [`${v} ${context.unit}`, metric]}
            />
            <ReferenceLine
              y={context.baseline?.value}
              stroke="var(--muted)"
              strokeDasharray="4 4"
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--accent)"
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="row caption">
        <span>
          {projected
            ? 'Sample planned duration · no performance prediction'
            : 'Dashed: sample baseline · 42 observations · developing'}
        </span>
        <button className="pill" onClick={() => setAnalyze(!analyze)}>
          Analyze
        </button>
      </div>
      {analyze && (
        <div className="notice">
          AI analysis is not connected. This chart provides structured data,
          timeframe, units, baseline and confidence to the future coach.
          <details>
            <summary>Inspect chart context</summary>
            <pre>{JSON.stringify(context, null, 2)}</pre>
          </details>
        </div>
      )}
    </section>
  );
}
