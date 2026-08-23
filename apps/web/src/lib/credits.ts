import { createHash } from "crypto";
import prisma from "@/lib/db/prisma";
import { Prisma, TransactionType, type SubscriptionTier } from "@prisma/client";

/**
 * Credit costs for AI-powered operations. Charged to the user's
 * `creditsBalance` after a successful LLM call and recorded as "usage"
 * transactions in `credit_transactions`.
 */
export const AI_CREDIT_COSTS = {
  storyboardStrategy: 5,
  enhancePrompt: 1,
  /** Cost per video render via the generation pipeline. */
  videoGeneration: 10,
  /** Cost per voiceover generation via the generation pipeline. */
  voiceover: 5,
  /** Cost per background music track generated via the pipeline. */
  music: 8,
  /** Cost per image generation via the generation pipeline. */
  imageGeneration: 1,
} as const;

/** Thrown when a user does not have enough credits for an operation. */
export class InsufficientCreditsError extends Error {
  balance: number;
  required: number;

  constructor(balance: number, required: number) {
    super(
      `Insufficient credits. This costs ${required} credit(s) but you only have ${balance}.`,
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

/** RFC 4122 namespace used to derive deterministic purchase transaction ids. */
const CREDIT_TX_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8"; // DNS

/**
 * Deterministic UUID v5 (SHA-1). Credit purchase transactions use an id
 * derived from the Stripe checkout session so that duplicate webhook
 * deliveries collide on the `credit_transactions` primary key instead of
 * crediting a user twice.
 */
function uuidv5(name: string, namespace: string = CREDIT_TX_NAMESPACE): string {
  const ns = Buffer.from(namespace.replaceAll("-", ""), "hex");
  const digest = createHash("sha1")
    .update(ns)
    .update(Buffer.from(name, "utf8"))
    .digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20,
  )}-${hex.slice(20, 32)}`;
}

/**
 * Add purchased credits to a user's balance and record a "purchase"
 * `CreditTransaction` in the same DB transaction.
 *
 * When `dedupeKey` is supplied (e.g. a Stripe checkout session id), the
 * transaction primary key is derived deterministically from it, so a
 * duplicate webhook delivery fails with a unique-constraint error (P2002) and
 * is treated as already-processed instead of crediting twice.
 *
 * Returns the new balance, or `null` if the purchase was already recorded.
 */
export async function addPurchaseCredits(opts: {
  userId: string;
  credits: number;
  subscriptionTier: SubscriptionTier;
  description: string;
  dedupeKey?: string;
}): Promise<number | null> {
  const { userId, credits, subscriptionTier, description, dedupeKey } = opts;

  if (credits <= 0) {
    throw new Error("credits must be a positive number");
  }

  const id = dedupeKey ? uuidv5(`purchase:${userId}:${dedupeKey}`) : undefined;

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.creditTransaction.create({
        data: {
          id,
          userId,
          amount: credits,
          transactionType: TransactionType.purchase,
          description,
        },
      });

      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          creditsBalance: { increment: credits },
          subscriptionTier,
        },
        select: { creditsBalance: true },
      });

      return updated.creditsBalance;
    });
  } catch (error) {
    // Unique constraint on the deterministic id => already processed.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return null;
    }
    throw error;
  }
}
