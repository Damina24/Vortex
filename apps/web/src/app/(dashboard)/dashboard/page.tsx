import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/db/prisma";
import Link from "next/link";
import {
  FolderKanban,
  Plus,
  ArrowRight,
  Sparkles,
  Film,
  BarChart3,
} from "lucide-react";
import { AnimatedStats } from "@/components/dashboard/animated-stats";

async function getDashboardStats(userId: string) {
  const [
    projectCount,
    storyboardCount,
    assetCount,
    recentProjects,
  ] = await Promise.all([
    prisma.project.count({
      where: {
        createdBy: userId,
        status: { not: "archived" },
      },
    }),
    prisma.storyboard.count({
      where: {
        project: { createdBy: userId },
      },
    }),
    prisma.asset.count({
      where: { createdBy: userId },
    }),
    prisma.project.findMany({
      where: { createdBy: userId },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        storyboards: {
          take: 1,
          orderBy: { createdAt: "desc" },
        },
      },
    }),
  ]);

  return {
    projectCount,
    storyboardCount,
    assetCount,
    recentProjects: recentProjects.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      objective: p.objective,
      createdAt: p.createdAt,
      storyboardCount: p.storyboards.length,
    })),
  };
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  const stats = await getDashboardStats(session.user.id);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of your video campaigns
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/credits"
            className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            <Sparkles className="h-4 w-4" />
            Buy Credits
          </Link>
          <Link
            href="/dashboard/projects/new"
            className="inline-flex items-center gap-2 rounded-lg bg-vortex-600 px-4 py-2 text-sm font-medium text-white hover:bg-vortex-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Project
          </Link>
        </div>
      </div>

      {/* Animated Stats Grid */}
      <AnimatedStats
        projectCount={stats.projectCount}
        storyboardCount={stats.storyboardCount}
        assetCount={stats.assetCount}
        creditsBalance={session.user.creditsBalance}
      />

      {stats.projectCount === 0 && (
        <div className="rounded-2xl border border-vortex-200 bg-vortex-50 p-6 dark:border-vortex-900/60 dark:bg-vortex-950/30">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-vortex-600">
                Launch guide
              </p>
              <h2 className="mt-1 text-xl font-semibold">
                Start your first campaign in minutes
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Create your first project, then use credits to generate storyboards and assets without waiting for a manual handoff.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/dashboard/projects/new"
                className="inline-flex items-center gap-2 rounded-lg bg-vortex-600 px-4 py-2 text-sm font-medium text-white hover:bg-vortex-700"
              >
                <Plus className="h-4 w-4" />
                Create First Project
              </Link>
              <Link
                href="/dashboard/credits"
                className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-background"
              >
                <Sparkles className="h-4 w-4" />
                Buy Credits
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Recent Projects */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Recent Projects</h2>
          <Link
            href="/dashboard/projects"
            className="text-sm text-vortex-600 hover:text-vortex-500 inline-flex items-center gap-1"
          >
            View all
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        {stats.recentProjects.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {stats.recentProjects.map((project) => (
              <Link
                key={project.id}
                href={`/dashboard/projects/${project.id}`}
                className="group rounded-xl border p-5 hover:border-vortex-500/50 transition-all hover:shadow-md"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold group-hover:text-vortex-600 transition-colors">
                    {project.name}
                  </h3>
                  <StatusBadge status={project.status} />
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  {project.objective
                    ? `${project.objective.charAt(0).toUpperCase() + project.objective.slice(1)} campaign`
                    : "No objective set"}
                </p>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{project.storyboardCount} storyboard(s)</span>
                  <span>
                    {new Date(project.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed p-12 text-center">
            <FolderKanban className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No projects yet</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Create your first project to start generating video campaigns
            </p>
            <Link
              href="/dashboard/projects/new"
              className="inline-flex items-center gap-2 rounded-lg bg-vortex-600 px-4 py-2 text-sm font-medium text-white hover:bg-vortex-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Create Project
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    active: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    paused: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
    completed: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    archived: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] || colors.draft}`}
    >
      {status}
    </span>
  );
}