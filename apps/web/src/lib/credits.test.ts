import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma, TransactionType } from "@prisma/client";

interface UserFindArgs {
  where: { id: string };
}

interface UserUpdateArgs {
  where: { id: string };
  data: {
    creditsBalance?: { increment?: number; decrement?: number };
    subscriptionTier?: string;
  };
}

interface TxCreateArgs {
  data: {
    id?: string;
    userId: string;
    amount: number;
    transactionType: string;
    description: string;
  };
}

type CreditTxRow = TxCreateArgs["data"];

/**
 * In-memory fake of `@/lib/db/prisma` that mirrors the interactive-transaction
 * surface used by `credits.ts` (`user.findUnique/update`,
 * `creditTransaction.create`, `$transaction`). A failure can be injected via
 * `setCreateError` to simulate a duplicate Stripe webhook (P2002).
 */
const db = vi.hoisted(() => {
  const balances = new Map<string, number>();
  const txRows: CreditTxRow[] = [];
  let createError: unknown = null;

  const user = {
    findUnique: vi.fn(async ({ where }: UserFindArgs) => {
      const balance = balances.get(where.id);
      return balance === undefined ? null : { creditsBalance: balance };
    }),
    update: vi.fn(async ({ where, data }: UserUpdateArgs) => {
      const current = balances.get(where.id);
      if (current === undefined) {
        throw new Error("User not found");
      }
      const delta =
        (data.creditsBalance?.increment ?? 0) -
        (data.creditsBalance?.decrement ?? 0);
      const next = current + delta;
      balances.set(where.id, next);
      return { creditsBalance: next };
    }),
  };

  const creditTransaction = {
    create: vi.fn(async ({ data }: TxCreateArgs) => {
      txRows.push(data);
      if (createError) {
        const error = createError;
        createError = null;
        throw error;
      }
      return { id: data.id };
    }),
  };

  const newTransactionClient = () => ({ user, creditTransaction });

  return {
    balances,
    txRows,
    user,
    creditTransaction,
    setCreateError(error: unknown) {
      createError = error;
    },
    prisma: {
      user,
      creditTransaction,
      $transaction: vi.fn(
        async (
          fn: (client: {
            user: typeof user;
            creditTransaction: typeof creditTransaction;
          }) => Promise<unknown>,
        ) => fn(newTransactionClient()),
      ),
    },
  };
});

vi.mock("@/lib/db/prisma", () => ({
  default: db.prisma,
  prisma: db.prisma,
}));

import {
  AI_CREDIT_COSTS,
  InsufficientCreditsError,
  addPurchaseCredits,
  getCreditsBalance,
  spendCredits,
} from "./credits";

const userId = "user-1";

beforeEach(() => {
  vi.clearAllMocks();
  db.balances.clear();
  db.txRows.length = 0;
});

describe("AI_CREDIT_COSTS", () => {
  it("matches the documented pricing", () => {
    expect(AI_CREDIT_COSTS.storyboardStrategy).toBe(5);
    expect(AI_CREDIT_COSTS.enhancePrompt).toBe(1);
    expect(AI_CREDIT_COSTS.videoGeneration).toBe(10);
    expect(AI_CREDIT_COSTS.voiceover).toBe(5);
    expect(AI_CREDIT_COSTS.music).toBe(8);
  });
});

describe("getCreditsBalance", () => {
  it("returns the current balance", async () => {
    db.balances.set(userId, 100);
    await expect(getCreditsBalance(userId)).resolves.toBe(100);
  });

  it("throws when the user does not exist", async () => {
    await expect(getCreditsBalance(userId)).rejects.toThrow("User not found");
  });
});

describe("spendCredits", () => {
  it("decrements the balance and records a usage transaction", async () => {
    db.balances.set(userId, 10);

    const newBalance = await spendCredits({
      userId,
      amount: 4,
      description: "Storyboard strategy",
    });

    expect(newBalance).toBe(6);
    expect(db.balances.get(userId)).toBe(6);
    expect(db.txRows).toEqual([
      expect.objectContaining({
        userId,
        amount: -4,
        transactionType: TransactionType.usage,
        description: "Storyboard strategy",
      }),
    ]);
  });

  it("throws InsufficientCreditsError and leaves balance and ledger untouched", async () => {
    db.balances.set(userId, 2);

    const error = await spendCredits({
      userId,
      amount: 5,
      description: "Enhance prompt",
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(InsufficientCreditsError);
    expect((error as InsufficientCreditsError).balance).toBe(2);
    expect((error as InsufficientCreditsError).required).toBe(5);
    expect(db.balances.get(userId)).toBe(2);
    expect(db.txRows).toHaveLength(0);
  });

  it("throws when the user does not exist", async () => {
    await expect(
      spendCredits({ userId, amount: 1, description: "x" }),
    ).rejects.toThrow("User not found");
  });
  describe("addPurchaseCredits", () => {
    it("increments the balance, bumps the tier, and records a purchase", async () => {
      db.balances.set(userId, 0);

      const balance = await addPurchaseCredits({
        userId,
        credits: 1000,
        subscriptionTier: "creator",
        description: "Demo purchase — Pro",
      });

      expect(balance).toBe(1000);
      expect(db.balances.get(userId)).toBe(1000);
      expect(db.txRows).toEqual([
        expect.objectContaining({
          userId,
          amount: 1000,
          transactionType: TransactionType.purchase,
        }),
      ]);
    });

    it("rejects non-positive credit amounts", async () => {
      await expect(
        addPurchaseCredits({
          userId,
          credits: 0,
          subscriptionTier: "creator",
          description: "x",
        }),
      ).rejects.toThrow("credits must be a positive number");
    });

    it("derives a deterministic UUIDv5 id from the dedupe key", async () => {
      db.balances.set(userId, 0);

      await addPurchaseCredits({
        userId,
        credits: 250,
        subscriptionTier: "creator",
        description: "a",
        dedupeKey: "cs_test_123",
      });
      await addPurchaseCredits({
        userId,
        credits: 250,
        subscriptionTier: "creator",
        description: "b",
        dedupeKey: "cs_test_123",
      });

      expect(db.txRows).toHaveLength(2);
      const [first, second] = db.txRows;
      expect(first.id).toBeDefined();
      expect(first.id).toBe(second.id);
      expect(first.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    });

    it("returns null on a duplicate webhook delivery (P2002) without double crediting", async () => {
      db.balances.set(userId, 0);
      db.setCreateError(
        new Prisma.PrismaClientKnownRequestError(
          "Unique constraint failed on the fields: (`id`)",
          { code: "P2002", clientVersion: "5.22.0", meta: { target: ["id"] } },
        ),
      );

      const balance = await addPurchaseCredits({
        userId,
        credits: 100,
        subscriptionTier: "creator",
        description: "duplicate",
        dedupeKey: "cs_test_dup",
      });

      expect(balance).toBeNull();
      expect(db.balances.get(userId)).toBe(0);
    });

    it("rethrows errors that are not unique-constraint violations", async () => {
      db.setCreateError(new Error("db is down"));

      await expect(
        addPurchaseCredits({
          userId,
          credits: 100,
          subscriptionTier: "creator",
          description: "x",
          dedupeKey: "cs_test_err",
        }),
      ).rejects.toThrow("db is down");
      expect(db.balances.get(userId)).toBeUndefined();
    });
  });
});
