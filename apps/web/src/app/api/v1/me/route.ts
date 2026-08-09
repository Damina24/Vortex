import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/db/prisma";
import { z } from "zod";

const updateMeSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(255).optional(),
  email: z.string().email("Invalid email address").optional(),
  avatarUrl: z.string().url().nullable().optional(),
});

const userSelect = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
  creditsBalance: true,
  subscriptionTier: true,
  createdAt: true,
} as const;

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: userSelect,
    });

    const membership = await prisma.teamMember.findFirst({
      where: { userId: session.user.id },
      include: {
        team: {
          select: {
            id: true,
            name: true,
            slug: true,
            _count: { select: { members: true } },
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        user,
        team: membership?.team ?? null,
        role: membership?.role ?? null,
      },
    });
  } catch (error) {
    console.error("Error fetching profile:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch profile" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const validation = updateMeSchema.safeParse(body);

    if (!validation.success) {
      const errors = validation.error.flatten().fieldErrors;
      const firstError = Object.values(errors).flat()[0];
      return NextResponse.json(
        { success: false, error: firstError || "Validation failed" },
        { status: 400 }
      );
    }

    // If the email is being changed, ensure it isn't used by another account
    if (validation.data.email) {
      const existing = await prisma.user.findUnique({
        where: { email: validation.data.email },
        select: { id: true },
      });

      if (existing && existing.id !== session.user.id) {
        return NextResponse.json(
          { success: false, error: "An account with this email already exists" },
          { status: 409 }
        );
      }
    }

    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data: validation.data,
      select: userSelect,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error updating profile:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update profile" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";