import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import prisma from "@/lib/db/prisma";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2024-06-20",
    })
  : null;

const creditPackages = {
  starter: { credits: 250, tier: "creator" },
  pro: { credits: 1000, tier: "creator" },
  business: { credits: 5000, tier: "team" },
} as const;

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
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    console.error("Webhook signature verification failed:", error);
    return new NextResponse("Invalid signature", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const packageId = (session.metadata?.packageId || "starter") as keyof typeof creditPackages;
    const credits = Number(session.metadata?.credits || creditPackages[packageId]?.credits || 0);
    const userId = session.metadata?.userId;

    if (userId) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          creditsBalance: { increment: credits },
          subscriptionTier: creditPackages[packageId]?.tier || "creator",
        },
      });
    }
  }

  return NextResponse.json({ received: true });
}
