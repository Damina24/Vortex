import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import {
  brandDnaToPayload,
  payloadToBrandDnaJson,
  type BrandDnaPayload,
} from "@/lib/brand-dna";
import { brandDnaSchema } from "@/lib/brand-dna-schema";

/** Returns the user's team id, or null when they are not on any team. */
async function getUserTeamId(userId: string): Promise<string | null> {
  const membership = await prisma.teamMember.findFirst({
    where: { userId },
    select: { teamId: true },
  });
  return membership?.teamId ?? null;
}

/** Fetches a brand profile scoped to the user's team (ownership enforced). */
async function findOwnedBrandDna(id: string, teamId: string) {
  return prisma.brandDna.findFirst({
    where: { id, teamId },
  });
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const teamId = await getUserTeamId(session.user.id);
    if (!teamId) {
      return NextResponse.json(
        { success: false, error: "No team found" },
        { status: 404 }
      );
    }

    const row = await findOwnedBrandDna(params.id, teamId);
    if (!row) {
      return NextResponse.json(
        { success: false, error: "Brand profile not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { id: row.id, ...brandDnaToPayload(row) },
    });
  } catch (error) {
    console.error("Error fetching brand DNA:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch brand profile" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const teamId = await getUserTeamId(session.user.id);
    if (!teamId) {
      return NextResponse.json(
        { success: false, error: "No team found" },
        { status: 404 }
      );
    }

    const existing = await findOwnedBrandDna(params.id, teamId);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Brand profile not found" },
        { status: 404 }
      );
    }

    const body = await req.json();
    const validation = brandDnaSchema.partial().safeParse(body);
    if (!validation.success) {
      const errors = validation.error.flatten().fieldErrors;
      const firstError = Object.values(errors).flat()[0];
      return NextResponse.json(
        { success: false, error: firstError || "Validation failed" },
        { status: 400 }
      );
    }

    // Merge partial input over the stored payload so untouched sections are
    // preserved, then serialize back to the JSON columns.
    const current = brandDnaToPayload(existing);
    const merged = {
      ...current,
      ...validation.data,
    } as BrandDnaPayload;

    const json = payloadToBrandDnaJson(merged);

    const updated = await prisma.brandDna.update({
      where: { id: existing.id },
      data: {
        name: merged.name,
        visualIdentity: json.visualIdentity as Prisma.InputJsonValue,
        voiceTone: json.voiceTone as Prisma.InputJsonValue,
        complianceRules: json.complianceRules as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({
      success: true,
      data: { id: updated.id, ...brandDnaToPayload(updated) },
    });
  } catch (error) {
    console.error("Error updating brand DNA:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update brand profile" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const teamId = await getUserTeamId(session.user.id);
    if (!teamId) {
      return NextResponse.json(
        { success: false, error: "No team found" },
        { status: 404 }
      );
    }

    const existing = await findOwnedBrandDna(params.id, teamId);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Brand profile not found" },
        { status: 404 }
      );
    }

    // Projects referencing this profile keep their rows: the FK is ON DELETE
    // SET NULL, so the project just loses its brand assignment.
    await prisma.brandDna.delete({ where: { id: existing.id } });

    return NextResponse.json({ success: true, data: { id: existing.id } });
  } catch (error) {
    console.error("Error deleting brand DNA:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete brand profile" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";