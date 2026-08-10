import type { SubscriptionTier } from "@prisma/client";

export const CREDIT_PACKAGE_IDS = ["starter", "pro", "business"] as const;
export type CreditPackageId = (typeof CREDIT_PACKAGE_IDS)[number];

export interface CreditPackage {
  id: CreditPackageId;
  name: string;
  /** Number of credits included. */
  credits: number;
  /** Display price in whole dollars. */
  price: number;
  /** Stripe unit amount in cents. */
  unitAmount: number;
  /** Subscription tier bumped to when this package is purchased. */
  tier: SubscriptionTier;
  description: string;
}

/**
 * Single source of truth for purchasable credit packages. Both the Checkout
 * route and the Stripe webhook read from here so credits/prices/tiers can
 * never drift between the payment page and fulfillment.
 */
export const CREDIT_PACKAGES: Record<CreditPackageId, CreditPackage> = {
  starter: {
    id: "starter",
    name: "Starter",
    credits: 250,
    price: 19,
    unitAmount: 1900,
    tier: "creator",
    description: "Perfect for your first campaign",
  },
  pro: {
    id: "pro",
    name: "Pro",
    credits: 1000,
    price: 49,
    unitAmount: 4900,
    tier: "creator",
    description: "Best for regular content creation",
  },
  business: {
    id: "business",
    name: "Business",
    credits: 5000,
    price: 149,
    unitAmount: 14900,
    tier: "team",
    description: "For agencies and high-volume launches",
  },
} as const;

export function isCreditPackageId(value: string): value is CreditPackageId {
  return (CREDIT_PACKAGE_IDS as readonly string[]).includes(value);
}