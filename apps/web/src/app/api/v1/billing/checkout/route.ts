import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import { z } from "zod";
import Stripe from "stripe";

const checkoutSchema = z.object({
  packageId: z.enum(["starter", "pro", "business"]),
});

const checkoutPackages = {
  starter: { name: "Starter", price: 1900, credits: 250 },
  pro: { name: "Pro", price: 4900, credits: 1000 },
  business: { name: "Business", price: 14900, credits: 5000 },
} as const;

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2024-04-10",
    })
  : null;

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
    const pkg = checkoutPackages[packageId];
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    if (!stripe) {
      return NextResponse.json({
        success: true,
        data: {
          packageId,
          packageName: pkg.name,
          amount: pkg.price,
          credits: pkg.credits,
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
            unit_amount: pkg.price,
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
        amount: pkg.price,
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