import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/db/prisma";
import { z } from "zod";

const purchaseCreditsSchema = z.object({
  packageId: z.enum(["starter", "pro", "business"]),
});

const creditPackages = {
  starter: {
    name: "Starter",
    credits: 250,
    price: 19,
    description: "Perfect for your first campaign",
  },
  pro: {
    name: "Pro",
    credits: 1000,
    price: 49,
    description: "Best for regular content creation",
  },
  business: {
    name: "Business",
    credits: 5000,
    price: 149,
    description: "For agencies and high-volume launches",
  },
} as const;

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
    const validation = purchaseCreditsSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: "Please select a valid credit package" },
        { status: 400 }
      );
    }

    const packageId = validation.data.packageId;
    const pkg = creditPackages[packageId];

    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        creditsBalance: {
          increment: pkg.credits,
        },
        subscriptionTier: packageId === "business" ? "team" : "creator",
      },
      select: {
        creditsBalance: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        packageId,
        creditsPurchased: pkg.credits,
        price: pkg.price,
        creditsBalance: updatedUser.creditsBalance,
      },
    });
  } catch (error) {
    console.error("Credit purchase failed:", error);
    return NextResponse.json(
      { success: false, error: "Unable to complete purchase right now" },
      { status: 500 }
    );
  }
}
