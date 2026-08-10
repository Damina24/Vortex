import prisma from "@/lib/db/prisma";
import { TransactionType } from "@prisma/client";

/**
 * Credit costs for AI-powered operations. Charged to the user's
 * `creditsBalance` after a successful LLM call and recorded as "usage"
 * transactions in `credit_transactions`.
 */
export const AI_CREDIT_COSTS = {
  storyboardStrategy: 5,
  enhancePrompt: 1,
} as const;

/** Thrown when a user does not have enough credits for an operation. */
export class InsufficientCreditsError extends Error {
  balance: number;
  required: number;

  constructor(balance: number, required: number) {
    super(
      `Insufficient credits. This costs ${required} credit(s) but you only have ${balance}.`
    );
    this.name = "InsufficientCreditsError";
    this.balance = balance;
    this.required = required;
  }
}

/** Current credits balance for a user. */
export async function getCreditsBalance(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { creditsBalance: true },
  });
  if (!user) {
    throw new Error("User not found");
  }
  return user.creditsBalance;
}

/**
 * Atomically checks and spends credits for a user, recording a "usage"
 * `CreditTransaction`. Throws `InsufficientCreditsError` when the balance is
 * too low. Returns the new balance.
 */
export async function spendCredits(opts: {
  userId: string;
  amount: number;
  description: string;
}): Promise<number> {
  const { userId, amount, description } = opts;

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { creditsBalance: true },
    });
    if (!user) {
      throw new Error("User not found");
    }
    if (user.creditsBalance < amount) {
      throw new InsufficientCreditsError(user.creditsBalance, amount);
    }

    const updated = await tx.user.update({
      where: { id: userId },
      data: { creditsBalance: { decrement: amount } },
      select: { creditsBalance: true },
    });

    await tx.creditTransaction.create({
      data: {
        userId,
        amount: -amount,
        transactionType: TransactionType.usage,
        description,
      },
    });

    return updated.creditsBalance;
  });
}