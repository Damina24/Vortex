"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import {
  BarChart3,
  Loader2,
  Sparkles,
  Trophy,
  FlaskConical,
} from "lucide-react";
import type {
  CampaignAbSummary,
  CampaignVariantSummary,
} from "@/lib/publishing/campaign-ab-summary";

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  meta: "Meta",
  google: "Google",
  organic: "Organic",
};

const formatNumber = (n: number) => n.toLocaleString();
const formatPercent = (n: number) => `${(n * 100).toFixed(1)}%`;
const formatCurrency = (n: number) => `$${n.toFixed(2)}`;

function VariantRow({ variant, isLeader }: { variant: CampaignVariantSummary; isLeader: boolean }) {
  return (
    <tr className={isLeader ? "border-l-2 border-vortex-500 bg-vortex-500/5" : ""}>
      <td className="py-1.5 pr-3 font-medium">
        <span className="inline-flex items-center gap-1.5">
          {variant.isWinner && <Trophy className="h-3.5 w-3.5 text-green-500" />}
          {variant.variantName}
          {isLeader && <Sparkles className="h-3.5 w-3.5 text-vortex-500" />}
        </span>
      </td>
      <td className="py-1.5 pr-3">{formatNumber(variant.impressions)}</td>
      <td className="py-1.5 pr-3">{formatPercent(variant.ctr)}</td>
      <td className="py-1.5 pr-3">{formatNumber(variant.conversions)}</td>
      <td className="py-1.5 pr-3">{formatPercent(variant.conversionRate)}</td>
      <td className="py-1.5 pr-3">{formatCurrency(variant.cpa)}</td>
      <td className="py-1.5">{variant.roas > 0 ? `${variant.roas.toFixed(2)}x` : "—"}</td>
    </tr>
  );
}

function CampaignCard({ summary }: { summary: CampaignAbSummary }) {
  const leaderId = summary.winnerId;
  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold">{summary.name}</p>
          <p className="text-xs text-muted-foreground">
            {PLATFORM_LABELS[summary.platform ?? ""] ?? summary.platform ?? "—"}
            {summary.platformCampaignId ? ` · ${summary.platformCampaignId}` : ""}
            {summary.createdAt
              ? ` · ${new Date(summary.createdAt).toLocaleDateString()}`
              : ""}
            {" · "}confidence {summary.confidence}%
          </p>
        </div>
        {summary.hasWinner && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950">
            <Trophy className="h-3.5 w-3.5" /> winner chosen
          </span>
        )}
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="pb-2 font-medium">Variant</th>
            <th className="pb-2 font-medium">Impr.</th>
            <th className="pb-2 font-medium">CTR</th>
            <th className="pb-2 font-medium">Conv.</th>
            <th className="pb-2 font-medium">CVR</th>
            <th className="pb-2 font-medium">CPA</th>
            <th className="pb-2 font-medium">ROAS</th>
          </tr>
        </thead>
        <tbody>
          {summary.variants.map((v) => (
            <VariantRow key={v.variantId} variant={v} isLeader={v.variantId === leaderId} />
          ))}
        </tbody>
      </table>

      {(summary.hasWinner || leaderId) && (
        <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-vortex-500" />
          <span>{summary.recommendation}</span>
        </p>
      )}
    </div>
  );
}

/**
 * Renders live A/B results for the user's published campaigns: per-variant
 * metrics, the current statistical leader, any chosen winner, and the
 * evaluator's recommendation. Consumes `GET /api/v1/analytics/campaigns`.
 */
export function CampaignAbPanel() {
  const [summaries, setSummaries] = useState<CampaignAbSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    axios
      .get("/api/v1/analytics/campaigns")
      .then((res) => {
        if (!active) return;
        if (!res.data?.success) {
          throw new Error(res.data?.error || "Failed to load campaign analytics");
        }
        setSummaries(res.data.data ?? []);
        setError(null);
      })
      .catch((e) => {
        if (active) {
          setError(e?.response?.data?.error || "Could not load campaign analytics");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border bg-background p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">A/B test results</h2>
        </div>
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading campaign analytics…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border bg-background p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">A/B test results</h2>
        </div>
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  const hasData = summaries !== null && summaries.length > 0;

  return (
    <div className="rounded-xl border bg-background p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">A/B test results</h2>
      </div>

      {!hasData ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <FlaskConical className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            No A/B tests running. Publish a video and add a variant on the{" "}
            Publishing page to start comparing creatives.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {summaries!.map((s) => (
            <CampaignCard key={s.campaignId} summary={s} />
          ))}
        </div>
      )}
    </div>
  );
}