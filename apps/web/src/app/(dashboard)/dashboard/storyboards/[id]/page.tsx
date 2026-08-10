import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/db/prisma";
import { ArrowLeft, Plus, Film } from "lucide-react";
import { StoryboardAiPanel } from "@/components/ai/storyboard-ai-panel";
import type { AiStoryboardStrategy } from "@/types";

export default async function StoryboardDetailPage({
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
      _count: {
        select: { scenes: true },
      },
    },
  });

  if (!storyboard) {
    redirect("/dashboard/storyboards");
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <Link
          href="/dashboard/storyboards"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Storyboards
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {storyboard.name}
            </h1>
            <p className="text-muted-foreground">
              {storyboard.project.name}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={`/dashboard/storyboards/${params.id}/scenes`}
              className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium text-muted-foreground hover:border-vortex-500/50 hover:text-foreground transition-colors"
            >
              <Film className="h-4 w-4" />
              Manage Scenes
            </Link>
            <Link
              href={`/dashboard/storyboards/${params.id}/scenes/new`}
              className="inline-flex items-center gap-2 rounded-lg bg-vortex-600 px-4 py-2 text-sm font-medium text-white hover:bg-vortex-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add Scene
            </Link>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-6 sm:grid-cols-3">
        <div className="rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">Total Scenes</p>
          <p className="text-2xl font-bold mt-1">
            {storyboard._count.scenes}
          </p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">Duration</p>
          <p className="text-2xl font-bold mt-1">
            {Math.floor(storyboard.totalDuration / 60)}:
            {(storyboard.totalDuration % 60).toString().padStart(2, "0")}
          </p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">Status</p>
          <p className="text-lg font-bold mt-1 capitalize">
            {storyboard.status}
          </p>
        </div>
      </div>

      {/* AI Strategy */}
      <StoryboardAiPanel
        storyboardId={storyboard.id}
        startIndex={
          storyboard.scenes.reduce(
            (max, scene) => Math.max(max, scene.orderIndex),
            -1
          ) + 1
        }
        initialStrategy={storyboard.aiStrategy as AiStoryboardStrategy | null}
      />

      {/* Scenes */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Scenes</h2>
        {storyboard.scenes.length > 0 ? (
          <div className="space-y-4">
            {storyboard.scenes.map((scene, index) => (
              <div
                key={scene.id}
                className="rounded-xl border p-5 hover:border-vortex-500/50 transition-all"
              >
                <div className="flex items-start justify-between">
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
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {scene.duration}s
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed p-10 text-center">
            <Film className="mx-auto h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground mb-4">
              No scenes yet. Add your first scene to start building the story.
            </p>
            <Link
              href={`/dashboard/storyboards/${params.id}/scenes/new`}
              className="inline-flex items-center gap-2 rounded-lg bg-vortex-600 px-4 py-2 text-sm font-medium text-white hover:bg-vortex-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add First Scene
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}