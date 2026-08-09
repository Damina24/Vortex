import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/auth-options";

export default async function BrandDnaPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Brand DNA</h1>
        <p className="text-muted-foreground">
          Manage brand identity, voice, and compliance rules.
        </p>
      </div>
      <div className="rounded-xl border border-dashed p-16 text-center">
        <p className="text-sm text-muted-foreground">
          Brand DNA is coming soon. Define visual identity, voice tone, and compliance rules here.
        </p>
      </div>
    </div>
  );
}