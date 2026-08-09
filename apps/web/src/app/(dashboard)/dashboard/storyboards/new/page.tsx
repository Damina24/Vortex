"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import toast from "react-hot-toast";
import axios from "axios";

export default function NewStoryboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") || "";
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    projectId,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (!formData.projectId) {
        toast.error("Project ID is required");
        return;
      }

      const response = await axios.post("/api/v1/storyboards", {
        name: formData.name,
        projectId: formData.projectId,
      });

      if (response.data.success) {
        toast.success("Storyboard created successfully!");
        router.push(`/dashboard/storyboards/${response.data.data.id}`);
      }
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response?.data?.error) {
        toast.error(error.response.data.error);
      } else {
        toast.error("Failed to create storyboard");
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <Link
          href="/dashboard/storyboards"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Storyboards
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">New Storyboard</h1>
        <p className="text-muted-foreground">
          Create a storyboard to plan your video scenes and shots.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <label htmlFor="name" className="text-sm font-medium">
            Storyboard Name
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
            placeholder="Product launch storyboard"
          />
        </div>

        {!projectId && (
          <div className="space-y-2">
            <label htmlFor="projectId" className="text-sm font-medium">
              Project ID
            </label>
            <input
              id="projectId"
              type="text"
              required
              value={formData.projectId}
              onChange={(e) =>
                setFormData({ ...formData, projectId: e.target.value })
              }
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="UUID of the project"
            />
            <p className="text-xs text-muted-foreground">
              Provide the project UUID this storyboard belongs to.
            </p>
          </div>
        )}

        <div className="rounded-xl border bg-muted/40 p-4">
          <p className="text-sm font-medium">Next steps after creation</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Add scenes to define your story flow</li>
            <li>Set camera directions and prompts</li>
            <li>Generate assets using credits</li>
          </ul>
        </div>

        <div className="flex items-center gap-4 pt-4">
          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-vortex-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-vortex-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Plus className="h-4 w-4" />
            {isLoading ? "Creating..." : "Create Storyboard"}
          </button>
          <Link
            href="/dashboard/storyboards"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}