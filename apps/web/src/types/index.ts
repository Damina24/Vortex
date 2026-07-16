// VORTEX AI — Shared TypeScript Type Definitions

// ============================================================
// Auth Types
// ============================================================

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: "creator" | "admin" | "viewer";
  subscriptionTier: "free" | "creator" | "pro" | "team" | "enterprise";
  creditsBalance: number;
}

// ============================================================
// Brand DNA Types
// ============================================================

export interface BrandVisualIdentity {
  primary: string[];
  secondary: string[];
  forbidden: string[];
}

export interface BrandTypography {
  headingFont: string;
  bodyFont: string;
  minSizePx: number;
}

export interface BrandLogo {
  variants: AssetRef[];
  placementRules: "top_left" | "bottom_right" | "custom";
  minSizePercent: number;
}

export interface BrandVoice {
  adjectives: string[];
  forbiddenWords: string[];
  sentenceStructure: "short_punchy" | "descriptive" | "technical";
}

export interface BrandCharacter {
  referenceImages: AssetRef[];
  ageRange: string;
  style: "photorealistic" | "illustrated" | "3d";
  consistencyRules: string;
}

export interface BrandCompliance {
  requiredDisclaimers: string[];
  industry: "health" | "finance" | "general" | "alcohol";
  regionalRules: Record<string, string[]>;
}

export interface BrandDNAData {
  id: string;
  name: string;
  ownerId: string;
  colors: BrandVisualIdentity;
  typography: BrandTypography;
  logo: BrandLogo;
  voice: BrandVoice;
  characters?: BrandCharacter;
  compliance: BrandCompliance;
}

// ============================================================
// Storyboard Types
// ============================================================

export interface StoryboardData {
  id: string;
  projectId: string;
  name: string;
  scenes: SceneData[];
  transitions: TransitionData[];
  soundtrack?: AudioTrackData;
  totalDuration: number;
  status: "draft" | "active" | "generating" | "completed" | "failed";
}

export interface SceneData {
  id: string;
  order: number;
  duration: number;
  prompt: string;
  negativePrompt?: string;
  cameraDirection?: CameraDirection;
  aspectRatio: "9:16" | "16:9" | "1:1" | "4:5";
  styleReference?: AssetRef;
  characterRefs?: AssetRef[];
  generatedVideo?: AssetRef;
  status: "pending" | "generating" | "completed" | "failed";
}

export interface CameraDirection {
  shot: string;
  movement: string;
  angle: string;
  lens: string;
}

export interface TransitionData {
  fromSceneId: string;
  toSceneId: string;
  type: "cut" | "fade" | "dissolve" | "wipe" | "match_cut";
  duration: number;
}

export interface AudioTrackData {
  id: string;
  type: "voiceover" | "music" | "sfx";
  url: string;
  duration: number;
  volume: number;
}

// ============================================================
// Asset Types
// ============================================================

export interface AssetRef {
  id: string;
  url: string;
  thumbnailUrl?: string;
  type: "video" | "image" | "audio" | "document";
  name: string;
  mimeType?: string;
  sizeBytes?: number;
  duration?: number;
  width?: number;
  height?: number;
}

// ============================================================
// AI Creative Director Types
// ============================================================

export interface CreativeDirectorInput {
  objective: string;
  targetAudience: {
    ageRange: string;
    gender: string;
    interests: string[];
    location: string;
  };
  productUrl: string;
  budgetTier: "low" | "mid" | "high";
  platforms: string[];
  brandVoice: string;
  desiredOutcome: "conversion" | "awareness" | "engagement";
  kpiTarget?: string;
}

export interface CreativeDirectorOutput {
  campaignId: string;
  strategy: {
    hookAnalysis: string;
    creativeConcepts: CreativeConcept[];
    abTestPlan: ABTestPlan;
  };
}

export interface CreativeConcept {
  conceptId: string;
  name: string;
  description: string;
  predictedCtr: number;
  confidence: number;
  scenes: ConceptScene[];
}

export interface ConceptScene {
  sceneId: string;
  duration: number;
  prompt: string;
  camera: string;
  audio: string;
}

export interface ABTestPlan {
  variants: number;
  testDuration: string;
  budgetSplit: string;
}

// ============================================================
// Campaign Types
// ============================================================

export interface CampaignData {
  id: string;
  projectId: string;
  name: string;
  platform: string;
  status: "draft" | "active" | "paused" | "completed" | "archived";
  budget: number;
  spent: number;
  startDate?: string;
  endDate?: string;
  targetingConfig: Record<string, unknown>;
  variants: CampaignVariantData[];
}

export interface CampaignVariantData {
  id: string;
  variantName: string;
  videoId: string;
  weight: number;
  hypothesis: string;
  isWinner: boolean;
  performanceMetrics: Record<string, unknown>;
}

export interface PublishingTarget {
  platform: "meta_ads" | "tiktok_ads" | "youtube_ads" | "google_ads" | "organic";
  accountId: string;
  campaignSettings: {
    objective: "conversions" | "awareness" | "engagement";
    budget: number;
    durationDays: number;
    audience: AudienceTargeting;
  };
}

export interface AudienceTargeting {
  ageRange?: string;
  gender?: string;
  interests?: string[];
  locations?: string[];
  customAudiences?: string[];
}

// ============================================================
// API Response Types
// ============================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface GenerationJobResponse {
  jobId: string;
  status: "queued" | "processing" | "completed" | "failed" | "cancelled";
  creditsConsumed: number;
  outputAssets: AssetRef[];
  errorMessage?: string;
}

// ============================================================
// Analytics Types
// ============================================================

export interface PerformanceMetrics {
  impressions: number;
  clicks: number;
  ctr: number;
  conversions: number;
  conversionRate: number;
  roas: number;
  costPerConversion: number;
  spend: number;
}

export interface PerformancePrediction {
  predictedCtr: number;
  confidence: number;
  tier: "poor" | "fair" | "good" | "excellent";
  suggestions: string[];
}

// ============================================================
// Team Types
// ============================================================

export interface TeamData {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  memberCount: number;
  subscriptionTier: string;
  createdAt: string;
}

export interface TeamMemberData {
  id: string;
  userId: string;
  email: string;
  name: string;
  avatarUrl?: string;
  role: "owner" | "admin" | "editor" | "viewer";
  joinedAt: string;
}