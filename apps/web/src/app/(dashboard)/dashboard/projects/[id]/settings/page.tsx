import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/db/prisma";
import { ArrowLeft } from "lucide-react";
import {
  ProjectSettingsForm,
  type ProjectSettingsValue,
} from "@/components/projects/project-settings-form";

export default async function ProjectSettingsPage({
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
  });

  if (!project) {
    notFound();
  }

  const settings: ProjectSettingsValue = {
    id: project.id,
    name: project.name,
    description: project.description,
    objective: project.objective,
    status: project.status,
    targetPlatforms: project.targetPlatforms as string[],
  };

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/dashboard/projects/${params.id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Project
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Project Settings</h1>
        <p className="text-muted-foreground">Configure {project.name}</p>
      </div>

      <ProjectSettingsForm project={settings} />
    </div>
  );
}
