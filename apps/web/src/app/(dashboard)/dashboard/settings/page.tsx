import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/auth-options";

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Account, billing, and workspace preferences.
        </p>
      </div>
      <div className="rounded-xl border border-dashed p-16 text-center">
        <p className="text-sm text-muted-foreground">
          Settings is coming soon. Manage account details, notifications, and integrations.
        </p>
      </div>
    </div>
  );
}