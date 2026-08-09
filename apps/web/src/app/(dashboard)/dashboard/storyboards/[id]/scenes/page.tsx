import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/db/prisma";
import Link from "next/link";
import { ArrowLeft, Plus, Film } from "lucide-react";

export default async function StoryboardScenesPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  const storyboard = await prisma.storyboard.findFirst({
    where: {
      id: params.id,
      project: {
        createdBy: session.user.id,
      },
    },
    include: {
      project: {
        select: { id: true, name: true },
      },
      scenes: {
        orderBy: { orderIndex: "asc" },
      },
    },
  });

  if (!storyboard) {
    redirect("/dashboard/storyboards");
  }

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/dashboard/storyboards/${params.id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Storyboard
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Scenes</h1>
            <p className="text-muted-foreground">
              {storyboard.name} — {storyboard.project.name}
            </p>
          </div>
          <Link
            href={`/dashboard/storyboards/${params.id}/scenes/new`}
            className="inline-flex items-center gap-2 rounded-lg bg-vortex-600 px-4 py-2 text-sm font-medium text-white hover:bg-vortex-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Scene
          </Link>
        </div>
      </div>

      {storyboard.scenes.length > 0 ? (
        <div className="space-y-4">
          {storyboard.scenes.map((scene, index) => (
            <div
              key={scene.id}
              className="rounded-xl border p-5 hover:border-vortex-500/50 transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-vortex-100 text-vortex-700 dark:bg-vortex-950 dark:text-vortex-400 text-sm font-bold">
                  {index + 1}
                </div>
                <div>
                  <h3 className="font-semibold">Scene {index + 1}</h3>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {scene.prompt}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                <span>{scene.duration}s</span>
                <span className="capitalize">{scene.status}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed p-16 text-center">
          <Film className="mx-auto h-16 w-16 text-muted-foreground/30 mb-4" />
          <h3 className="text-xl font-semibold mb-2">No scenes yet</h3>
          <p className="text-sm text-muted-foreground mb-8 max-w-md mx-auto">
            Add your first scene to start defining the story flow and video prompts.
          </p>
          <Link
            href={`/dashboard/storyboards/${params.id}/scenes/new`}
            className="inline-flex items-center gap-2 rounded-lg bg-vortex-600 px-6 py-3 text-sm font-medium text-white hover:bg-vortex-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add First Scene
          </Link>
        </div>
      )}
    </div>
  );
}