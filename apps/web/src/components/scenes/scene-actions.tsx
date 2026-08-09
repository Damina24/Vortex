"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import axios from "axios";

/**
 * Edit/delete actions for a scene row. Deletes call the scenes API and then
 * refresh the current route so the list and storyboard duration stay in sync.
 */
export function SceneActions({
  sceneId,
  storyboardId,
}: {
  sceneId: string;
  storyboardId: string;
}) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    if (!window.confirm("Delete this scene? This cannot be undone.")) {
      return;
    }

    setIsDeleting(true);
    try {
      await axios.delete(`/api/v1/scenes/${sceneId}`);
      toast.success("Scene deleted");
      router.refresh();
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data?.error) {
        toast.error(error.response.data.error);
      } else {
        toast.error("Failed to delete scene");
      }
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href={`/dashboard/storyboards/${storyboardId}/scenes/${sceneId}/edit`}
        className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:border-vortex-500/50 hover:text-foreground transition-colors"
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit
      </Link>
      <button
        type="button"
        onClick={handleDelete}
        disabled={isDeleting}
        className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:border-red-300 hover:bg-red-50 disabled:opacity-50 transition-colors dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/50"
      >
        <Trash2 className="h-3.5 w-3.5" />
        {isDeleting ? "Deleting..." : "Delete"}
      </button>
    </div>
  );
}