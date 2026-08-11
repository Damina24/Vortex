import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import {
  CREDIT_PACKAGES,
  isCreditPackageId,
  type CreditPackageId,
} from "@/lib/billing/packages";
import { addPurchaseCredits } from "@/lib/credits";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2024-04-10",
    })
  : null;

/**
 * Handles Stripe events. On `checkout.session.completed` it atomically credits
 * the buyer with the purchased package's credits, bumps their subscription
 * tier, and records a "purchase" `CreditTransaction` — all in one DB
 * transaction. The transaction rows are keyed deterministically by the Stripe
 * checkout session id, so retried deliveries are idempotent and can never
 * double-credit a user.
 */
export async function POST(req: Request) {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    return new NextResponse("Stripe webhook not configured", { status: 400 });
  }

  const body = await req.text();
  const signature = headers().get("stripe-signature");

  if (!signature) {
    return new NextResponse("Missing Stripe signature", { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (error) {
    console.error("Webhook signature verification failed:", error);
    return new NextResponse("Invalid signature", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    const rawPackageId = session.metadata?.packageId ?? "starter";
    const packageId: CreditPackageId = isCreditPackageId(rawPackageId)
      ? rawPackageId
      : "starter";
    const pkg = CREDIT_PACKAGES[packageId];
    const credits = Number(session.metadata?.credits || pkg.credits);

    if (!userId) {
      console.error(
        `Webhook: checkout.session.completed for session ${session.id} had no userId — skipping.`,
      );
    } else {
      const balance = await addPurchaseCredits({
        userId,
        credits,
        subscriptionTier: pkg.tier,
        description: `Stripe purchase #${session.id} — ${pkg.name} (${credits.toLocaleString()} credits)`,
        dedupeKey: session.id,
      });

      if (balance === null) {
        console.log(
          `Webhook: purchase for session ${session.id} already processed — skipping (idempotent).`,
        );
      } else {
        console.log(
          `Webhook: credited ${credits} credits to user ${userId}; new balance ${balance}.`,
        );
      }
    }
  }

  return NextResponse.json({ received: true });
}

export const dynamic = "force-dynamic";
