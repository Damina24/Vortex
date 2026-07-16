import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";

/**
 * Get the current session on the server side.
 */
export async function getSession() {
  return await getServerSession(authOptions);
}

/**
 * Get the current user on the server side.
 * Returns null if not authenticated.
 */
export async function getCurrentUser() {
  const session = await getSession();
  return session?.user ?? null;
}

/**
 * Require authentication — throws if not authenticated.
 * Use this in server components or server actions.
 */
export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Authentication required");
  }
  return user;
}

/**
 * Require a specific role — throws if not authorized.
 */
export async function requireRole(...roles: string[]) {
  const user = await requireAuth();
  if (!roles.includes((user as Record<string, unknown>).role as string)) {
    throw new Error(`Required role: ${roles.join(" or ")}`);
  }
  return user;
}