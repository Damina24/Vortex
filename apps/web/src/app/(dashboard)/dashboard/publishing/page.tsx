import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/auth-options";
import { Megaphone } from "lucide-react";
import PublishingClient from "@/components/publishing/publishing-client";

const PUBLISHING_ENABLED = process.env.NEXT_PUBLIC_ENABLE_PUBLISHING === "true";

export default async function PublishingPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  if (!PUBLISHING_ENABLED) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Publishing</h1>
          <p className="text-muted-foreground">
            Publish videos directly to YouTube, TikTok, and Meta.
          </p>
        </div>
        <div className="rounded-xl border border-dashed p-16 text-center">
          <Megaphone className="mx-auto h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-semibold">
            Publishing is not enabled yet
          </h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
            Set{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">
              NEXT_PUBLIC_ENABLE_PUBLISHING=true
            </code>{" "}
            in your environment to turn on direct publishing.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Publishing</h1>
        <p className="text-muted-foreground">
          Publish finished videos to your platforms and track published
          campaigns.
        </p>
      </div>
      <PublishingClient />
    </div>
  );
}
