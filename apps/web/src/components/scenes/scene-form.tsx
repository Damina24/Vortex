"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Save } from "lucide-react";
import toast from "react-hot-toast";
import axios from "axios";

type SceneInput = {
  id: string;
  orderIndex: number;
  duration: number;
  prompt: string;
  negativePrompt: string | null;
  cameraDirection: unknown;
  aspectRatio: string;
};

/**
 * Shared create/edit form for scenes. Renders an empty form when `scene` is
 * omitted (new scene), or a pre-filled form when `scene` is provided (edit).
 */
export function SceneForm({
  storyboardId,
  scene,
}: {
  storyboardId: string;
  scene?: SceneInput | null;
}) {
  const router = useRouter();
  const isEdit = Boolean(scene);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    orderIndex: scene?.orderIndex ?? 0,
    duration: scene?.duration ?? 5,
    prompt: scene?.prompt ?? "",
    negativePrompt: scene?.negativePrompt ?? "",
    cameraDirection: (scene?.cameraDirection as Record<string, unknown>) ?? {},
    aspectRatio: scene?.aspectRatio ?? "16:9",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);

    try {
      const payload = {
        orderIndex: Number(formData.orderIndex),
        duration: Number(formData.duration),
        prompt: formData.prompt,
        negativePrompt: formData.negativePrompt || undefined,
        cameraDirection:
          Object.keys(formData.cameraDirection).length > 0
            ? formData.cameraDirection
            : undefined,
        aspectRatio: formData.aspectRatio,
      };

      if (scene) {
        await axios.patch(`/api/v1/scenes/${scene.id}`, payload);
        toast.success("Scene updated successfully!");
      } else {
        const response = await axios.post("/api/v1/scenes", {
          ...payload,
          storyboardId,
        });
        if (response.data.success) {
          toast.success("Scene created successfully!");
        }
      }

      router.push(`/dashboard/storyboards/${storyboardId}`);
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response?.data?.error) {
        toast.error(error.response.data.error);
      } else {
        toast.error(isEdit ? "Failed to update scene" : "Failed to create scene");
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="orderIndex" className="text-sm font-medium">
            Scene Order
          </label>
          <input
            id="orderIndex"
            type="number"
            min={0}
            required
            value={formData.orderIndex}
            onChange={(e) =>
              setFormData({
                ...formData,
                orderIndex: parseInt(e.target.value || "0", 10),
              })
            }
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="text-xs text-muted-foreground">
            Position in the storyboard sequence.
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="duration" className="text-sm font-medium">
            Duration (seconds)
          </label>
          <input
            id="duration"
            type="number"
            min={1}
            required
            value={formData.duration}
            onChange={(e) =>
              setFormData({
                ...formData,
                duration: parseInt(e.target.value || "5", 10),
              })
            }
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="text-xs text-muted-foreground">
            How long the scene should play.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="prompt" className="text-sm font-medium">
          Scene Prompt
        </label>
        <textarea
          id="prompt"
          rows={4}
          required
          value={formData.prompt}
          onChange={(e) =>
            setFormData({ ...formData, prompt: e.target.value })
          }
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
          placeholder="A cinematic drone shot over a mountain valley at sunrise..."
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="negativePrompt" className="text-sm font-medium">
          Negative Prompt
        </label>
        <textarea
          id="negativePrompt"
          rows={3}
          value={formData.negativePrompt}
          onChange={(e) =>
            setFormData({ ...formData, negativePrompt: e.target.value })
          }
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
          placeholder="Blurry footage, poor lighting, distorted text"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="aspectRatio" className="text-sm font-medium">
          Aspect Ratio
        </label>
        <select
          id="aspectRatio"
          value={formData.aspectRatio}
          onChange={(e) =>
            setFormData({ ...formData, aspectRatio: e.target.value })
          }
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="16:9">16:9 (Widescreen)</option>
          <option value="9:16">9:16 (Vertical)</option>
          <option value="4:5">4:5 (Portrait)</option>
          <option value="1:1">1:1 (Square)</option>
        </select>
      </div>

      <div className="rounded-xl border bg-muted/40 p-4">
        <p className="text-sm font-medium">Camera Direction</p>
        <p className="text-xs text-muted-foreground mt-1">
          Optional JSON for shot type, movement, and framing. Keep it simple for now.
        </p>
      </div>

      <div className="flex items-center gap-4 pt-4">
        <button
          type="submit"
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-lg bg-vortex-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-vortex-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isEdit ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {isLoading
            ? isEdit
              ? "Saving..."
              : "Adding..."
            : isEdit
              ? "Save Changes"
              : "Add Scene"}
        </button>
        <Link
          href={`/dashboard/storyboards/${storyboardId}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}