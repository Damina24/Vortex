import prisma from "@/lib/db/prisma";

/**
 * Recomputes the total duration of a storyboard from its scenes and writes it
 * back to `Storyboard.totalDuration`. Call this whenever scenes are created,
 * updated, or deleted so the storyboard stays in sync.
 */
export async function recalculateStoryboardDuration(storyboardId: string) {
  const totalDuration = await prisma.scene.aggregate({
    where: { storyboardId },
    _sum: { duration: true },
  });

  await prisma.storyboard.update({
    where: { id: storyboardId },
    data: {
      totalDuration: totalDuration._sum.duration || 0,
    },
  });
}