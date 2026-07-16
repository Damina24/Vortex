"use client";

import { signOut } from "next-auth/react";
import Link from "next/link";
import {
  Sparkles,
  LogOut,
  User,
  Moon,
  Sun,
  Bell,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";
import { cn, getInitials } from "@/lib/utils";

interface DashboardHeaderProps {
  user: {
    id: string;
    email: string;
    name: string | null;
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
        {/* Subscription badge */}
        <span className="inline-flex items-center rounded-full bg-vortex-100 px-2.5 py-0.5 text-xs font-medium text-vortex-700 dark:bg-vortex-950 dark:text-vortex-400 capitalize">
          {user.subscriptionTier}
        </span>

        {/* Theme toggle */}
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          {theme === "dark" ? (
            <Sun className="h-5 w-5" />
          ) : (
            <Moon className="h-5 w-5" />
          )}
        </button>

        {/* Notifications */}
        <button className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors relative">
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-vortex-500" />
        </button>

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-muted transition-colors"
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
                <div className="border-b px-2 pb-2 mb-2">
                  <p className="text-sm font-medium">{user.name || "User"}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
                <Link
                  href="/dashboard/settings"
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors"
                  onClick={() => setShowUserMenu(false)}
                >
                  <User className="h-4 w-4" />
                  Profile Settings
                </Link>
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
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