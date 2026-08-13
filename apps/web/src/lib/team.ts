/**
 * Pure helpers for rendering a user's team. Kept free of Prisma/React imports
 * (structural row types only) so it can be unit-tested and reused without
 * dragging in generated clients or colliding with concurrent schema churn.
 */

export type TeamRole = "owner" | "admin" | "editor" | "viewer";

export interface TeamMemberRow {
  id: string;
  userId: string;
  role: TeamRole;
  joinedAt: Date | string;
  user: { id: string; name: string | null; email: string };
}

export interface TeamRow {
  id: string;
  name: string;
  slug: string;
  members: TeamMemberRow[];
}

export interface TeamMemberView {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  role: TeamRole;
  joinedAt: string; // ISO
  isCurrentUser: boolean;
}

export interface TeamView {
  id: string;
  name: string;
  slug: string;
  members: TeamMemberView[];
}

const ROLE_ORDER: Record<TeamRole, number> = {
  owner: 0,
  admin: 1,
  editor: 2,
  viewer: 3,
};

export const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

export function teamRoleLabel(role: TeamRole): string {
  return TEAM_ROLE_LABELS[role];
}

export function toTeamMemberView(
  member: TeamMemberRow,
  currentUserId: string,
): TeamMemberView {
  return {
    id: member.id,
    userId: member.userId,
    name: member.user.name,
    email: member.user.email,
    role: member.role,
    joinedAt: new Date(member.joinedAt).toISOString(),
    isCurrentUser: member.userId === currentUserId,
  };
}

/**
 * Orders members by role (owner first) then join time, and marks which one is
 * the current user. Pure and deterministic for the given rows.
 */
export function toTeamView(team: TeamRow, currentUserId: string): TeamView {
  const ordered = [...team.members].sort((a, b) => {
    const roleDiff = ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
    if (roleDiff !== 0) return roleDiff;
    return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
  });

  return {
    id: team.id,
    name: team.name,
    slug: team.slug,
    members: ordered.map((m) => toTeamMemberView(m, currentUserId)),
  };
}
