"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, Film, BarChart3, Users, Music, Shield, ChevronDown } from "lucide-react";
import { AnimatedSection, AnimatedStagger, AnimatedStaggerItem } from "@/components/ui/animated-section";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Navigation */}
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] as const }}
        className="border-b bg-background/80 backdrop-blur-md sticky top-0 z-50"
      >
        <div className="container flex h-16 items-center justify-between px-4">
          <motion.div
            className="flex items-center gap-2"
            whileHover={{ scale: 1.02 }}
          >
            <img src="/vortex-logo.svg" alt="VORTEX AI" className="h-8 w-8 shrink-0" />
            <span className="text-xl font-bold">VORTEX AI</span>
          </motion.div>
          <nav className="hidden md:flex items-center gap-6">
            {["Features", "How It Works", "Pricing"].map((item, i) => (
              <motion.div
                key={item}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.1 }}
              >
                <Link
                  href={`#${item.toLowerCase().replace(/\s+/g, "-")}`}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors relative group"
                >
                  {item}
                  <span className="absolute -bottom-1 left-0 h-0.5 w-0 bg-vortex-500 transition-all duration-300 group-hover:w-full" />
                </Link>
              </motion.div>
            ))}
          </nav>
          <motion.div
            className="flex items-center gap-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            <Link
              href="/login"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors relative group"
            >
              Log in
              <span className="absolute -bottom-1 left-0 h-0.5 w-0 bg-foreground transition-all duration-300 group-hover:w-full" />
            </Link>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-lg bg-vortex-600 px-4 py-2 text-sm font-medium text-white hover:bg-vortex-700 transition-colors"
              >
                Get Started
                <motion.span
                  animate={{ x: [0, 4, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                >
                  <ArrowRight className="h-4 w-4" />
                </motion.span>
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </motion.header>

      {/* Hero Section */}
      <section className="flex-1 relative overflow-hidden">
        {/* Animated background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-vortex-50 via-background to-vortex-100/20 dark:from-vortex-950/30 dark:via-background dark:to-vortex-950/20 animate-gradient pointer-events-none" />
        <div className="absolute top-20 left-10 w-72 h-72 bg-vortex-500/10 rounded-full blur-3xl animate-float-slow pointer-events-none" />
        <div className="absolute bottom-40 right-20 w-96 h-96 bg-vortex-400/10 rounded-full blur-3xl animate-float pointer-events-none" />

        <div className="container px-4 py-24 md:py-32 relative z-10">
          <motion.div
            className="mx-auto max-w-4xl text-center"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2, ease: [0.25, 0.1, 0.25, 1] as const }}
          >
            <motion.div
              className="mb-6 inline-flex items-center gap-2 rounded-full border bg-muted/50 px-4 py-1.5 text-sm"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <Sparkles className="h-4 w-4 text-vortex-500" />
              <span>Launch campaigns faster with AI-guided creative production</span>
            </motion.div>
            <h1 className="text-4xl font-bold tracking-tight sm:text-6xl md:text-7xl">
              Turn a business goal into a{" "}
              <span className="text-vortex-500 inline-block relative">
                launch-ready video campaign
                <motion.span
                  className="absolute -bottom-2 left-0 h-1 bg-vortex-500/30 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 1, delay: 1.2, ease: [0.25, 0.1, 0.25, 1] as const }}
                />
              </span>
            </h1>
            <motion.p
              className="mt-6 text-lg text-muted-foreground md:text-xl max-w-2xl mx-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.7, delay: 0.5 }}
            >
              VORTEX AI helps teams shape a strategy, storyboard the story, generate assets, and publish with confidence — all from one workspace.
            </motion.p>
            <motion.div
              className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.7 }}
            >
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Link
                  href="/register"
                  className="inline-flex h-12 items-center gap-2 rounded-lg bg-vortex-600 px-8 text-base font-medium text-white hover:bg-vortex-700 transition-colors animate-pulse-glow"
                >
                  Start Your First Campaign
                  <motion.span
                    animate={{ x: [0, 5, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <ArrowRight className="h-5 w-5" />
                  </motion.span>
                </Link>
              </motion.div>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Link
                  href="#how-it-works"
                  className="inline-flex h-12 items-center gap-2 rounded-lg border px-8 text-base font-medium hover:bg-muted transition-colors"
                >
                  See How It Works
                  <motion.span
                    animate={{ y: [0, 3, 0] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </motion.span>
                </Link>
              </motion.div>
            </motion.div>
            <motion.p
              className="mt-4 text-sm text-muted-foreground"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 1 }}
            >
              No credit card required. New accounts receive <span className="font-semibold text-foreground">100 free credits</span> to explore the workflow.
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="border-t py-24 relative">
        <div className="absolute inset-0 bg-gradient-to-t from-vortex-50/30 via-transparent to-transparent dark:from-vortex-950/20 pointer-events-none" />
        <div className="container px-4 relative z-10">
          <AnimatedSection>
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Everything you need to create winning video campaigns
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                VORTEX AI bridges the gaps competitors ignore — from brand consistency to
                predictive performance.
              </p>
            </div>
          </AnimatedSection>
          <AnimatedStagger className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            <AnimatedStaggerItem>
              <FeatureCard
                icon={<Film className="h-6 w-6" />}
                title="AI Creative Director"
                description="Input a business goal and get a complete campaign strategy with predicted CTR scores, not just a video."
              />
            </AnimatedStaggerItem>
            <AnimatedStaggerItem>
              <FeatureCard
                icon={<Users className="h-6 w-6" />}
                title="Team Collaboration"
                description="Workspaces, client portals, and real-time collaboration for agencies and marketing teams."
              />
            </AnimatedStaggerItem>
            <AnimatedStaggerItem>
              <FeatureCard
                icon={<BarChart3 className="h-6 w-6" />}
                title="Performance Analytics"
                description="Built-in A/B testing, engagement tracking, and auto-optimization based on real campaign data."
              />
            </AnimatedStaggerItem>
            <AnimatedStaggerItem>
              <FeatureCard
                icon={<Shield className="h-6 w-6" />}
                title="Brand DNA Engine"
                description="Enforce brand consistency automatically — colors, fonts, voice, logo placement, and more."
              />
            </AnimatedStaggerItem>
            <AnimatedStaggerItem>
              <FeatureCard
                icon={<Music className="h-6 w-6" />}
                title="Full Audio Suite"
                description="AI voiceover (ElevenLabs), background music (Suno), and sound effects — all synced automatically."
              />
            </AnimatedStaggerItem>
            <AnimatedStaggerItem>
              <FeatureCard
                icon={<ArrowRight className="h-6 w-6" />}
                title="Direct Publishing"
                description="Publish directly to Meta, TikTok, and YouTube with built-in A/B testing and auto-optimization."
              />
            </AnimatedStaggerItem>
          </AnimatedStagger>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="border-t bg-muted/30 py-24">
        <div className="container px-4">
          <AnimatedSection>
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                From idea to published campaign in minutes
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                Five simple steps to create, optimize, and publish winning video content.
              </p>
            </div>
          </AnimatedSection>
          <div className="mt-16 grid gap-8 md:grid-cols-5">
            {[
              { number: 1, title: "Define Goal", description: "Enter your business objective, target audience, and brand guidelines." },
              { number: 2, title: "AI Strategizes", description: "Creative Director generates 3 concepts with predicted CTR scores." },
              { number: 3, title: "Storyboard", description: "Review and edit AI-generated multi-scene storyboards." },
              { number: 4, title: "Generate", description: "Parallel video, voice, and music generation with brand compliance." },
              { number: 5, title: "Publish & Optimize", description: "Direct API publishing with A/B testing and auto-optimization." },
            ].map((step, i) => (
              <AnimatedSection key={step.number} delay={i * 0.15} direction="up">
                <StepCard number={step.number} title={step.title} description={step.description} />
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="border-t py-24">
        <div className="container px-4">
          <AnimatedSection>
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Simple, transparent pricing
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                Start free, then buy credits when your campaign needs more momentum.
              </p>
            </div>
          </AnimatedSection>
          <AnimatedStagger className="mt-16 grid gap-8 md:grid-cols-3">
            <AnimatedStaggerItem>
              <PricingCard
                name="Starter"
                price="$19"
                description="For first launches"
                features={["250 credits", "One-time purchase", "Storyboards & concepts", "Fast asset generation", "Simple campaign setup"]}
              />
            </AnimatedStaggerItem>
            <AnimatedStaggerItem>
              <PricingCard
                name="Pro"
                price="$49"
                description="For regular production"
                features={["1,000 credits", "Higher-volume output", "Premium quality renders", "Priority support", "Better campaign iteration"]}
                highlighted
              />
            </AnimatedStaggerItem>
            <AnimatedStaggerItem>
              <PricingCard
                name="Business"
                price="$149"
                description="For agencies & teams"
                features={["5,000 credits", "Team-ready workflow", "Advanced sequencing", "More automation", "Dedicated launch support"]}
              />
            </AnimatedStaggerItem>
          </AnimatedStagger>
        </div>
      </section>

      {/* Footer */}
      <motion.footer
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        className="border-t py-8"
      >
        <div className="container px-4">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <motion.div
              className="flex items-center gap-2"
              whileHover={{ scale: 1.02 }}
            >
              <Sparkles className="h-5 w-5 text-vortex-500" />
              <span className="font-bold">VORTEX AI</span>
            </motion.div>
            <p className="text-sm text-muted-foreground">
              © 2026 VORTEX AI. All rights reserved.
            </p>
          </div>
        </div>
      </motion.footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <motion.div
      className="group rounded-xl border p-6 transition-all hover:border-vortex-500/50 hover:shadow-md relative overflow-hidden"
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
    >
      {/* Hover shimmer effect */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-vortex-500/5 to-transparent pointer-events-none"
        initial={{ x: "-100%" }}
        whileHover={{ x: "200%" }}
        transition={{ duration: 0.6, ease: "easeInOut" }}
      />
      <div className="relative z-10">
        <motion.div
          className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-vortex-100 text-vortex-600 dark:bg-vortex-950 dark:text-vortex-400"
          whileHover={{ rotate: [0, -10, 10, 0], transition: { duration: 0.4 } }}
        >
          {icon}
        </motion.div>
        <h3 className="mb-2 text-lg font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </motion.div>
  );
}

function StepCard({
  number,
  title,
  description,
}: {
  number: number;
  title: string;
  description: string;
}) {
  return (
    <motion.div
      className="text-center"
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
    >
      <motion.div
        className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-vortex-600 text-lg font-bold text-white"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
      >
        {number}
      </motion.div>
      <h3 className="mb-2 font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </motion.div>
  );
}

function PricingCard({
  name,
  price,
  description,
  features,
  highlighted = false,
}: {
  name: string;
  price: string;
  description: string;
  features: string[];
  highlighted?: boolean;
}) {
  return (
    <motion.div
      className={`relative rounded-xl border p-6 transition-all ${
        highlighted
          ? "border-vortex-500 shadow-lg ring-1 ring-vortex-500"
          : "hover:border-vortex-500/50"
      }`}
      whileHover={{ y: -6, transition: { duration: 0.2 } }}
    >
      {highlighted && (
        <motion.div
          className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-vortex-600 px-3 py-1 text-xs font-medium text-white"
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          Most Popular
        </motion.div>
      )}
      <h3 className="text-lg font-semibold">{name}</h3>
      <div className="mt-4 flex items-baseline gap-1">
        <motion.span
          className="text-4xl font-bold"
          initial={{ opacity: 0, scale: 0.5 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] as const }}
        >
          {price}
        </motion.span>
        <span className="text-muted-foreground">/month</span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      <ul className="mt-6 space-y-3">
        {features.map((feature) => (
          <motion.li
            key={feature}
            className="flex items-center gap-2 text-sm"
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.3 }}
          >
            <svg
              className="h-4 w-4 text-vortex-500 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            {feature}
          </motion.li>
        ))}
      </ul>
      <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
        <Link
          href="/register"
          className={`mt-8 inline-flex w-full items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            highlighted
              ? "bg-vortex-600 text-white hover:bg-vortex-700"
              : "border bg-background hover:bg-muted"
          }`}
        >
          Get Started
        </Link>
      </motion.div>
    </motion.div>
  );
}