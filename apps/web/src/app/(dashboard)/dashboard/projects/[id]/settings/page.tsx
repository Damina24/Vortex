import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/db/prisma";
import { ArrowLeft } from "lucide-react";

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
    include: {
      brandDna: {
        select: { id: true, name: true },
      },
    },
  });

  if (!project) {
    notFound();
  }

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
        <p className="text-muted-foreground">
          Configure {project.name}
        </p>
      </div>

      <div className="rounded-xl border border-dashed p-16 text-center">
        <p className="text-sm text-muted-foreground">
          Project settings coming soon. Manage objectives, platforms, and brand assignments.
        </p>
      </div>
    </div>
  );
}