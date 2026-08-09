import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/db/prisma";
import { SceneForm } from "@/components/scenes/scene-form";

export default async function EditScenePage({
  params,
}: {
  params: { id: string; sceneId: string };
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  const scene = await prisma.scene.findFirst({
    where: {
      id: params.sceneId,
      storyboard: {
        id: params.id,
        project: {
          createdBy: session.user.id,
        },
      },
    },
  });

  if (!scene) {
    redirect("/dashboard/storyboards");
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <Link
          href={`/dashboard/storyboards/${params.id}/scenes`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Scenes
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Edit Scene</h1>
        <p className="text-muted-foreground">
          Update the shot details, prompt, and direction for this scene.
        </p>
      </div>

      <SceneForm
        storyboardId={params.id}
        scene={{
          id: scene.id,
          orderIndex: scene.orderIndex,
          duration: scene.duration,
          prompt: scene.prompt,
          negativePrompt: scene.negativePrompt,
          cameraDirection: scene.cameraDirection,
          aspectRatio: scene.aspectRatio,
        }}
      />
    </div>
  );
}