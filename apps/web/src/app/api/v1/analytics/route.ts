import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/db/prisma";
import {
  aggregateMetrics,
  buildAnalyticsSummary,
  type RawEventMetrics,
} from "@/lib/analytics/metrics";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Returns aggregated analytics for the authenticated user's projects. The
 * `metrics` block is all-time; `series` is the trailing 7 days bucketed by
 * ISO date so the dashboard can render a line chart without gaps. Analytics
 * events are written by campaign reporting flows; this endpoint simply reads
 * them. Session-checked, so it returns 401 when unauthenticated.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const since = new Date(Date.now() - SEVEN_DAYS_MS);
    const [recent, allTime] = await Promise.all([
      prisma.analyticsEvent.findMany({
        where: {
          project: { createdBy: session.user.id },
          createdAt: { gte: since },
        },
        select: { metadata: true, createdAt: true },
      }),
      prisma.analyticsEvent.findMany({
        where: { project: { createdBy: session.user.id } },
        select: { metadata: true },
      }),
    ]);

    const metrics = allTime.map(
      (e) => e.metadata as unknown as RawEventMetrics,
    );

    const byDay = new Map<string, RawEventMetrics[]>();
    for (const e of recent) {
      const day = new Date(e.createdAt).toISOString().slice(0, 10);
      const arr = byDay.get(day) ?? [];
      arr.push(e.metadata as unknown as RawEventMetrics);
      byDay.set(day, arr);
    }

    const dayLabels: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      dayLabels.push(d.toISOString().slice(0, 10));
    }

    const series = dayLabels.map((day) => {
      const m = aggregateMetrics(byDay.get(day) ?? []);
      return {
        date: day,
        impressions: m.impressions,
        clicks: m.clicks,
        conversions: m.conversions,
      };
    });

    const summary = buildAnalyticsSummary({
      metrics,
      series,
      timeframe: "Last 7 days",
    });

    return NextResponse.json({ success: true, data: summary });
  } catch (error) {
    console.error("Error fetching analytics:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch analytics" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";
