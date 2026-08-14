import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth/auth-options";
import { ArrowLeft } from "lucide-react";
import { BrandDnaForm } from "@/components/brand-dna/brand-dna-form";

export default async function NewBrandDnaPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

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
          New Brand Profile
        </h1>
        <p className="text-muted-foreground">
          Define how your brand looks and sounds so every AI-generated asset
          stays on-brand.
        </p>
      </div>

      <BrandDnaForm />
    </div>
  );
}