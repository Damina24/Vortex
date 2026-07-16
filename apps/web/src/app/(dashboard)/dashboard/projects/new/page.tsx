"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles, ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";
import axios from "axios";

export default function NewProjectPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    objective: "conversion" as "conversion" | "awareness" | "engagement",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await axios.post("/api/v1/projects", formData);

      if (response.data.success) {
        toast.success("Project created successfully!");
        router.push(`/dashboard/projects/${response.data.data.id}`);
      }
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response?.data?.error) {
        toast.error(error.response.data.error);
      } else {
        toast.error("Failed to create project");
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <Link
          href="/dashboard/projects"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Projects
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Start a new campaign</h1>
        <p className="text-muted-foreground">
          Give your campaign a clear goal and VORTEX AI will help you shape the creative direction from there.
        </p>
      </div>

      <div className="rounded-2xl border border-vortex-200 bg-vortex-50 p-5 dark:border-vortex-900/60 dark:bg-vortex-950/30">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-vortex-600" />
          <p className="text-sm font-semibold text-vortex-700 dark:text-vortex-400">Suggested starter</p>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Try a launch theme like “Summer product drop” or “Q3 awareness push” to see how the workflow comes together.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <label htmlFor="name" className="text-sm font-medium">
            Project Name
          </label>
          <input
            id="name"
            type="text"
            required
            value={formData.name}
            onChange={(e) =>
              setFormData({ ...formData, name: e.target.value })
            }
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Summer product launch"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="description" className="text-sm font-medium">
            Description
          </label>
          <textarea
            id="description"
            rows={3}
            value={formData.description}
            onChange={(e) =>
              setFormData({ ...formData, description: e.target.value })
            }
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            placeholder="Describe the audience, offer, and the kind of story you want to tell..."
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Campaign Objective</label>
          <div className="grid grid-cols-3 gap-3">
            {[
              { value: "conversion", label: "Conversion", desc: "Drive sales & signups" },
              { value: "awareness", label: "Awareness", desc: "Build brand recognition" },
              { value: "engagement", label: "Engagement", desc: "Boost interactions" },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() =>
                  setFormData({
                    ...formData,
                    objective: option.value as "conversion" | "awareness" | "engagement",
                  })
                }
                className={`rounded-lg border p-4 text-left transition-all ${
                  formData.objective === option.value
                    ? "border-vortex-500 bg-vortex-50 dark:bg-vortex-950"
                    : "hover:border-vortex-500/50"
                }`}
              >
                <p className="font-medium text-sm">{option.label}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {option.desc}
                </p>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border bg-muted/40 p-4">
          <p className="text-sm font-medium">Next steps after you create the project</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Review the generated creative direction</li>
            <li>Build a storyboard around the campaign objective</li>
            <li>Use credits to turn the concept into assets</li>
          </ul>
        </div>

        <div className="flex items-center gap-4 pt-4">
          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-vortex-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-vortex-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? "Creating..." : "Create Project"}
          </button>
          <Link
            href="/dashboard/projects"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}