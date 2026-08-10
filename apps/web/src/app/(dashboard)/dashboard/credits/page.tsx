"use client";

import { useEffect, useState } from "react";
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
import { useLiveCredits } from "@/lib/credits-client";

const packages = [
  {
    id: "starter",
    name: "Starter",
    credits: 250,
    price: 19,
    description: "Perfect for your first campaign",
    highlight: false,
  },
  {
    id: "pro",
    name: "Pro",
    credits: 1000,
    price: 49,
    description: "Best for regular content creation",
    highlight: true,
  },
  {
    id: "business",
    name: "Business",
    credits: 5000,
    price: 149,
    description: "For agencies and higher-volume launches",
    highlight: false,
  },
] as const;

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
    useState<(typeof packages)[number]["id"]>("pro");
  const [isLoading, setIsLoading] = useState(false);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);

  useEffect(() => {
    const status = searchParams.get("checkout");
    if (status === "success") {
      toast.success("Payment confirmed. Your credits have been added.");
      router.replace("/dashboard/credits");
    } else if (status === "cancelled") {
      toast("Checkout cancelled — no credits were charged.");
      router.replace("/dashboard/credits");
    }
  }, [router, searchParams]);

  useEffect(() => {
    let active = true;
    async function loadTransactions() {
      try {
        const response = await axios.get("/api/v1/billing/transactions");
        if (active) {
          setTransactions(response.data?.data ?? []);
        }
      } catch {
        setTransactions([]);
      } finally {
        if (active) {
          setIsLoadingTransactions(false);
        }
      }
    }
    loadTransactions();
    return () => {
      active = false;
    };
  }, []);

  async function handlePurchase() {
    setIsLoading(true);

    try {
      const response = await axios.post("/api/v1/billing/checkout", {
        packageId: selectedPackage,
      });

      if (response.data.success && response.data.data?.checkoutUrl) {
        window.location.assign(response.data.data.checkoutUrl);
      } else {
        toast.error(response.data.error || "Purchase failed");
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
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-vortex-600">Monetization</p>
        <h1 className="text-3xl font-bold tracking-tight">Buy credits to keep creating</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Keep your campaigns moving by purchasing credits for storyboards, creative direction, and fast iteration when you need more output.
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
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {packages.map((pkg) => (
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
            <p className="mt-3 text-sm text-muted-foreground">{pkg.description}</p>
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
            <p className="text-sm font-medium text-muted-foreground">Selected package</p>
            <p className="text-lg font-semibold">
              {packages.find((pkg) => pkg.id === selectedPackage)?.name} — {packages.find((pkg) => pkg.id === selectedPackage)?.credits} credits
            </p>
          </div>
          <button
            onClick={handlePurchase}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-vortex-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-vortex-700 disabled:opacity-50"
          >
            <CreditCard className="h-4 w-4" />
            {isLoading ? "Processing..." : "Buy Credits"}
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
