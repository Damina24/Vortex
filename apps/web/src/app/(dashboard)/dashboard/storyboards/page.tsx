import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/db/prisma";
import { Plus, Film, ArrowRight } from "lucide-react";

export default async function StoryboardsPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  const storyboards = await prisma.storyboard.findMany({
    where: {
      project: {
        createdBy: session.user.id,
      },
    },
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { scenes: true },
      },
      project: {
        select: { id: true, name: true },
      },
    },
  });

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Storyboards</h1>
          <p className="text-muted-foreground">
            Manage your video storyboards and scenes
          </p>
        </div>
        <Link
          href="/dashboard/storyboards/new"
          className="inline-flex items-center gap-2 rounded-lg bg-vortex-600 px-4 py-2 text-sm font-medium text-white hover:bg-vortex-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Storyboard
        </Link>
      </div>

      {storyboards.length > 0 ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {storyboards.map((storyboard) => (
            <Link
              key={storyboard.id}
              href={`/dashboard/storyboards/${storyboard.id}`}
              className="group rounded-xl border p-6 hover:border-vortex-500/50 transition-all hover:shadow-md"
            >
              <div className="flex items-center gap-3 mb-3">
                <Film className="h-5 w-5 text-vortex-500" />
                <h3 className="font-semibold group-hover:text-vortex-600 transition-colors">
                  {storyboard.name}
                </h3>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                {storyboard.project.name}
              </p>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{storyboard._count.scenes} scene(s)</span>
                <span>
                  {new Date(storyboard.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed p-16 text-center">
          <Film className="mx-auto h-16 w-16 text-muted-foreground/30 mb-4" />
          <h3 className="text-xl font-semibold mb-2">No storyboards yet</h3>
          <p className="text-sm text-muted-foreground mb-8 max-w-md mx-auto">
            Create your first storyboard to start planning your video campaign scenes.
          </p>
          <Link
            href="/dashboard/storyboards/new"
            className="inline-flex items-center gap-2 rounded-lg bg-vortex-600 px-6 py-3 text-sm font-medium text-white hover:bg-vortex-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create Your First Storyboard
          </Link>
        </div>
      )}
    </div>
  );
}