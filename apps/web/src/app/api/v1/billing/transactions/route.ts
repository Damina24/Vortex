import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/db/prisma";

/**
 * Returns the authenticated user's most recent credit transactions (purchases,
 * usage, bonuses, refunds) newest first, for the ledger shown on the credits
 * page.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const transactions = await prisma.creditTransaction.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        amount: true,
        transactionType: true,
        description: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ success: true, data: transactions });
  } catch (error) {
    console.error("Error fetching credit transactions:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";