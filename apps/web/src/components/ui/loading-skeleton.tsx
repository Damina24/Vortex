"use client";

import { motion } from "framer-motion";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <motion.div
      className={`rounded-lg bg-muted/60 relative overflow-hidden ${className}`}
      initial={{ opacity: 0.6 }}
      animate={{ opacity: [0.6, 1, 0.6] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
    >
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-muted-foreground/10 to-transparent"
        animate={{ x: ["-100%", "200%"] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
      />
    </motion.div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-28" />
          <Skeleton className="h-10 w-36" />
        </div>
      </div>

      {/* Stats grid skeleton */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border p-5 space-y-3">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-4 w-32" />
          </div>
        ))}
      </div>

      {/* Recent projects skeleton */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border p-5 space-y-3">
              <div className="flex items-start justify-between">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-4 w-48" />
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LandingPageSkeleton() {
  return (
    <div className="space-y-24 p-24">
      {/* Hero skeleton */}
      <div className="space-y-6 text-center max-w-4xl mx-auto">
        <Skeleton className="h-6 w-96 mx-auto rounded-full" />
        <Skeleton className="h-16 w-[800px] mx-auto" />
        <Skeleton className="h-6 w-[600px] mx-auto" />
        <div className="flex justify-center gap-4 pt-4">
          <Skeleton className="h-12 w-56" />
          <Skeleton className="h-12 w-44" />
        </div>
      </div>

      {/* Features skeleton */}
      <div className="space-y-6 text-center">
        <Skeleton className="h-10 w-[500px] mx-auto" />
        <Skeleton className="h-5 w-[650px] mx-auto" />
      </div>
      <div className="grid grid-cols-3 gap-8">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="rounded-xl border p-6 space-y-4">
            <Skeleton className="h-12 w-12 rounded-lg" />
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function StatsCardSkeleton() {
  return (
    <div className="rounded-xl border p-5 space-y-3">
      <Skeleton className="h-10 w-10 rounded-lg" />
      <Skeleton className="h-8 w-20" />
      <Skeleton className="h-4 w-32" />
    </div>
  );
}