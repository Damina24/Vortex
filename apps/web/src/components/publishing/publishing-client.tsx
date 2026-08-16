"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import toast from "react-hot-toast";
import {
  Send,
  Loader2,
  ExternalLink,
  Megaphone,
  Youtube,
  Music2,
  Globe,
  FlaskConical,
} from "lucide-react";
import { AbTestingPanel } from "./ab-testing-panel";

type ProjectOption = { id: string; name: string };
type AssetOption = {
  id: string;
  name: string;
  url: string;
  mimeType: string | null;
  duration: number | null;
};
type PublishedCampaign = {
  id: string;
  name: string;
  platform: string;
  status: string;
  platformCampaignId: string | null;
  createdAt: string;
  project: { id: string; name: string };
  variants: {
    id: string;
    asset: { id: string; url: string; name: string } | null;
  }[];
};

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  meta: "Meta",
  google: "Google",
  organic: "Organic",
};

const inputClass =
  "w-full rounded-lg border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function PlatformIcon({ platform }: { platform: string }) {
  switch (platform) {
    case "youtube":
      return <Youtube className="h-4 w-4" />;
    case "tiktok":
    case "meta":
      return <Music2 className="h-4 w-4" />;
    default:
      return <Globe className="h-4 w-4" />;
  }
}

export function PublishingClient() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [campaigns, setCampaigns] = useState<PublishedCampaign[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);

  const [projectId, setProjectId] = useState("");
  const [assetId, setAssetId] = useState("");
  const [platform, setPlatform] = useState<
    "youtube" | "tiktok" | "meta" | "google" | "organic"
  >("youtube");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<
    "public" | "unlisted" | "private"
  >("private");
  const [tagsInput, setTagsInput] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [abCampaignId, setAbCampaignId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [projRes, campRes] = await Promise.all([
          axios.get("/api/v1/projects?page=1&pageSize=100"),
          axios.get("/api/v1/publishing?page=1&pageSize=50"),
        ]);
        setProjects(projRes.data.data ?? []);
        setCampaigns(campRes.data.data ?? []);
      } catch {
        toast.error("Failed to load publishing data");
      } finally {
        setLoadingCampaigns(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!projectId) {
      setAssets([]);
      setAssetId("");
      return;
    }
    setAssets([]);
    setAssetId("");
    axios
      .get(`/api/v1/projects/${projectId}/assets`)
      .then((res) => setAssets(res.data.data ?? []))
      .catch(() => toast.error("Failed to load assets"));
  }, [projectId]);

  async function handlePublish(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || !assetId) {
      toast.error("Select a project and an asset");
      return;
    }
    setIsPublishing(true);
    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const { data } = await axios.post("/api/v1/publishing", {
        projectId,
        assetId,
        platform,
        title: title.trim(),
        description: description.trim(),
        tags,
        visibility,
      });
      toast.success(
        `Published to ${PLATFORM_LABELS[platform] ?? platform} (${
          data.data?.published?.platformId ?? ""
        })`,
      );
      setTitle("");
      setDescription("");
      setTagsInput("");
      router.refresh();
      const campRes = await axios.get("/api/v1/publishing?page=1&pageSize=50");
      setCampaigns(campRes.data.data ?? []);
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.error
        : undefined;
      toast.error(message || "Publishing failed");
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Publish form */}
      <form
        onSubmit={handlePublish}
        className="rounded-2xl border bg-background p-6 shadow-sm max-w-2xl"
      >
        <div className="flex items-center gap-2 mb-6">
          <Megaphone className="h-5 w-5 text-vortex-500" />
          <h2 className="text-lg font-semibold">Publish a video</h2>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Project</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className={inputClass}
            >
              <option value="">Select project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Asset (video)</label>
            <select
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
              className={inputClass}
              disabled={!projectId}
            >
              <option value="">
                {projectId ? "Select an asset" : "Select a project first"}
              </option>
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.duration ? ` · ${a.duration}s` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Platform</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as typeof platform)}
              className={inputClass}
            >
              <option value="youtube">YouTube</option>
              <option value="tiktok">TikTok</option>
              <option value="meta">Meta</option>
              <option value="google">Google</option>
              <option value="organic">Organic</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Visibility</label>
            <select
              value={visibility}
              onChange={(e) =>
                setVisibility(e.target.value as typeof visibility)
              }
              className={inputClass}
            >
              <option value="private">Private (draft)</option>
              <option value="unlisted">Unlisted</option>
              <option value="public">Public</option>
            </select>
          </div>
        </div>

        <div className="mt-5 space-y-2">
          <label className="text-sm font-medium">Title</label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Q3 launch teaser"
            className={inputClass}
          />
        </div>

        <div className="mt-5 space-y-2">
          <label className="text-sm font-medium">Description</label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the video…"
            className={inputClass}
          />
        </div>

        <div className="mt-5 space-y-2">
          <label className="text-sm font-medium">Tags</label>
          <input
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="launch, teaser, product"
            className={inputClass}
          />
          <p className="text-xs text-muted-foreground">Comma-separated</p>
        </div>

        <button
          type="submit"
          disabled={isPublishing}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-vortex-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-vortex-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPublishing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {isPublishing ? "Publishing…" : "Publish"}
        </button>
      </form>

      {/* Published list */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Published campaigns</h2>
        {loadingCampaigns ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : campaigns.length === 0 ? (
          <div className="rounded-xl border border-dashed p-10 text-center">
            <Send className="mx-auto h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">
              Nothing published yet. Fill in the form above to publish your
              first video.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {campaigns.map((c) => (
              <div key={c.id}>
                <div className="flex items-start justify-between rounded-xl border p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <PlatformIcon platform={c.platform} />
                      <h3 className="truncate font-semibold">{c.name}</h3>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {PLATFORM_LABELS[c.platform] ?? c.platform} ·{" "}
                      {c.project.name} ·{" "}
                      {new Date(c.createdAt).toLocaleDateString()}
                    </p>
                    {c.platformCampaignId && (
                      <p className="mt-1 text-xs text-muted-foreground/70">
                        Platform id: {c.platformCampaignId}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                        c.status === "active"
                          ? "bg-green-100 text-green-700 dark:bg-green-950"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {c.status}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setAbCampaignId(abCampaignId === c.id ? null : c.id)
                      }
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:border-vortex-500/50 hover:text-foreground transition-colors ${
                        abCampaignId === c.id
                          ? "border-vortex-500/50 text-vortex-600"
                          : ""
                      }`}
                    >
                      <FlaskConical className="h-3.5 w-3.5" />
                      {abCampaignId === c.id ? "Hide" : "A/B test"}
                    </button>
                    {c.variants[0]?.asset?.url && (
                      <a
                        href={c.variants[0].asset.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:border-vortex-500/50 hover:text-foreground transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> View
                      </a>
                    )}
                  </div>
                </div>
                {abCampaignId === c.id && (
                  <div className="mt-3">
                    <AbTestingPanel campaignId={c.id} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default PublishingClient;
