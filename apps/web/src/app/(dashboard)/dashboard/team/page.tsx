import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/db/prisma";
import { BadgeCheck, Users } from "lucide-react";
import {
  teamRoleLabel,
  toTeamView,
  type TeamRole,
  type TeamRow,
} from "@/lib/team";

const ROLE_BADGE: Record<TeamRole, string> = {
  owner:
    "bg-vortex-100 text-vortex-700 dark:bg-vortex-950 dark:text-vortex-400",
  admin: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  editor: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  viewer: "bg-muted text-muted-foreground",
};

function MemberRow({
  member,
  index,
}: {
  member: ReturnType<typeof toTeamView>["members"][number];
  index: number;
}) {
  const avatar = member.name?.charAt(0).toUpperCase() || "?";
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-vortex-100 text-sm font-semibold text-vortex-700 dark:bg-vortex-950 dark:text-vortex-400">
          {avatar}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium">
              {member.name || member.email}
            </p>
            {member.isCurrentUser && (
              <BadgeCheck className="h-4 w-4 shrink-0 text-vortex-600" />
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {member.email}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${ROLE_BADGE[member.role]}`}
        >
          {teamRoleLabel(member.role)}
        </span>
        {member.isCurrentUser && (
          <span className="hidden text-xs text-muted-foreground sm:inline">
            You
          </span>
        )}
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {index === 0 ? "#" : ""}
        </span>
      </div>
    </div>
  );
}

export default async function TeamPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  const membership = await prisma.teamMember.findFirst({
    where: { userId: session.user.id },
    orderBy: { joinedAt: "asc" },
    include: {
      team: {
        include: {
          members: {
            include: { user: true },
            orderBy: { joinedAt: "asc" },
          },
        },
      },
    },
  });

  const team = membership?.team
    ? toTeamView(membership.team as unknown as TeamRow, session.user.id)
    : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Team</h1>
        <p className="text-muted-foreground">Your workspace and its members.</p>
      </div>

      {team ? (
        <div className="max-w-2xl space-y-4">
          <div className="rounded-2xl border bg-background p-6 shadow-sm">
            <div className="mb-2 flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">{team.name}</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              {team.members.length} member{team.members.length === 1 ? "" : "s"}
            </p>
          </div>

          <div className="divide-y rounded-2xl border bg-background px-6 shadow-sm">
            {team.members.map((member, index) => (
              <MemberRow key={member.id} member={member} index={index} />
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed p-16 text-center">
          <Users className="mx-auto h-12 w-12 text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-semibold mb-2">No team yet</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            You are not part of a workspace yet. Invite your teammates or create
            a workspace to collaborate on projects.
          </p>
        </div>
      )}
    </div>
  );
}
