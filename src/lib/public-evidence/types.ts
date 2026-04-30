export type PublicEvidenceStatus =
  | "queued"
  | "running"
  | "verified"
  | "partial"
  | "missing"
  | "error";

export type PublicEvidenceSourceType =
  | "github"
  | "personal_site"
  | "technical_blog"
  | "package_registry"
  | "stackoverflow"
  | "paper"
  | "talk"
  | "official_project_credit"
  | "company_engineering_blog"
  | "portfolio"
  | "other_professional";

export type PublicEvidenceStrength = "strong" | "medium" | "weak";

export type PublicEvidenceCandidateInput = {
  candidateId: string;
  searchId: string;
  userId: string;
  name: string;
  headline?: string | null;
  location?: string | null;
  profileUrl?: string | null;
  githubUrl?: string | null;
  metadata?: Record<string, unknown> | null;
  requiredSkills: string[];
};

export type PublicEvidenceSourceCandidate = {
  url: string;
  title: string | null;
  snippet: string | null;
  sourceType: PublicEvidenceSourceType;
  query: string | null;
  rankScore: number;
};

export type PublicEvidenceItem = {
  sourceType: PublicEvidenceSourceType;
  sourceUrl: string;
  title: string | null;
  snippet: string | null;
  identityStatus: "verified" | "rejected" | "uncertain";
  identityConfidence: number;
  relevanceScore: number;
  evidenceStrength: PublicEvidenceStrength;
  evidenceSummary: string;
  outreachAngle: string | null;
  rawMetadata: Record<string, unknown>;
};

export type PublicEvidenceResult = {
  status: PublicEvidenceStatus;
  score: number | null;
  items: PublicEvidenceItem[];
  sourceCounts: Partial<Record<PublicEvidenceSourceType, number>>;
  summary: string | null;
  lastEnrichedAt: string;
};
