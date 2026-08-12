"use client";

import { useEffect, useState } from "react";
import type { ElementType } from "react";
import axios from "axios";
import {
  Activity,
  BarChart3,
  MousePointerClick,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import type {
  AnalyticsSeriesPoint,
  AnalyticsSummary,
} from "@/lib/analytics/metrics";
import type { PerformanceMetrics, PerformancePrediction } from "@/types";

const formatNumber = (n: number) => n.toLocaleString();
const formatPercent = (n: number) => `${(n * 100).toFixed(1)}%`;
const formatCurrency = (n: number) => `$${n.toFixed(2)}`;

const TIER_LABEL: Record<string, string> = {
  poor: "Needs attention",
  fair: "Fair",
  good: "Good",
  excellent: "Excellent",
};
const TIER_COLOR: Record<string, string> = {
  poor: "text-red-500",
  fair: "text-amber-500",
  good: "text-sky-500",
  excellent: "text-vortex-600",
};
/* __SPLIT_B__ */

function KpiCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: ElementType;
}) {
  return (
    <div className="rounded-xl border bg-background p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

function KpiGrid({ metrics }: { metrics: PerformanceMetrics }) {
  const kpis: [string, string, ElementType][] = [
    ["Impressions", formatNumber(metrics.impressions), TrendingUp],
    ["Clicks", formatNumber(metrics.clicks), MousePointerClick],
    ["CTR", formatPercent(metrics.ctr), Activity],
    ["Conversions", formatNumber(metrics.conversions), Target],
    ["Conversion rate", formatPercent(metrics.conversionRate), Target],
    ["ROAS", `${metrics.roas.toFixed(2)}x`, Sparkles],
    ["Spend", formatCurrency(metrics.spend), Activity],
    ["Cost / conv", formatCurrency(metrics.costPerConversion), Activity],
  ];
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {kpis.map(([label, value, Icon]) => (
        <KpiCard key={label} label={label} value={value} icon={Icon} />
      ))}
    </div>
  );
}

function MetricBarChart({ metrics }: { metrics: PerformanceMetrics }) {
  const items: { label: string; value: number; Icon: ElementType }[] = [
    { label: "Impressions", value: metrics.impressions, Icon: TrendingUp },
    { label: "Clicks", value: metrics.clicks, Icon: MousePointerClick },
    { label: "Conversions", value: metrics.conversions, Icon: Target },
    { label: "Spend ($)", value: metrics.spend, Icon: Activity },
  ];
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="rounded-xl border bg-background p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Performance by metric</h2>
      </div>
      <div className="space-y-4">
        {items.map(({ label, value, Icon }) => (
          <div key={label} className="flex items-center gap-3">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <span className="w-24 text-sm text-muted-foreground">{label}</span>
            <div className="relative flex-1 h-6 rounded bg-slate-200 dark:bg-slate-700">
              <div
                className="h-6 rounded bg-vortex-600"
                style={{ width: `${(value / max) * 100}%` }}
              />
              <span className="absolute inset-0 flex items-center justify-end pr-2 text-xs font-medium text-foreground">
                {formatNumber(value)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SeriesChart({ series }: { series: AnalyticsSeriesPoint[] }) {
  const values = series.map((p) => p.clicks);
  const max = Math.max(...values, 1);
  const W = 480;
  const H = 120;
  const pad = 16;
  const span = Math.max(values.length - 1, 1);
  const points = values
    .map((v, i) => {
      const x = pad + (i * (W - 2 * pad)) / span;
      const y = H - pad - (v / max) * (H - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <div className="rounded-xl border bg-background p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Activity className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Clicks (last 7 days)</h2>
      </div>
      <svg className="h-32 w-full" viewBox={`0 0 ${W} ${H}`}>
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          points={points}
          className="stroke-vortex-600"
        />
        {values.map((v, i) => {
          const x = pad + (i * (W - 2 * pad)) / span;
          const y = H - pad - (v / max) * (H - 2 * pad);
          return (
            <circle
              key={i}
              cx={x.toFixed(1)}
              cy={y.toFixed(1)}
              r="3"
              fill="currentColor"
            />
          );
        })}
      </svg>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        {series.map((p) => (
          <span key={p.date}>
            {new Date(p.date).toLocaleDateString(undefined, {
              weekday: "short",
            })}
          </span>
        ))}
      </div>
    </div>
  );
}

function PredictionCard({ prediction }: { prediction: PerformancePrediction }) {
  const cls = TIER_COLOR[prediction.tier] ?? "text-foreground";
  return (
    <div className="rounded-xl border bg-background p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-vortex-600" />
        <h2 className="text-lg font-semibold">Performance outlook</h2>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Predicted CTR:{" "}
        <span className="font-medium text-foreground">
          {formatPercent(prediction.predictedCtr)}
        </span>{" "}
        · Confidence {Math.round(prediction.confidence)}%
      </p>
      <p className={`mt-1 font-semibold ${cls}`}>
        {TIER_LABEL[prediction.tier]}
      </p>
      <ul className="mt-3 list-disc pl-5 text-sm text-muted-foreground">
        {prediction.suggestions.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
    </div>
  );
}

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    axios
      .get("/api/v1/analytics")
      .then((res) => {
        if (!active) return;
        if (!res.data?.success) {
          throw new Error(res.data?.error || "Failed to load analytics");
        }
        setSummary(res.data.data as AnalyticsSummary);
        setError(null);
      })
      .catch((e) => {
        if (active) {
          setError(e?.response?.data?.error || "Could not load analytics");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground">
          Performance overview for your projects over the last 7 days.
        </p>
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-10 text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading analytics…
        </div>
      )}

      {!loading && error && (
        <div className="py-10 text-center text-muted-foreground">
          <p className="mb-2">Couldn’t load analytics.</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {!loading && summary && (
        <div className="space-y-8">
          <KpiGrid metrics={summary.metrics} />
          <MetricBarChart metrics={summary.metrics} />
          <SeriesChart series={summary.series} />
          <PredictionCard prediction={summary.prediction} />
        </div>
      )}
    </div>
  );
}
