import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/db/prisma";
import { ArrowLeft, Plus, Film, BarChart3, Settings } from "lucide-react";

export default async function ProjectDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  const project = await prisma.project.findFirst({
    where: {
      id: params.id,
      createdBy: session.user.id,
    },
    include: {
      storyboards: {
        orderBy: { createdAt: "desc" },
        include: {
          _count: {
            select: { scenes: true },
          },
        },
      },
      brandDna: true,
      campaigns: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
      _count: {
        select: {
          assets: true,
          storyboards: true,
          campaigns: true,
        },
      },
    },
  });

  if (!project) {
    redirect("/dashboard/projects");
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <Link
          href="/dashboard/projects"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Projects
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {project.name}
            </h1>
            <p className="text-muted-foreground">
              {project.description || "No description"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={project.status} />
            <Link
              href={`/dashboard/projects/${params.id}/settings`}
              className="rounded-lg border p-2 text-muted-foreground hover:bg-muted transition-colors"
            >
              <Settings className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-6 sm:grid-cols-4">
        <div className="rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">Storyboards</p>
          <p className="text-2xl font-bold mt-1">
            {project._count.storyboards}
          </p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">Assets</p>
          <p className="text-2xl font-bold mt-1">{project._count.assets}</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">Campaigns</p>
          <p className="text-2xl font-bold mt-1">
            {project._count.campaigns}
          </p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">Objective</p>
          <p className="text-lg font-bold mt-1 capitalize">
            {project.objective || "Not set"}
          </p>
        </div>
      </div>

      {/* Storyboards */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Storyboards</h2>
          <Link
            href={`/dashboard/storyboards/new?projectId=${params.id}`}
            className="inline-flex items-center gap-2 rounded-lg bg-vortex-600 px-4 py-2 text-sm font-medium text-white hover:bg-vortex-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Storyboard
          </Link>
        </div>

        {project.storyboards.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {project.storyboards.map((storyboard) => (
              <Link
                key={storyboard.id}
                href={`/dashboard/storyboards/${storyboard.id}`}
                className="group rounded-xl border p-5 hover:border-vortex-500/50 transition-all hover:shadow-md"
              >
                <div className="flex items-center gap-3 mb-3">
                  <Film className="h-5 w-5 text-vortex-500" />
                  <h3 className="font-semibold group-hover:text-vortex-600 transition-colors">
                    {storyboard.name}
                  </h3>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{storyboard._count.scenes} scene(s)</span>
                  <span>
                    {new Date(storyboard.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed p-10 text-center">
            <Film className="mx-auto h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground mb-4">
              No storyboards yet. Create your first one.
            </p>
            <Link
              href={`/dashboard/storyboards/new?projectId=${params.id}`}
              className="inline-flex items-center gap-2 rounded-lg bg-vortex-600 px-4 py-2 text-sm font-medium text-white hover:bg-vortex-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Create Storyboard
            </Link>
          </div>
        )}
      </div>

      {/* Brand DNA */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Brand DNA</h2>
        {project.brandDna ? (
          <div className="rounded-xl border p-5">
            <p className="font-medium">{project.brandDna.name}</p>
            <p className="text-sm text-muted-foreground mt-1">
              Brand guidelines applied to this project
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground mb-3">
              No brand DNA assigned to this project
            </p>
            <Link
              href={`/dashboard/brand-dna/new?projectId=${params.id}`}
              className="text-sm text-vortex-600 hover:text-vortex-500 font-medium"
            >
              Create Brand DNA
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
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${colors[status] || colors.draft}`}
    >
      {status}
    </span>
  );
}