import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import { z } from "zod";
import Stripe from "stripe";
import { CREDIT_PACKAGES } from "@/lib/billing/packages";
import { addPurchaseCredits } from "@/lib/credits";

const checkoutSchema = z.object({
  packageId: z.enum(["starter", "pro", "business"]),
});

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2024-04-10",
    })
  : null;

/**
 * Starts the credit purchase flow. When Stripe is configured, creates a real
 * Checkout Session and returns its URL; the credits are granted by the webhook
 * when payment completes.
 *
 * When Stripe is NOT configured (local development / demo), completes the
 * purchase immediately using the same `addPurchaseCredits` helper the webhook
 * uses, so the demo flow works end-to-end without payment keys.
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => null);
    const validation = checkoutSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: "Please select a valid package" },
        { status: 400 }
      );
    }

    const packageId = validation.data.packageId;
    const pkg = CREDIT_PACKAGES[packageId];
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    if (!stripe) {
      // Demo mode: grant instantly, mirroring what the webhook would do.
      const creditsBalance = await addPurchaseCredits({
        userId: session.user.id,
        credits: pkg.credits,
        subscriptionTier: pkg.tier,
        description: `Demo purchase — ${pkg.name} (${pkg.credits.toLocaleString()} credits)`,
      });

      return NextResponse.json({
        success: true,
        data: {
          packageId,
          packageName: pkg.name,
          amount: pkg.unitAmount,
          credits: pkg.credits,
          creditsBalance,
          checkoutUrl: `${appUrl}/dashboard/credits?checkout=success&package=${packageId}`,
        },
      });
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: session.user.email ?? undefined,
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: pkg.unitAmount,
            product_data: {
              name: `VORTEX AI credits — ${pkg.name}`,
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/dashboard/credits?checkout=success&package=${packageId}`,
      cancel_url: `${appUrl}/dashboard/credits?checkout=cancelled`,
      metadata: {
        packageId,
        userId: session.user.id,
        credits: pkg.credits.toString(),
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        packageId,
        packageName: pkg.name,
        amount: pkg.unitAmount,
        credits: pkg.credits,
        checkoutUrl: checkoutSession.url,
      },
    });
  } catch (error) {
    console.error("Checkout init failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Unable to initialize checkout",
      },
      {
        status: 500,
      }
    );
  }
}

export const dynamic = "force-dynamic";