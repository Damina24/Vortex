"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import toast from "react-hot-toast";
import axios from "axios";

type ProfileUser = {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
};

export function ProfileForm({ user }: { user: ProfileUser }) {
  const router = useRouter();
  const [name, setName] = useState(user.name ?? "");
  const [email, setEmail] = useState(user.email);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);

    try {
      await axios.patch("/api/v1/me", { name, email });
      toast.success("Profile updated");
      router.refresh();
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data?.error) {
        toast.error(error.response.data.error);
      } else {
        toast.error("Failed to update profile");
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="name" className="text-sm font-medium">
          Name
        </label>
        <input
          id="name"
          type="text"
          required
          minLength={2}
          maxLength={255}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="Your name"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="you@example.com"
        />
      </div>

      <button
        type="submit"
        disabled={isSaving}
        className="inline-flex items-center gap-2 rounded-lg bg-vortex-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-vortex-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
      >
        <Save className="h-4 w-4" />
        {isSaving ? "Saving..." : "Save changes"}
      </button>
    </form>
  );
}