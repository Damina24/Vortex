"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import axios from "axios";
import { Save } from "lucide-react";

export type ProjectSettingsValue = {
  id: string;
  name: string;
  description: string | null;
  objective: "conversion" | "awareness" | "engagement" | null;
  status: "draft" | "active" | "paused" | "completed" | "archived";
  targetPlatforms: string[];
  brandDnaId: string | null;
};

export type BrandProfileOption = {
  id: string;
  name: string;
};

const OBJECTIVES = [
  {
    value: "conversion",
    label: "Conversion",
    desc: "Drive sales & signups",
  },
  { value: "awareness", label: "Awareness", desc: "Build brand recognition" },
  { value: "engagement", label: "Engagement", desc: "Boost interactions" },
] as const;

const STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
] as const;

const inputClass =
  "w-full rounded-lg border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ProjectSettingsForm({
  project,
  brandProfiles = [],
}: {
  project: ProjectSettingsValue;
  brandProfiles?: BrandProfileOption[];
}) {
  const router = useRouter();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [objective, setObjective] = useState<
    "conversion" | "awareness" | "engagement"
  >(project.objective ?? "conversion");
  const [status, setStatus] = useState(project.status);
  const [brandDnaId, setBrandDnaId] = useState(project.brandDnaId ?? "");
  const [platformsInput, setPlatformsInput] = useState(
    project.targetPlatforms.join(", "),
  );
  const [isLoading, setIsLoading] = useState(false);
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);

    const targetPlatforms = platformsInput
      .split(",")
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean);

    try {
      const response = await axios.put(`/api/v1/projects/${project.id}`, {
        name,
        description: description.trim() || null,
        objective,
        status,
        brandDnaId: brandDnaId || null,
        targetPlatforms,
      });

      if (response.data.success) {
        toast.success("Settings saved");
        router.refresh();
      }
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response?.data?.error) {
        toast.error(error.response.data.error);
      } else {
        toast.error("Failed to save settings");
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-2xl space-y-6 rounded-2xl border bg-background p-6 shadow-sm"
    >
      <div className="space-y-2">
        <label htmlFor="name" className="text-sm font-medium">
          Project Name
        </label>
        <input
          id="name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="description" className="text-sm font-medium">
          Description
        </label>
        <textarea
          id="description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={`${inputClass} resize-none`}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Campaign Objective</label>
        <div className="grid grid-cols-3 gap-3">
          {OBJECTIVES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setObjective(option.value)}
              className={`rounded-lg border p-4 text-left transition-all ${
                objective === option.value
                  ? "border-vortex-500 bg-vortex-50 dark:bg-vortex-950"
                  : "hover:border-vortex-500/50"
              }`}
            >
              <p className="text-sm font-medium">{option.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {option.desc}
              </p>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="status" className="text-sm font-medium">
          Status
        </label>
        <select
          id="status"
          value={status}
          onChange={(e) =>
            setStatus(
              e.target.value as
                "draft" | "active" | "paused" | "completed" | "archived",
            )
          }
          className={inputClass}
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label htmlFor="platforms" className="text-sm font-medium">
          Target platforms
        </label>
        <input
          id="platforms"
          type="text"
          value={platformsInput}
          onChange={(e) => setPlatformsInput(e.target.value)}
          placeholder="youtube, tiktok, instagram"
          className={inputClass}
        />
        <p className="text-xs text-muted-foreground">
          Comma-separated platform slugs passed to the AI strategy engine.
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="brandDna" className="text-sm font-medium">
          Brand profile
        </label>
        <select
          id="brandDna"
          value={brandDnaId}
          onChange={(e) => setBrandDnaId(e.target.value)}
          className={inputClass}
        >
          <option value="">None — let the AI use defaults</option>
          {brandProfiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Assigned profiles auto-enrich AI strategy and prompt generation with
          your brand&apos;s look, voice, and compliance rules.{" "}
          <Link
            href="/dashboard/brand-dna"
            className="text-vortex-600 hover:text-vortex-500 font-medium"
          >
            Manage brand profiles
          </Link>
        </p>
      </div>

      <div className="flex items-center gap-4 pt-2">
        <button
          type="submit"
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-lg bg-vortex-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-vortex-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Save className="h-4 w-4" />
          {isLoading ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </form>
  );
}
