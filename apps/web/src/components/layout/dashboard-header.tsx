"use client";

import { signOut } from "next-auth/react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
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
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
      className="flex h-16 items-center justify-between border-b bg-background/80 backdrop-blur-sm px-6 sticky top-0 z-40"
    >
      <motion.div
        className="flex items-center gap-4"
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.1 }}
      >
        <h2 className="text-lg font-semibold">
          Welcome back{user.name ? `, ${user.name}` : ""}
        </h2>
      </motion.div>

      <motion.div
        className="flex items-center gap-3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        {/* Subscription Badge */}
        <motion.span
          className="inline-flex items-center rounded-full bg-vortex-100 px-2.5 py-0.5 text-xs font-medium capitalize text-vortex-700 dark:bg-vortex-950 dark:text-vortex-400"
          whileHover={{ scale: 1.05 }}
        >
          {user.subscriptionTier}
        </motion.span>

        {/* Theme Toggle */}
        <motion.button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9, rotate: 15 }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={theme}
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {theme === "dark" ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </motion.div>
          </AnimatePresence>
        </motion.button>

        {/* Notifications */}
        <motion.button
          className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
        >
          <Bell className="h-5 w-5" />
          <motion.span
            className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-vortex-500"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        </motion.button>

        {/* User Menu */}
        <div className="relative">
          <motion.button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 rounded-lg p-1.5 transition-colors hover:bg-muted"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <motion.div
              className="flex h-8 w-8 items-center justify-center rounded-full bg-vortex-100 text-sm font-medium text-vortex-700 dark:bg-vortex-950 dark:text-vortex-400"
              whileHover={{ scale: 1.1 }}
            >
              {user.name ? getInitials(user.name) : "U"}
            </motion.div>
          </motion.button>

          <AnimatePresence>
            {showUserMenu && (
              <>
                <motion.div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowUserMenu(false)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                />

                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
                  className="absolute right-0 top-full z-20 mt-2 w-56 rounded-lg border bg-background p-2 shadow-lg"
                >
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
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.header>
  );
}
