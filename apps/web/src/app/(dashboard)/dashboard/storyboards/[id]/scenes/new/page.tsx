"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { SceneForm } from "@/components/scenes/scene-form";

function NewSceneContent() {
  const searchParams = useSearchParams();
  const storyboardId = searchParams.get("storyboardId") || "";

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <Link
          href={
            storyboardId
              ? `/dashboard/storyboards/${storyboardId}`
              : "/dashboard/storyboards"
          }
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          {storyboardId ? "Back to Storyboard" : "Back to Storyboards"}
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Add Scene</h1>
        <p className="text-muted-foreground">
          Define the shot details, prompt, and direction for this scene.
        </p>
      </div>

      {storyboardId ? (
        <SceneForm storyboardId={storyboardId} />
      ) : (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">
            Missing storyboard. Open a storyboard and use “Add Scene” to get started.
          </p>
          <Link
            href="/dashboard/storyboards"
            className="mt-4 inline-block text-sm font-medium text-vortex-600 hover:text-vortex-700"
          >
            Go to Storyboards
          </Link>
        </div>
      )}
    </div>
  );
}

export default function NewScenePage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-2xl mx-auto py-16 text-center text-sm text-muted-foreground">
          Loading...
        </div>
      }
    >
      <NewSceneContent />
    </Suspense>
  );
}