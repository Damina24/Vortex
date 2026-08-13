import { describe, expect, it } from "vitest";
import {
  TEAM_ROLE_LABELS,
  teamRoleLabel,
  toTeamMemberView,
  toTeamView,
  type TeamMemberRow,
  type TeamRow,
} from "./team";

const currentUserId = "u1";

const member = (
  id: string,
  role: TeamMemberRow["role"],
  joinedAt: string,
  name: string,
  email: string,
): TeamMemberRow => ({
  id,
  userId: id,
  role,
  joinedAt,
  user: { id: id, name, email },
});

const team: TeamRow = {
  id: "t1",
  name: "Acme",
  slug: "acme",
  members: [
    member("u2", "viewer", "2026-01-10T00:00:00Z", "Viewer", "v@acme.com"),
    member("u1", "owner", "2026-01-01T00:00:00Z", "Owner", "o@acme.com"),
    member("u3", "editor", "2026-01-05T00:00:00Z", "Editor", "e@acme.com"),
  ],
};

describe("teamRoleLabel", () => {
  it("returns capitalized labels for every role", () => {
    expect(TEAM_ROLE_LABELS).toEqual({
      owner: "Owner",
      admin: "Admin",
      editor: "Editor",
      viewer: "Viewer",
    });
    expect(teamRoleLabel("owner")).toBe("Owner");
    expect(teamRoleLabel("viewer")).toBe("Viewer");
  });
});

describe("toTeamMemberView", () => {
  it("flags the current user and ISO-formatss join time", () => {
    const view = toTeamMemberView(team.members[1], currentUserId);
    expect(view.isCurrentUser).toBe(true);
    expect(view.joinedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(view.role).toBe("owner");
  });

  it("does not flag other members", () => {
    expect(toTeamMemberView(team.members[0], currentUserId).isCurrentUser).toBe(
      false,
    );
  });
});

describe("toTeamView", () => {
  it("orders members owner-first then by join time and maps views", () => {
    const view = toTeamView(team, currentUserId);
    expect(view.id).toBe("t1");
    expect(view.name).toBe("Acme");
    expect(view.members.map((m) => m.role)).toEqual([
      "owner",
      "editor",
      "viewer",
    ]);
    expect(view.members[0].isCurrentUser).toBe(true);
  });

  it("is stable for equal roles, ordering by join time", () => {
    const t: TeamRow = {
      id: "t2",
      name: "Beta",
      slug: "beta",
      members: [
        member("a", "admin", "2026-02-01T00:00:00Z", "A", "a@b.com"),
        member("b", "admin", "2026-01-01T00:00:00Z", "B", "b@b.com"),
      ],
    };
    const view = toTeamView(t, "nobody");
    expect(view.members.map((m) => m.userId)).toEqual(["b", "a"]);
  });
});
