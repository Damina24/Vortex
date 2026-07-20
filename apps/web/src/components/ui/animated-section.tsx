"use client";

import { motion, useInView, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useRef, useEffect, type ReactNode } from "react";

interface AnimatedSectionProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  direction?: "up" | "down" | "left" | "right" | "none";
  duration?: number;
  once?: boolean;
  distance?: number;
}

const directionVariants = {
  up: { y: 60 },
  down: { y: -60 },
  left: { x: 60 },
  right: { x: -60 },
  none: { x: 0, y: 0 },
};

export function AnimatedSection({
  children,
  className,
  delay = 0,
  direction = "up",
  duration = 0.5,
  once = true,
  distance = 60,
}: AnimatedSectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once, margin: "-50px" });

  const directionOffset = directionVariants[direction];

  return (
    <motion.div
      ref={ref}
      initial={{
        opacity: 0,
        ...directionOffset,
      }}
      animate={
        isInView
          ? { opacity: 1, x: 0, y: 0 }
          : { opacity: 0, ...directionOffset }
      }
      transition={{
        duration,
        delay,
        ease: [0.25, 0.1, 0.25, 1],
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface AnimatedStaggerProps {
  children: ReactNode;
  className?: string;
  staggerDelay?: number;
  once?: boolean;
}

export function AnimatedStagger({
  children,
  className,
  staggerDelay = 0.1,
  once = true,
}: AnimatedStaggerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once, margin: "-50px" });

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={{
        hidden: {},
        visible: {
          transition: {
            staggerChildren: staggerDelay,
          },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface AnimatedStaggerItemProps {
  children: ReactNode;
  className?: string;
  direction?: "up" | "down" | "left" | "right";
}

export function AnimatedStaggerItem({
  children,
  className,
  direction = "up",
}: AnimatedStaggerItemProps) {
  const directionOffset = directionVariants[direction];

  return (
    <motion.div
      variants={{
        hidden: {
          opacity: 0,
          ...directionOffset,
        },
        visible: {
          opacity: 1,
          x: 0,
          y: 0,
          transition: {
            duration: 0.5,
            ease: [0.25, 0.1, 0.25, 1],
          },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface AnimatedCounterProps {
  from?: number;
  to: number;
  duration?: number;
  delay?: number;
  className?: string;
  suffix?: string;
  prefix?: string;
  formatNumber?: boolean;
}

export function AnimatedCounter({
  from = 0,
  to,
  duration = 2,
  delay = 0,
  className,
  suffix = "",
  prefix = "",
  formatNumber = true,
}: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  const motionValue = useMotionValue(from);
  const spring = useSpring(motionValue, {
    stiffness: 50,
    damping: 15,
    restDelta: 0.5,
  });

  const rounded = useTransform(spring, (v: number) => Math.round(v));

  useEffect(() => {
    if (isInView) {
      const timeout = setTimeout(() => {
        motionValue.set(to);
      }, delay * 1000);
      return () => clearTimeout(timeout);
    }
  }, [isInView, to, delay, motionValue]);

  useEffect(() => {
    const unsubscribe = rounded.on("change", (latest: number) => {
      if (ref.current) {
        ref.current.textContent = `${prefix}${formatNumber ? latest.toLocaleString() : latest}${suffix}`;
      }
    });
    return unsubscribe;
  }, [rounded, prefix, suffix, formatNumber]);

  return (
    <span ref={ref} className={className}>
      {prefix}{from}{suffix}
    </span>
  );
}
