"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import {
  CheckCircle2,
  FlaskConical,
  Loader2,
  Plus,
  Trophy,
  X,
} from "lucide-react";

// --- Types (mirror the publishing API contract) ------------------------------

interface VariantMetrics {
  impressions?: number;
  clicks?: number;
  conversions?: number;
  cost?: number;
  revenue?: number;
}

interface AbTestVariant {
  id: string;
  variantName: string | null;
  isWinner: boolean;
  performanceMetrics: VariantMetrics | null;
  asset: { id: string; url: string; name: string } | null;
}

interface AbTestCampaign {
  id: string;
  name: string;
  platform: string;
  project: { id: string; name: string };
  variants: AbTestVariant[];
}

interface ComputedVariant {
  id: string;
  variantName: string;
  isWinner: boolean;
  impressions: number;
  clicks: number;
  conversions: number;
  cost: number;
  revenue: number;
  ctr: number;
  conversionRate: number;
  cpa: number;
  roas: number;
}

interface AssetOption {
  id: string;
  name: string;
  duration: number | null;
}

// --- Metrics + formatting helpers --------------------------------------------

function computeMetrics(m: VariantMetrics | null | undefined) {
  const impressions = m?.impressions ?? 0;
  const clicks = m?.clicks ?? 0;
  const conversions = m?.conversions ?? 0;
  const cost = m?.cost ?? 0;
  const revenue = m?.revenue ?? 0;
  return {
    impressions,
    clicks,
    conversions,
    cost,
    revenue,
    ctr: impressions > 0 ? clicks / impressions : 0,
    conversionRate: clicks > 0 ? conversions / clicks : 0,
    cpa: conversions > 0 ? cost / conversions : 0,
    roas: cost > 0 ? revenue / cost : 0,
  };
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

const inputClass =
  "w-full rounded-lg border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function AbTestingPanel({ campaignId }: { campaignId: string }) {
  const [campaign, setCampaign] = useState<AbTestCampaign | null>(null);
  const [variants, setVariants] = useState<ComputedVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [recommendation, setRecommendation] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [assetOptions, setAssetOptions] = useState<AssetOption[]>([]);
  const [newAssetId, setNewAssetId] = useState("");
  const [newVariantName, setNewVariantName] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const loadVariants = useCallback(async () => {
    try {
      const { data } = await axios.get(`/api/v1/publishing/${campaignId}`);
      const detail = data.data as AbTestCampaign;
      setCampaign(detail);
      setVariants(
        (detail.variants ?? []).map((v) => ({
          id: v.id,
          variantName: v.variantName ?? `Variant ${v.id.slice(0, 8)}`,
          isWinner: v.isWinner,
          ...computeMetrics(v.performanceMetrics ?? {}),
        })),
      );
      setRecommendation(null);
    } catch {
      toast.error("Failed to load campaign variants");
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    loadVariants();
  }, [loadVariants]);
  async function toggleAddForm() {
    if (showAddForm) {
      setShowAddForm(false);
      return;
    }
    setShowAddForm(true);
    if (campaign?.project.id && assetOptions.length === 0) {
      try {
        const res = await axios.get(
          `/api/v1/projects/${campaign.project.id}/assets`,
        );
        setAssetOptions(res.data.data ?? []);
      } catch {
        toast.error("Failed to load assets");
      }
    }
  }

  async function handleAddVariant(e: React.FormEvent) {
    e.preventDefault();
    if (!newAssetId || !newVariantName.trim()) return;
    setIsAdding(true);
    try {
      await axios.post(`/api/v1/publishing/${campaignId}/variants`, {
        assetId: newAssetId,
        variantName: newVariantName.trim(),
      });
      toast.success("Variant added");
      setNewAssetId("");
      setNewVariantName("");
      setShowAddForm(false);
      await loadVariants();
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.error
        : undefined;
      toast.error(message || "Failed to add variant");
    } finally {
      setIsAdding(false);
    }
  }

  async function handlePromote(variantId: string) {
    setPromotingId(variantId);
    try {
      const { data } = await axios.post(
        `/api/v1/publishing/${campaignId}/winner`,
        { variantId },
      );
      const result = data.data as {
        winnerMetrics: { variantName?: string } | null;
        recommendation: string;
      };
      toast.success(
        result.winnerMetrics?.variantName
          ? `"${result.winnerMetrics.variantName}" promoted`
          : "Variant promoted",
      );
      setRecommendation(result.recommendation);
      await loadVariants();
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.error
        : undefined;
      toast.error(message || "Failed to promote winner");
    } finally {
      setPromotingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border bg-background p-5 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading variants…
      </div>
    );
  }

  const winner = variants.find((v) => v.isWinner);

  return (
    <div className="rounded-2xl border bg-background p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-vortex-500" />
            <h3 className="text-base font-semibold">A/B testing</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {campaign?.name ?? "Campaign"} · {variants.length} variant(s)
          </p>
        </div>
        {winner && (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-400">
            <Trophy className="h-3.5 w-3.5" /> {winner.variantName} winning
          </span>
        )}
      </div>

      {recommendation && (
        <div className="mt-4 rounded-lg border border-vortex-500/30 bg-vortex-50 p-3 text-sm text-vortex-700 dark:bg-vortex-950/50 dark:text-vortex-300">
          {recommendation}
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-4 font-medium">Variant</th>
              <th className="py-2 pr-4 font-medium">Impressions</th>
              <th className="py-2 pr-4 font-medium">Clicks</th>
              <th className="py-2 pr-4 font-medium">CTR</th>
              <th className="py-2 pr-4 font-medium">Conv.</th>
              <th className="py-2 pr-4 font-medium">CPA</th>
              <th className="py-2 pr-4 font-medium">ROAS</th>
              <th className="py-2 font-medium">Decision</th>
            </tr>
          </thead>
          <tbody>
            {variants.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="py-6 text-center text-sm text-muted-foreground"
                >
                  No variants yet — publish once, then add a second creative to
                  start testing.
                </td>
              </tr>
            ) : (
              variants.map((v) => (
                <tr key={v.id} className="border-b last:border-0">
                  <td className="py-2.5 pr-4">
                    <div className="font-medium">{v.variantName}</div>
                    {v.isWinner && (
                      <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                        <CheckCircle2 className="h-3 w-3" /> Winner
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 pr-4 text-muted-foreground">
                    {v.impressions.toLocaleString()}
                  </td>
                  <td className="py-2.5 pr-4 text-muted-foreground">
                    {v.clicks.toLocaleString()}
                  </td>
                  <td className="py-2.5 pr-4">{formatPercent(v.ctr)}</td>
                  <td className="py-2.5 pr-4">
                    {formatPercent(v.conversionRate)}
                  </td>
                  <td className="py-2.5 pr-4">{formatCurrency(v.cpa)}</td>
                  <td className="py-2.5 pr-4">{v.roas.toFixed(2)}x</td>
                  <td className="py-2.5">
                    {v.isWinner ? (
                      <span className="text-xs font-medium text-green-600 dark:text-green-400">
                        Promoted
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handlePromote(v.id)}
                        disabled={promotingId !== null}
                        className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium text-foreground hover:border-vortex-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {promotingId === v.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trophy className="h-3.5 w-3.5" />
                        )}
                        Promote
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showAddForm ? (
        <form
          onSubmit={handleAddVariant}
          className="mt-4 space-y-4 rounded-xl border bg-muted/40 p-4"
        >
          <div className="space-y-2">
            <label
              htmlFor={`variant-asset-${campaignId}`}
              className="text-sm font-medium"
            >
              Creative asset
            </label>
            <select
              id={`variant-asset-${campaignId}`}
              value={newAssetId}
              onChange={(e) => setNewAssetId(e.target.value)}
              className={inputClass}
            >
              <option value="">Select an asset</option>
              {assetOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.duration ? ` · ${a.duration}s` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label
              htmlFor={`variant-name-${campaignId}`}
              className="text-sm font-medium"
            >
              Variant name
            </label>
            <input
              id={`variant-name-${campaignId}`}
              type="text"
              value={newVariantName}
              onChange={(e) => setNewVariantName(e.target.value)}
              placeholder="e.g. Follow-up hook"
              className={inputClass}
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={isAdding || !newAssetId || !newVariantName.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-vortex-600 px-4 py-2 text-sm font-medium text-white hover:bg-vortex-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isAdding && <Loader2 className="h-4 w-4 animate-spin" />}
              Add variant
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" /> Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={toggleAddForm}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-vortex-600 hover:text-vortex-500"
        >
          <Plus className="h-4 w-4" /> Add a variant
        </button>
      )}
    </div>
  );
}
