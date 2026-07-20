"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  LayoutDashboard,
  FolderKanban,
  CreditCard,
  Film,
  BarChart3,
  Palette,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

const sidebarItems = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Projects",
    href: "/dashboard/projects",
    icon: FolderKanban,
  },
  {
    label: "Credits",
    href: "/dashboard/credits",
    icon: CreditCard,
  },
  {
    label: "Storyboards",
    href: "/dashboard/storyboards",
    icon: Film,
  },
  {
    label: "Analytics",
    href: "/dashboard/analytics",
    icon: BarChart3,
  },
  {
    label: "Brand DNA",
    href: "/dashboard/brand-dna",
    icon: Palette,
  },
  {
    label: "Team",
    href: "/dashboard/team",
    icon: Users,
  },
  {
    label: "Settings",
    href: "/dashboard/settings",
    icon: Settings,
  },
];

const sidebarVariants = {
  expanded: { width: 256 },
  collapsed: { width: 64 },
};

const itemVariants = {
  hidden: { opacity: 0, x: -10 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: {
      delay: i * 0.05,
      duration: 0.3,
      ease: [0.25, 0.1, 0.25, 1] as const,
    },
  }),
};

export function DashboardSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <motion.aside
      animate={collapsed ? "collapsed" : "expanded"}
      variants={sidebarVariants}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] as const }}
      className="flex flex-col border-r bg-background overflow-hidden"
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b px-4 shrink-0">
        <Link
          href="/dashboard"
          className={cn(
            "flex items-center gap-2",
            collapsed && "justify-center w-full"
          )}
        >
          <motion.div
            className="h-8 w-8 shrink-0 rounded-lg bg-vortex-600 flex items-center justify-center"
            whileHover={{ scale: 1.1, rotate: [0, -5, 5, 0] }}
            transition={{ duration: 0.3 }}
          >
            <Sparkles className="h-5 w-5 text-white" />
          </motion.div>
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2 }}
                className="text-lg font-bold whitespace-nowrap overflow-hidden"
              >
                VORTEX AI
              </motion.span>
            )}
          </AnimatePresence>
        </Link>
        <motion.button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
            collapsed && "absolute right-2"
          )}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </motion.button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-3 overflow-y-auto overflow-x-hidden">
        {sidebarItems.map((item, index) => {
          const isActive = pathname === item.href;
          return (
            <motion.div
              key={item.href}
              custom={index}
              variants={itemVariants}
              initial="hidden"
              animate="visible"
            >
              <Link
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors relative",
                  isActive
                    ? "bg-vortex-100 text-vortex-700 dark:bg-vortex-950 dark:text-vortex-400"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  collapsed && "justify-center px-2"
                )}
                title={collapsed ? item.label : undefined}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute inset-0 rounded-lg bg-vortex-100 dark:bg-vortex-950"
                    transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] as const }}
                  />
                )}
                <item.icon className="h-5 w-5 shrink-0 relative z-10" />
                <AnimatePresence>
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="relative z-10"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </Link>
            </motion.div>
          );
        })}
      </nav>

      {/* Credits indicator */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t shrink-0"
          >
            <div className="p-4">
              <motion.div
                className="rounded-lg bg-muted/50 p-3"
                whileHover={{ scale: 1.02 }}
              >
                <p className="text-xs text-muted-foreground">Available Credits</p>
                <motion.p
                  className="text-lg font-bold"
                  initial={{ scale: 0.5 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] as const }}
                >
                  100
                </motion.p>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.aside>
  );
}
