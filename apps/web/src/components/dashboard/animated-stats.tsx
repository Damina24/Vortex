"use client";

import { motion } from "framer-motion";
import { AnimatedCounter } from "@/components/ui/animated-section";
import { FolderKanban, Film, BarChart3, Sparkles } from "lucide-react";

interface AnimatedStatsProps {
  projectCount: number;
  storyboardCount: number;
  assetCount: number;
  creditsBalance: number;
}

export function AnimatedStats({
  projectCount,
  storyboardCount,
  assetCount,
  creditsBalance,
}: AnimatedStatsProps) {
  const stats = [
    {
      icon: <FolderKanban className="h-5 w-5" />,
      label: "Active Projects",
      value: projectCount,
      color: "vortex" as const,
    },
    {
      icon: <Film className="h-5 w-5" />,
      label: "Storyboards",
      value: storyboardCount,
      color: "blue" as const,
    },
    {
      icon: <BarChart3 className="h-5 w-5" />,
      label: "Assets Created",
      value: assetCount,
      color: "green" as const,
    },
    {
      icon: <Sparkles className="h-5 w-5" />,
      label: "Available Credits",
      value: creditsBalance,
      color: "amber" as const,
    },
  ];

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.4,
            delay: i * 0.1,
            ease: [0.25, 0.1, 0.25, 1] as const,
          }}
        >
          <StatCard
            icon={stat.icon}
            label={stat.label}
            value={stat.value}
            color={stat.color}
          />
        </motion.div>
      ))}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: "vortex" | "blue" | "green" | "amber";
}) {
  const colors = {
    vortex: "bg-vortex-100 text-vortex-600 dark:bg-vortex-950 dark:text-vortex-400",
    blue: "bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
    green: "bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400",
    amber: "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400",
  };

  return (
    <motion.div
      className="rounded-xl border p-5"
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
    >
      <div className="flex items-center gap-3 mb-3">
        <motion.div
          className={`flex h-10 w-10 items-center justify-center rounded-lg ${colors[color]}`}
          whileHover={{ rotate: [0, -10, 10, 0], transition: { duration: 0.4 } }}
        >
          {icon}
        </motion.div>
      </div>
      <AnimatedCounter
        from={0}
        to={value}
        duration={1.5}
        className="text-2xl font-bold"
        formatNumber
      />
      <p className="text-sm text-muted-foreground">{label}</p>
    </motion.div>
  );
}