"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pencil, Trash2, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import axios from "axios";

/**
 * Edit + delete actions shown on each brand profile card. Delete confirms
 * before calling the API so an accidental click can't wipe a profile.
 */
export function BrandDnaCardActions({ id }: { id: string }) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    if (!window.confirm("Delete this brand profile? Projects using it will keep their data but lose the brand assignment.")) {
      return;
    }
    setIsDeleting(true);
    try {
      await axios.delete(`/api/v1/brand-dna/${id}`);
      toast.success("Brand profile deleted");
      router.refresh();
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data?.error) {
        toast.error(error.response.data.error);
      } else {
        toast.error("Failed to delete brand profile");
      }
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href={`/dashboard/brand-dna/${id}/edit`}
        className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:border-vortex-500/50 hover:text-foreground transition-colors"
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit
      </Link>
      <button
        type="button"
        onClick={handleDelete}
        disabled={isDeleting}
        className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium text-red-600 hover:border-red-500/50 hover:bg-red-50 disabled:opacity-50 transition-colors dark:hover:bg-red-950"
      >
        {isDeleting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" />
        )}
        Delete
      </button>
    </div>
  );
}