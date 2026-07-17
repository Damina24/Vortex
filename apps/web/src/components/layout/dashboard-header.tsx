"use client";

import { signOut } from "next-auth/react";
import Link from "next/link";
import {
  LogOut,
  User,
  Moon,
  Sun,
  Bell,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";
import { getInitials } from "@/lib/utils";

interface DashboardHeaderProps {
  user: {
    id: string;
    email?: string | null;
    name?: string | null;
    image?: string | null;
    role: string;
    subscriptionTier: string;
    creditsBalance: number;
  };
}

export function DashboardHeader({ user }: DashboardHeaderProps) {
  const { theme, setTheme } = useTheme();
  const [showUserMenu, setShowUserMenu] = useState(false);

  return (
    <header className="flex h-16 items-center justify-between border-b bg-background px-6">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-semibold">
          Welcome back{user.name ? `, ${user.name}` : ""}
        </h2>
      </div>

      <div className="flex items-center gap-3">
        {/* Subscription Badge */}
        <span className="inline-flex items-center rounded-full bg-vortex-100 px-2.5 py-0.5 text-xs font-medium capitalize text-vortex-700 dark:bg-vortex-950 dark:text-vortex-400">
          {user.subscriptionTier}
        </span>

        {/* Theme Toggle */}
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {theme === "dark" ? (
            <Sun className="h-5 w-5" />
          ) : (
            <Moon className="h-5 w-5" />
          )}
        </button>

        {/* Notifications */}
        <button className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-vortex-500" />
        </button>

        {/* User Menu */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 rounded-lg p-1.5 transition-colors hover:bg-muted"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-vortex-100 text-sm font-medium text-vortex-700 dark:bg-vortex-950 dark:text-vortex-400">
              {user.name ? getInitials(user.name) : "U"}
            </div>
          </button>

          {showUserMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowUserMenu(false)}
              />

              <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-lg border bg-background p-2 shadow-lg">
                <div className="mb-2 border-b px-2 pb-2">
                  <p className="text-sm font-medium">
                    {user.name ?? "User"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {user.email ?? "No email available"}
                  </p>
                </div>

                <Link
                  href="/dashboard/settings"
                  onClick={() => setShowUserMenu(false)}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted"
                >
                  <User className="h-4 w-4" />
                  Profile Settings
                </Link>

                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-red-600 transition-colors hover:bg-red-50 dark:hover:bg-red-950"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}