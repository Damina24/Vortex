import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/db/prisma";
import { z } from "zod";

const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const validation = registerSchema.safeParse(body);

    if (!validation.success) {
      const errors = validation.error.flatten().fieldErrors;
      const firstError = Object.values(errors).flat()[0];
      return NextResponse.json(
        { success: false, error: firstError || "Validation failed" },
        { status: 400 }
      );
    }

    const { name, email, password } = validation.data;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { success: false, error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user and default team in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          email,
          passwordHash,
          creditsBalance: 100, // Free signup bonus
        },
      });

      // Create a personal team for the user
      const teamSlug = `team-${user.id.slice(0, 8)}`;
      const team = await tx.team.create({
        data: {
          name: `${name}'s Team`,
          slug: teamSlug,
          ownerId: user.id,
          subscriptionTier: "free",
        },
      });

      // Add user as owner member
      await tx.teamMember.create({
        data: {
          teamId: team.id,
          userId: user.id,
          role: "owner",
        },
      });

      return { user, team };
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          teamId: result.team.id,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create account" },
      { status: 500 }
    );
  }
}