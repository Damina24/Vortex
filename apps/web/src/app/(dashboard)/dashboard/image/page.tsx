import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/db/prisma";
import { AI_CREDIT_COSTS } from "@/lib/credits";
import { ImageIcon } from "lucide-react";
import { getImageProviderAvailability } from "@/lib/generation/image-providers";
import { ImageSuite, type ImageAssetRef } from "@/components/image/image-suite";

export const dynamic = "force-dynamic";

export default async function ImagePage() {
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
        type: "image",
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        url: true,
        mimeType: true,
        width: true,
        height: true,
        createdAt: true,
        project: { select: { name: true } },
      },
    }),
  ]);

  // Reduce to RSC-serializable fields (no BigInt like `sizeBytes`).
  const imageAssets: ImageAssetRef[] = assets.map((a) => ({
    id: a.id,
    name: a.name,
    url: a.url,
    mimeType: a.mimeType,
    width: a.width,
    height: a.height,
    createdAt: a.createdAt.toISOString(),
    projectName: a.project?.name ?? "Unknown project",
  }));

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-vortex-100 text-vortex-700 dark:bg-vortex-950 dark:text-vortex-400">
          <ImageIcon className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Image Suite</h1>
          <p className="text-muted-foreground">
            Generate AI images for your projects.
          </p>
        </div>
      </div>

      <ImageSuite
        projects={projects}
        imageAssets={imageAssets}
        creditCosts={{ imageGeneration: AI_CREDIT_COSTS.imageGeneration }}
        defaultProvider={process.env.IMAGE_PROVIDER ?? "mock"}
        providerOptions={getImageProviderAvailability()}
      />
    </div>
  );
}