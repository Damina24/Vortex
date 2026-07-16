"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Sparkles, CreditCard, CheckCircle2 } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";

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

export default function CreditsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedPackage, setSelectedPackage] = useState<(typeof packages)[number]["id"]>("pro");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (searchParams.get("checkout") === "success") {
      toast.success("Payment confirmed. Your credits are on the way.");
      router.replace("/dashboard/credits");
    }
  }, [router, searchParams]);

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
    </div>
  );
}
