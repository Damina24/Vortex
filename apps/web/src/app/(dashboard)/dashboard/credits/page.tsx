"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Sparkles,
  CreditCard,
  CheckCircle2,
  History,
  ArrowDownLeft,
  ArrowUpRight,
  Loader2,
} from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";
import { notifyCreditsUpdated, useLiveCredits } from "@/lib/credits-client";
import {
  CREDIT_PACKAGES,
  CREDIT_PACKAGE_LIST,
  type CreditPackageId,
} from "@/lib/billing/packages";

interface CreditTransaction {
  id: string;
  amount: number;
  transactionType: "purchase" | "usage" | "bonus" | "refund";
  description: string | null;
  createdAt: string;
}

const transactionMeta: Record<
  CreditTransaction["transactionType"],
  { label: string; isCredit: boolean }
> = {
  purchase: { label: "Added", isCredit: true },
  bonus: { label: "Bonus", isCredit: true },
  usage: { label: "Used", isCredit: false },
  refund: { label: "Refunded", isCredit: true },
};

export default function CreditsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { balance } = useLiveCredits(0);
  const [selectedPackage, setSelectedPackage] =
    useState<CreditPackageId>("pro");
  const [isLoading, setIsLoading] = useState(false);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);
  const [awaitingCredits, setAwaitingCredits] = useState(false);
  // When the user is bounced back from Stripe Checkout the webhook may still
  // be granting credits; we detect the new "purchase" ledger row relative to
  // when this page loaded.
  const pageLoadStartedAt = useRef(Date.now());

  const loadTransactions = useCallback(async () => {
    try {
      const response = await axios.get("/api/v1/billing/transactions");
      const next = (response.data?.data ?? []) as CreditTransaction[];
      setTransactions(next);
      return next;
    } catch {
      setTransactions([]);
      return [];
    }
  }, []);

  // Initial ledger load.
  useEffect(() => {
    let active = true;
    setIsLoadingTransactions(true);
    loadTransactions().finally(() => {
      if (active) setIsLoadingTransactions(false);
    });
    return () => {
      active = false;
    };
  }, [loadTransactions]);

  // Returning from Stripe Checkout (success/cancel) is signalled via the
  // `checkout` query parameter.
  useEffect(() => {
    const status = searchParams.get("checkout");
    if (status === "success") {
      toast.success("Payment confirmed — verifying your credits…");
      router.replace("/dashboard/credits", { scroll: false });
      setAwaitingCredits(true);
    } else if (status === "cancelled") {
      toast("Checkout cancelled — no credits were charged.");
      router.replace("/dashboard/credits");
    }
  }, [router, searchParams]);

  // In live Stripe mode the credits are granted by the webhook, which can lag
  // a few seconds behind the success redirect. Poll until the new "purchase"
  // ledger row created around the time this page loaded appears, then
  // broadcast the update so the header/sidebar/dashboard stay in sync.
  useEffect(() => {
    if (!awaitingCredits) return;

    let cancelled = false;
    let attempts = 0;

    async function verifyPurchase() {
      if (cancelled) return;

      const next = await loadTransactions();
      const confirmed = next.some(
        (tx) =>
          tx.transactionType === "purchase" &&
          new Date(tx.createdAt).getTime() >=
            pageLoadStartedAt.current - 60_000,
      );

      if (confirmed) {
        setAwaitingCredits(false);
        notifyCreditsUpdated();
        toast.success("Credits added to your balance.");
      } else {
        attempts += 1;
        if (attempts >= 40) {
          // ~60s of polling. The webhook may still land — balances keep
          // refreshing on mount either way.
          setAwaitingCredits(false);
          toast("If your credits don't appear shortly, contact support.");
        } else {
          window.setTimeout(verifyPurchase, 1500);
        }
      }
    }

    window.setTimeout(verifyPurchase, 1500);
    return () => {
      cancelled = true;
    };
  }, [awaitingCredits, loadTransactions]);

  async function handlePurchase() {
    setIsLoading(true);

    try {
      const response = await axios.post("/api/v1/billing/checkout", {
        packageId: selectedPackage,
      });

      if (!response.data?.success) {
        toast.error(response.data?.error || "Purchase failed");
        return;
      }

      const data = response.data.data;
      if (!data) {
        toast.error("Checkout could not be started.");
        return;
      }

      // Demo mode (no Stripe configured): the checkout route granted the
      // credits immediately, so confirm in place and refresh the ledger /
      // balance everywhere instead of round-tripping through a redirect.
      if (typeof data.creditsBalance === "number") {
        await loadTransactions();
        notifyCreditsUpdated();
        toast.success(
          `Demo purchase complete — ${data.credits.toLocaleString()} credits added.`,
        );
        return;
      }

      // Real Stripe Checkout: hand off to Stripe, then return via the
      // `checkout=success` query parameter, which triggers the verification
      // poll above (the webhook grants the credits).
      if (data.checkoutUrl) {
        window.location.assign(data.checkoutUrl);
      } else {
        toast.error("Checkout could not be started.");
      }
    } catch (error) {
      toast.error("Unable to start checkout right now");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-vortex-600">
          Monetization
        </p>
        <h1 className="text-3xl font-bold tracking-tight">
          Buy credits to keep creating
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Keep your campaigns moving by purchasing credits for storyboards,
          creative direction, and fast iteration when you need more output.
        </p>
      </div>

      {/* Current balance */}
      <div className="rounded-2xl border bg-gradient-to-br from-vortex-50 to-transparent p-6 dark:from-vortex-950">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-vortex-100 dark:bg-vortex-950">
            <Sparkles className="h-6 w-6 text-vortex-600 dark:text-vortex-400" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Available credits</p>
            <p className="text-3xl font-bold">{balance.toLocaleString()}</p>
          </div>
        </div>
        {awaitingCredits && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-vortex-50 px-3 py-2 text-sm text-vortex-700 dark:bg-vortex-950 dark:text-vortex-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            Verifying your purchase — credits will appear here shortly.
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {CREDIT_PACKAGE_LIST.map((pkg) => (
          <button
            key={pkg.id}
            type="button"
            onClick={() => setSelectedPackage(pkg.id)}
            className={`rounded-2xl border p-6 text-left transition-all ${
              selectedPackage === pkg.id
                ? "border-vortex-500 bg-vortex-50 shadow-sm dark:bg-vortex-950"
                : "hover:border-vortex-500/50"
            } ${pkg.highlight ? "ring-2 ring-vortex-500/20" : ""}`}
          >
            {pkg.highlight && (
              <span className="mb-4 inline-flex rounded-full bg-vortex-600 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                Most Popular
              </span>
            )}
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-vortex-500" />
              <h2 className="text-xl font-semibold">{pkg.name}</h2>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              {pkg.description}
            </p>
            <div className="mt-6 flex items-baseline gap-2">
              <span className="text-4xl font-bold">${pkg.price}</span>
              <span className="text-sm text-muted-foreground">one-time</span>
            </div>
            <div className="mt-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>{pkg.credits} credits included</span>
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="rounded-2xl border bg-background p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Selected package
            </p>
            <p className="text-lg font-semibold">
              {CREDIT_PACKAGES[selectedPackage]?.name} —{" "}
              {CREDIT_PACKAGES[selectedPackage]?.credits} credits
            </p>
          </div>
          <button
            onClick={handlePurchase}
            disabled={isLoading || awaitingCredits}
            className="inline-flex items-center gap-2 rounded-lg bg-vortex-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-vortex-700 disabled:opacity-50"
          >
            <CreditCard className="h-4 w-4" />
            {awaitingCredits
              ? "Verifying…"
              : isLoading
                ? "Processing..."
                : "Buy Credits"}
          </button>
        </div>
      </div>

      {/* Transaction history */}
      <div className="rounded-2xl border bg-background p-6 shadow-sm">
        <div className="mb-2 flex items-center gap-2">
          <History className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Transaction History</h2>
        </div>

        {isLoadingTransactions ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading transactions…
          </div>
        ) : transactions.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No transactions yet. Purchases and AI usage will show up here.
          </p>
        ) : (
          <div className="divide-y">
            {transactions.map((tx) => {
              const meta = transactionMeta[tx.transactionType];
              const Icon = meta.isCredit ? ArrowDownLeft : ArrowUpRight;
              return (
                <div
                  key={tx.id}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        meta.isCredit
                          ? "bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400"
                          : "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {tx.description || meta.label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {meta.label} ·{" "}
                        {new Date(tx.createdAt).toLocaleString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-sm font-semibold ${
                      meta.isCredit
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {meta.isCredit ? "+" : "−"}
                    {Math.abs(tx.amount).toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
