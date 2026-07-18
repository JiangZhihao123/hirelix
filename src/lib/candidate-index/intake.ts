import type { BrightDataProfile } from "@/lib/brightdata";
import { generateLlmJson, getLightweightLlmModel } from "@/lib/llm-client";
import { runWithConcurrency } from "@/lib/search/concurrency";

export type ProfileIntakeDecision = "advance" | "maybe" | "reject" | "incomplete";

export type ProfileIntakeReview = {
  index: number;
  decision: ProfileIntakeDecision;
  evidence: string[];
  risks: string[];
  missingInformation: string[];
  reason: string;
  model: string | null;
};

const PROFILE_INTAKE_SCHEMA = {
  name: "candidate_profile_intake",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["decision", "evidence", "risks", "missing_information", "reason"],
    properties: {
      decision: { type: "string", enum: ["advance", "maybe", "reject", "incomplete"] },
      evidence: { type: "array", maxItems: 8, items: { type: "string" } },
      risks: { type: "array", maxItems: 8, items: { type: "string" } },
      missing_information: { type: "array", maxItems: 8, items: { type: "string" } },
      reason: { type: "string" },
    },
  },
} as const;

function strings(value: unknown, limit = 8) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()).slice(0, limit)
    : [];
}

export function precheckBrightProfile(profile: BrightDataProfile): ProfileIntakeReview | null {
  if (!profile.linkedin_id && !profile.url) {
    return {
      index: -1,
      decision: "incomplete",
      evidence: [],
      risks: [],
      missingInformation: ["Missing LinkedIn identity"],
      reason: "Profile cannot be deduplicated or reused without a LinkedIn identity.",
      model: null,
    };
  }
  if (!profile.name?.trim() || profile.experience.length === 0) {
    return {
      index: -1,
      decision: "incomplete",
      evidence: [],
      risks: [],
      missingInformation: [
        ...(!profile.name?.trim() ? ["Missing candidate name"] : []),
        ...(profile.experience.length === 0 ? ["Missing work experience"] : []),
      ],
      reason: "Profile lacks the minimum data required for JD-aware review.",
      model: null,
    };
  }
  return null;
}

function intakePrompt(profile: BrightDataProfile) {
  return {
    name: profile.name,
    headline: profile.headline,
    about: profile.about,
    location: { city: profile.city, country: profile.country_code },
    current_company: profile.current_company,
    skills: profile.skills.slice(0, 30),
    education: profile.education.slice(0, 6),
    experiences: profile.experience.slice(0, 12).map((item) => ({
      title: item.title,
      company: item.company,
      duration: item.duration,
      location: item.location,
      description: item.description?.slice(0, 1600) || null,
    })),
  };
}

async function defaultJudgeProfile(
  jd: Record<string, unknown>,
  profile: BrightDataProfile,
  usage: { searchId: string; jobId: string; userId: string },
): Promise<Omit<ProfileIntakeReview, "index">> {
  const model = process.env.SEARCH_LIGHT_MODEL || getLightweightLlmModel();
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const { data } = await generateLlmJson<Record<string, unknown>>({
        model,
        system: "Return JSON matching output_contract. Decide whether this complete Bright profile belongs in the searchable pool for this specific JD. Use concrete work-experience evidence, not headline keyword stuffing, employer prestige, school prestige, or title similarity alone. advance requires direct or clearly equivalent recent work. maybe means plausible but evidence is incomplete. reject requires a supported role, scope, location, or must-have mismatch. incomplete means the profile lacks enough real work-history data to judge. Unknown information is not rejection evidence.",
        prompt: JSON.stringify({
          output_contract: PROFILE_INTAKE_SCHEMA.schema,
          jd,
          profile: intakePrompt(profile),
        }),
        maxOutputTokens: 1800,
        timeoutMs: 90_000,
        temperature: 0,
        jsonSchema: PROFILE_INTAKE_SCHEMA,
        deepSeekThinking: "disabled",
        usageEvent: { ...usage, stage: "profile_intake" },
      });
      const decision = data.decision === "advance" || data.decision === "maybe" || data.decision === "reject"
        ? data.decision
        : "incomplete";
      return {
        decision,
        evidence: strings(data.evidence),
        risks: strings(data.risks),
        missingInformation: strings(data.missing_information),
        reason: typeof data.reason === "string" ? data.reason : "",
        model,
      };
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw lastError;
}

export async function screenBrightProfilesForIndex(params: {
  jd: Record<string, unknown>;
  profiles: BrightDataProfile[];
  usage: { searchId: string; jobId: string; userId: string };
  limit?: number;
  judgeProfile?: typeof defaultJudgeProfile;
}) {
  const limit = Math.max(1, Math.min(500, params.limit ?? 120));
  const concurrency = Math.max(1, Math.min(48, Number(process.env.SEARCH_INTAKE_CONCURRENCY || 32)));
  const indexedProfiles = params.profiles.map((profile, index) => ({ profile, index }));
  const reviews = await runWithConcurrency(indexedProfiles, concurrency, async ({ profile, index }) => {
    const precheck = precheckBrightProfile(profile);
    const review = precheck ?? await (params.judgeProfile || defaultJudgeProfile)(params.jd, profile, params.usage);
    return { ...review, index };
  });
  const selectedIndexes = ["advance", "maybe"].flatMap((decision) =>
    reviews.filter((review) => review.decision === decision).map((review) => review.index),
  ).slice(0, limit);
  const selectedSet = new Set(selectedIndexes);
  const counts = reviews.reduce<Record<ProfileIntakeDecision, number>>((result, review) => {
    result[review.decision] += 1;
    return result;
  }, { advance: 0, maybe: 0, reject: 0, incomplete: 0 });
  return {
    selectedProfiles: params.profiles.filter((_profile, index) => selectedSet.has(index)),
    reviews,
    metrics: {
      reviewed_count: reviews.length,
      selected_count: selectedIndexes.length,
      ...counts,
    },
  };
}
