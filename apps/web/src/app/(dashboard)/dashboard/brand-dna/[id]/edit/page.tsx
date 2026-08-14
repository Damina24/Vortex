import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/db/prisma";
import { ArrowLeft } from "lucide-react";
import { brandDnaToPayload } from "@/lib/brand-dna";
import { BrandDnaForm } from "@/components/brand-dna/brand-dna-form";

export default async function EditBrandDnaPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  const membership = await prisma.teamMember.findFirst({
    where: { userId: session.user.id },
    select: { teamId: true },
  });

  const brandDna = membership
    ? await prisma.brandDna.findFirst({
        where: { id: params.id, teamId: membership.teamId },
      })
    : null;

  if (!brandDna) {
    notFound();
  }

  const payload = brandDnaToPayload(brandDna);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <Link
          href="/dashboard/brand-dna"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Brand DNA
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">
          Edit {payload.name}
        </h1>
        <p className="text-muted-foreground">
          Update your brand profile. Changes apply to new AI-generated assets.
        </p>
      </div>

      <BrandDnaForm brandDnaId={brandDna.id} initialData={payload} />
    </div>
  );
}