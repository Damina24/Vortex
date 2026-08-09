"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import axios from "axios";

type ProfileUser = {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
};

export function AvatarUpload({ user }: { user: ProfileUser }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("avatar", file);
      await axios.post("/api/v1/me/avatar", formData);
      toast.success("Avatar updated");
      router.refresh();
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data?.error) {
        toast.error(error.response.data.error);
      } else {
        toast.error("Failed to upload avatar");
      }
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border bg-muted">
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatarUrl}
            alt={user.name || "Avatar"}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-lg font-bold uppercase text-muted-foreground">
            {user.email?.charAt(0) ?? "U"}
          </div>
        )}
      </div>
      <div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium text-muted-foreground hover:border-vortex-500/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Camera className="h-4 w-4" />
          )}
          {uploading ? "Uploading..." : "Change avatar"}
        </button>
        <p className="mt-1.5 text-xs text-muted-foreground">
          JPG, PNG, WebP, or GIF under 2MB.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={handleFile}
        />
      </div>
    </div>
  );
}