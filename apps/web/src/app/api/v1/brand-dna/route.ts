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

/** Resolves the user's team or returns null when they have none. */
async function getUserTeam(userId: string) {
  const membership = await prisma.teamMember.findFirst({
    where: { userId },
    include: { team: true },
  });
  return membership?.team ?? null;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const team = await getUserTeam(session.user.id);
    if (!team) {
      return NextResponse.json({ success: true, data: [] });
    }

    const rows = await prisma.brandDna.findMany({
      where: { teamId: team.id },
      orderBy: { updatedAt: "desc" },
    });

    const data = rows.map((row) => {
      const payload = brandDnaToPayload(row);
      return {
        id: row.id,
        ...payload,
        isActive: row.isActive,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error fetching brand DNAs:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch brand profiles" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const validation = brandDnaSchema.safeParse(body);
    if (!validation.success) {
      const errors = validation.error.flatten().fieldErrors;
      const firstError = Object.values(errors).flat()[0];
      return NextResponse.json(
        { success: false, error: firstError || "Validation failed" },
        { status: 400 }
      );
    }

    const team = await getUserTeam(session.user.id);
    if (!team) {
      return NextResponse.json(
        { success: false, error: "No team found" },
        { status: 400 }
      );
    }

    const payload = validation.data as BrandDnaPayload;
    const json = payloadToBrandDnaJson(payload);

    const created = await prisma.brandDna.create({
      data: {
        teamId: team.id,
        name: payload.name,
        visualIdentity: json.visualIdentity as Prisma.InputJsonValue,
        voiceTone: json.voiceTone as Prisma.InputJsonValue,
        complianceRules: json.complianceRules as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json(
      { success: true, data: { id: created.id, ...brandDnaToPayload(created) } },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating brand DNA:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create brand profile" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";