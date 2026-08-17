import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/db/prisma";
import { AI_CREDIT_COSTS } from "@/lib/credits";
import { AudioLines } from "lucide-react";
import {
  AudioSuite,
  type AudioAssetRef,
} from "@/components/audio/audio-suite";

export const dynamic = "force-dynamic";

export default async function AudioPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const [projects, assets] = await Promise.all([
    prisma.project.findMany({
      where: {
        createdBy: session.user.id,
        status: { not: "archived" },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true },
    }),
    prisma.asset.findMany({
      where: {
        project: {
          createdBy: session.user.id,
          status: { not: "archived" },
        },
        type: "audio",
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        url: true,
        mimeType: true,
        duration: true,
        createdAt: true,
        project: { select: { name: true } },
      },
    }),
  ]);

  // Reduce to RSC-serializable fields (no BigInt like `sizeBytes`).
  const audioAssets: AudioAssetRef[] = assets.map((a) => ({
    id: a.id,
    name: a.name,
    url: a.url,
    mimeType: a.mimeType,
    duration: a.duration,
    createdAt: a.createdAt.toISOString(),
    projectName: a.project?.name ?? "Unknown project",
  }));

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-vortex-100 text-vortex-700 dark:bg-vortex-950 dark:text-vortex-400">
          <AudioLines className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Audio Suite</h1>
          <p className="text-muted-foreground">
            Generate AI voiceovers and background music for your projects.
          </p>
        </div>
      </div>

      <AudioSuite
        projects={projects}
        audioAssets={audioAssets}
        creditCosts={{
          voiceover: AI_CREDIT_COSTS.voiceover,
          music: AI_CREDIT_COSTS.music,
        }}
      />
    </div>
  );
}