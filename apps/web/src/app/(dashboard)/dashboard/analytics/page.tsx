import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/auth-options";

export default async function AnalyticsPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground">
          Campaign performance, engagement, and optimization insights.
        </p>
      </div>
      <div className="rounded-xl border border-dashed p-16 text-center">
        <p className="text-sm text-muted-foreground">
          Analytics is coming soon. This will surface campaign metrics and A/B test performance.
        </p>
      </div>
    </div>
  );
}