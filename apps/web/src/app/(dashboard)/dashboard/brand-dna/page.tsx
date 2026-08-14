import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/db/prisma";
import { Plus, Palette } from "lucide-react";
import { brandDnaToPayload } from "@/lib/brand-dna";
import { BrandDnaCardActions } from "@/components/brand-dna/brand-dna-card-actions";

const INDUSTRY_LABELS: Record<string, string> = {
  general: "General",
  health: "Health",
  finance: "Finance",
  alcohol: "Alcohol",
};

function ColorSwatches({ colors }: { colors: string[] }) {
  const visible = colors.slice(0, 5);
  return (
    <div className="flex items-center gap-1.5">
      {visible.map((color) => (
        <span
          key={color}
          title={color}
          className="h-5 w-5 rounded-full border"
          style={{ backgroundColor: color }}
        />
      ))}
      {colors.length > 5 ? (
        <span className="text-xs text-muted-foreground">
          +{colors.length - 5}
        </span>
      ) : colors.length === 0 ? (
        <span className="text-xs text-muted-foreground">No colors set</span>
      ) : null}
    </div>
  );
}

export default async function BrandDnaPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  const membership = await prisma.teamMember.findFirst({
    where: { userId: session.user.id },
    select: { teamId: true },
  });

  const brandDnas = membership
    ? await prisma.brandDna.findMany({
        where: { teamId: membership.teamId },
        orderBy: { updatedAt: "desc" },
        include: { _count: { select: { projects: true } } },
      })
    : [];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Brand DNA</h1>
          <p className="text-muted-foreground">
            Manage brand identity, voice, and compliance rules that guide every
            generated asset.
          </p>
        </div>
        <Link
          href="/dashboard/brand-dna/new"
          className="inline-flex items-center gap-2 rounded-lg bg-vortex-600 px-4 py-2 text-sm font-medium text-white hover:bg-vortex-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Brand Profile
        </Link>
      </div>

      {brandDnas.length > 0 ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {brandDnas.map((brandDna) => {
            const payload = brandDnaToPayload(brandDna);
            return (
              <div
                key={brandDna.id}
                className="group rounded-xl border p-6 hover:border-vortex-500/50 transition-all hover:shadow-md"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-vortex-100 text-vortex-600 dark:bg-vortex-950 dark:text-vortex-400">
                    <Palette className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold group-hover:text-vortex-600 transition-colors">
                      {payload.name}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {INDUSTRY_LABELS[payload.compliance.industry] ?? "General"}
                      {" · "}
                      {brandDna._count.projects} project
                      {brandDna._count.projects === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground">Colors</span>
                    <ColorSwatches colors={payload.colors.primary} />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground">Voice</span>
                    <span className="truncate font-medium">
                      {payload.voice.adjectives.length > 0
                        ? payload.voice.adjectives.slice(0, 3).join(", ")
                        : "Not set"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground">
                      Disclaimers
                    </span>
                    <span className="font-medium">
                      {payload.compliance.requiredDisclaimers.length}
                    </span>
                  </div>
                </div>

                <div className="mt-5 border-t pt-4">
                  <BrandDnaCardActions id={brandDna.id} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed p-16 text-center">
          <Palette className="mx-auto h-16 w-16 text-muted-foreground/30 mb-4" />
          <h3 className="text-xl font-semibold mb-2">
            No brand profiles yet
          </h3>
          <p className="text-sm text-muted-foreground mb-8 max-w-md mx-auto">
            Define your visual identity, voice, and compliance rules once, then
            let AI keep every video on-brand.
          </p>
          <Link
            href="/dashboard/brand-dna/new"
            className="inline-flex items-center gap-2 rounded-lg bg-vortex-600 px-6 py-3 text-sm font-medium text-white hover:bg-vortex-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create Your First Brand Profile
          </Link>
        </div>
      )}
    </div>
  );
}