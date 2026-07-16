import Link from "next/link";
import { ArrowRight, Sparkles, Film, BarChart3, Users, Music, Shield } from "lucide-react";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Navigation */}
      <header className="border-b">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-vortex-600 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold">VORTEX AI</span>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            <Link href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Features
            </Link>
            <Link href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              How It Works
            </Link>
            <Link href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Pricing
            </Link>
          </nav>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Log in
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-lg bg-vortex-600 px-4 py-2 text-sm font-medium text-white hover:bg-vortex-700 transition-colors"
            >
              Get Started
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="flex-1">
        <div className="container px-4 py-24 md:py-32">
          <div className="mx-auto max-w-4xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-muted/50 px-4 py-1.5 text-sm">
              <Sparkles className="h-4 w-4 text-vortex-500" />
              <span>Launch campaigns faster with AI-guided creative production</span>
            </div>
            <h1 className="text-4xl font-bold tracking-tight sm:text-6xl md:text-7xl">
              Turn a business goal into a{" "}
              <span className="text-vortex-500">launch-ready video campaign</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground md:text-xl max-w-2xl mx-auto">
              VORTEX AI helps teams shape a strategy, storyboard the story, generate assets, and publish with confidence — all from one workspace.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/register"
                className="inline-flex h-12 items-center gap-2 rounded-lg bg-vortex-600 px-8 text-base font-medium text-white hover:bg-vortex-700 transition-colors"
              >
                Start Your First Campaign
                <ArrowRight className="h-5 w-5" />
              </Link>
              <Link
                href="#how-it-works"
                className="inline-flex h-12 items-center gap-2 rounded-lg border px-8 text-base font-medium hover:bg-muted transition-colors"
              >
                See How It Works
              </Link>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              No credit card required. New accounts receive 100 free credits to explore the workflow.
            </p>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="border-t py-24">
        <div className="container px-4">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Everything you need to create winning video campaigns
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              VORTEX AI bridges the gaps competitors ignore — from brand consistency to
              predictive performance.
            </p>
          </div>
          <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={<Film className="h-6 w-6" />}
              title="AI Creative Director"
              description="Input a business goal and get a complete campaign strategy with predicted CTR scores, not just a video."
            />
            <FeatureCard
              icon={<Users className="h-6 w-6" />}
              title="Team Collaboration"
              description="Workspaces, client portals, and real-time collaboration for agencies and marketing teams."
            />
            <FeatureCard
              icon={<BarChart3 className="h-6 w-6" />}
              title="Performance Analytics"
              description="Built-in A/B testing, engagement tracking, and auto-optimization based on real campaign data."
            />
            <FeatureCard
              icon={<Shield className="h-6 w-6" />}
              title="Brand DNA Engine"
              description="Enforce brand consistency automatically — colors, fonts, voice, logo placement, and more."
            />
            <FeatureCard
              icon={<Music className="h-6 w-6" />}
              title="Full Audio Suite"
              description="AI voiceover (ElevenLabs), background music (Suno), and sound effects — all synced automatically."
            />
            <FeatureCard
              icon={<ArrowRight className="h-6 w-6" />}
              title="Direct Publishing"
              description="Publish directly to Meta, TikTok, and YouTube with built-in A/B testing and auto-optimization."
            />
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="border-t bg-muted/30 py-24">
        <div className="container px-4">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              From idea to published campaign in minutes
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Five simple steps to create, optimize, and publish winning video content.
            </p>
          </div>
          <div className="mt-16 grid gap-8 md:grid-cols-5">
            <StepCard number={1} title="Define Goal" description="Enter your business objective, target audience, and brand guidelines." />
            <StepCard number={2} title="AI Strategizes" description="Creative Director generates 3 concepts with predicted CTR scores." />
            <StepCard number={3} title="Storyboard" description="Review and edit AI-generated multi-scene storyboards." />
            <StepCard number={4} title="Generate" description="Parallel video, voice, and music generation with brand compliance." />
            <StepCard number={5} title="Publish & Optimize" description="Direct API publishing with A/B testing and auto-optimization." />
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="border-t py-24">
        <div className="container px-4">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Simple, transparent pricing
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Start free, then buy credits when your campaign needs more momentum.
            </p>
          </div>
          <div className="mt-16 grid gap-8 md:grid-cols-3">
            <PricingCard
              name="Starter"
              price="$19"
              description="For first launches"
              features={["250 credits", "One-time purchase", "Storyboards & concepts", "Fast asset generation", "Simple campaign setup"]}
            />
            <PricingCard
              name="Pro"
              price="$49"
              description="For regular production"
              features={["1,000 credits", "Higher-volume output", "Premium quality renders", "Priority support", "Better campaign iteration"]}
              highlighted
            />
            <PricingCard
              name="Business"
              price="$149"
              description="For agencies & teams"
              features={["5,000 credits", "Team-ready workflow", "Advanced sequencing", "More automation", "Dedicated launch support"]}
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container px-4">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-vortex-500" />
              <span className="font-bold">VORTEX AI</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © 2026 VORTEX AI. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
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
    <div className="group rounded-xl border p-6 transition-all hover:border-vortex-500/50 hover:shadow-md">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-vortex-100 text-vortex-600 dark:bg-vortex-950 dark:text-vortex-400">
        {icon}
      </div>
      <h3 className="mb-2 text-lg font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
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
    <div className="text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-vortex-600 text-lg font-bold text-white">
        {number}
      </div>
      <h3 className="mb-2 font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
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
    <div
      className={`relative rounded-xl border p-6 transition-all ${
        highlighted
          ? "border-vortex-500 shadow-lg ring-1 ring-vortex-500"
          : "hover:border-vortex-500/50"
      }`}
    >
      {highlighted && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-vortex-600 px-3 py-1 text-xs font-medium text-white">
          Most Popular
        </div>
      )}
      <h3 className="text-lg font-semibold">{name}</h3>
      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-4xl font-bold">{price}</span>
        <span className="text-muted-foreground">/month</span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      <ul className="mt-6 space-y-3">
        {features.map((feature) => (
          <li key={feature} className="flex items-center gap-2 text-sm">
            <svg
              className="h-4 w-4 text-vortex-500"
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
          </li>
        ))}
      </ul>
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
    </div>
  );
}