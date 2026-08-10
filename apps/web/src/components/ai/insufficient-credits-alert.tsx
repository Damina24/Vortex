"use client";

import Link from "next/link";
import { AlertTriangle, Coins } from "lucide-react";

/**
 * Inline alert shown when an AI-powered action fails with HTTP 402
 * (insufficient credits). Gives the user the server's message and a direct
 * path to the credits page so they can top up and retry.
 */
export function InsufficientCreditsAlert({ message }: { message: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-50/60 px-4 py-3 dark:bg-amber-950/30">
      <div className="flex min-w-0 items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
            You&apos;re out of credits
          </p>
          <p className="text-xs text-amber-800/80 dark:text-amber-200/80">
            {message}
          </p>
        </div>
      </div>
      <Link
        href="/dashboard/credits"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-vortex-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-vortex-700 transition-colors"
      >
        <Coins className="h-3.5 w-3.5" />
        Buy credits
      </Link>
    </div>
  );
}