import { describe, expect, it } from "vitest";
import {
  CREDIT_PACKAGES,
  CREDIT_PACKAGE_IDS,
  CREDIT_PACKAGE_LIST,
  isCreditPackageId,
} from "./packages";

const VALID_TIERS = ["free", "creator", "pro", "team", "enterprise"] as const;

describe("CREDIT_PACKAGES", () => {
  it("declares exactly the ids in CREDIT_PACKAGE_IDS", () => {
    expect(CREDIT_PACKAGE_IDS).toEqual(["starter", "pro", "business"]);
    expect(Object.keys(CREDIT_PACKAGES)).toEqual([...CREDIT_PACKAGE_IDS]);
  });

  it("keeps CREDIT_PACKAGE_LIST in the declared order", () => {
    expect(CREDIT_PACKAGE_LIST.map((pkg) => pkg.id)).toEqual([
      ...CREDIT_PACKAGE_IDS,
    ]);
  });

  it("keeps each package id equal to its record key", () => {
    for (const [id, pkg] of Object.entries(CREDIT_PACKAGES)) {
      expect(pkg.id).toBe(id);
    }
  });

  it("keeps display price and Stripe unit amount consistent", () => {
    for (const pkg of CREDIT_PACKAGE_LIST) {
      expect(pkg.unitAmount).toBe(pkg.price * 100);
      expect(pkg.price).toBeGreaterThan(0);
      expect(pkg.credits).toBeGreaterThan(0);
    }
  });

  it("declares valid subscription tiers for every package", () => {
    for (const pkg of CREDIT_PACKAGE_LIST) {
      expect(VALID_TIERS).toContain(pkg.tier);
    }
  });

  it("marks exactly one package as highlighted (Pro)", () => {
    const highlighted = CREDIT_PACKAGE_LIST.filter((pkg) => pkg.highlight);
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0]?.id).toBe("pro");
  });

  it("uses unique package names", () => {
    const names = CREDIT_PACKAGE_LIST.map((pkg) => pkg.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("isCreditPackageId", () => {
  it("accepts every valid id", () => {
    for (const id of CREDIT_PACKAGE_IDS) {
      expect(isCreditPackageId(id)).toBe(true);
    }
  });

  it("rejects unknown, empty and whitespace-padded ids", () => {
    expect(isCreditPackageId("enterprise")).toBe(false);
    expect(isCreditPackageId("")).toBe(false);
    expect(isCreditPackageId("starter ")).toBe(false);
    expect(isCreditPackageId("prox")).toBe(false);
  });
});
