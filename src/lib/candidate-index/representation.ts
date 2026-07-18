import { generateLlmJson, getLightweightLlmModel, resolveDeepSeekThinkingMode } from "@/lib/llm-client";
import type { NormalizedProfile } from "@/lib/candidate-index/profile";

export type ProfileSemanticEvidence = {
  claim: string;
  experience_ref: string;
  detail: string;
};

export type ProfileRepresentation = {
  role_families: string[];
  adjacent_roles: string[];
  seniority: string;
  skills: string[];
  domains: string[];
  capabilities: string[];
  summary: string;
  evidence: ProfileSemanticEvidence[];
  experiences: Array<{
    experience_ref: string;
    domain: string | null;
    responsibilities: string[];
    technologies: string[];
  }>;
};

export const BASE_REPRESENTATION_MODEL = "deterministic-profile-v1";

export function buildBaseProfileRepresentation(profile: NormalizedProfile): ProfileRepresentation {
  const roleLabels = [
    profile.currentTitle,
    ...profile.experiences.map((experience) => experience.title),
  ].filter((value): value is string => Boolean(value?.trim()));
  return {
    role_families: [...new Set(roleLabels.map((value) => value.trim()))].slice(0, 6),
    adjacent_roles: [],
    seniority: "unknown",
    skills: [...new Set(profile.rawProfile.skills.map((value) => value.trim()).filter(Boolean))].slice(0, 30),
    domains: [],
    capabilities: [],
    summary: profile.rawProfile.about?.trim().slice(0, 2400) || "",
    evidence: [],
    experiences: profile.experiences.map((experience) => ({
      experience_ref: experience.ref,
      domain: null,
      responsibilities: [],
      technologies: [],
    })),
  };
}

export const PROFILE_REPRESENTATION_SCHEMA = {
  name: "candidate_profile_representation",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["role_families", "adjacent_roles", "seniority", "skills", "domains", "capabilities", "summary", "evidence", "experiences"],
    properties: {
    role_families: { type: "array", maxItems: 6, items: { type: "string" } },
    adjacent_roles: { type: "array", maxItems: 6, items: { type: "string" } },
    seniority: { type: "string" },
    skills: { type: "array", maxItems: 30, items: { type: "string" } },
    domains: { type: "array", maxItems: 12, items: { type: "string" } },
    capabilities: { type: "array", maxItems: 20, items: { type: "string" } },
    summary: { type: "string" },
    evidence: {
      type: "array",
      maxItems: 30,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["claim", "experience_ref", "detail"],
        properties: {
          claim: { type: "string" },
          experience_ref: { type: "string" },
          detail: { type: "string" },
        },
      },
    },
    experiences: {
      type: "array",
      maxItems: 30,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["experience_ref", "domain", "responsibilities", "technologies"],
        properties: {
          experience_ref: { type: "string" },
          domain: { type: ["string", "null"] },
          responsibilities: { type: "array", maxItems: 10, items: { type: "string" } },
          technologies: { type: "array", maxItems: 15, items: { type: "string" } },
        },
      },
    },
    },
  },
} as const;

const SYSTEM_PROMPT = `You extract reusable recruiting evidence from a LinkedIn profile.
Return only schema-valid JSON. Every skill, domain, and capability must be supported by profile text and tied to a supplied experience_ref in evidence. Repeat the exact skill, domain, or capability label in the related evidence claim or detail.
Do not infer responsibilities from title, employer prestige, or school prestige. Distinguish production ownership from brief exposure. Missing information is unknown, not negative.
This is not a candidate quality judgment and must not contain a JD match score.`;

function strings(value: unknown, limit: number) {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()))].slice(0, limit)
    : [];
}

export function validateProfileRepresentation(value: unknown, profile: NormalizedProfile): ProfileRepresentation {
  if (!value || typeof value !== "object") throw new Error("Profile representation is not an object");
  const record = value as Record<string, unknown>;
  const refs = new Set(profile.experiences.map((item) => item.ref));
  const evidence = Array.isArray(record.evidence) ? record.evidence.map((item) => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const experienceRef = typeof row.experience_ref === "string" ? row.experience_ref : "";
    if (!refs.has(experienceRef)) throw new Error(`Representation references unknown experience ${experienceRef}`);
    return { claim: String(row.claim || ""), experience_ref: experienceRef, detail: String(row.detail || "") };
  }).filter((item) => item.claim && item.detail) : [];
  const experiences = Array.isArray(record.experiences) ? record.experiences.map((item) => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const experienceRef = typeof row.experience_ref === "string" ? row.experience_ref : "";
    if (!refs.has(experienceRef)) throw new Error(`Representation references unknown experience ${experienceRef}`);
    return {
      experience_ref: experienceRef,
      domain: typeof row.domain === "string" ? row.domain : null,
      responsibilities: strings(row.responsibilities, 10),
      technologies: strings(row.technologies, 15),
    };
  }) : [];
  const evidenceText = evidence.map((item) => `${item.claim} ${item.detail}`.toLowerCase()).join("\n");
  const keepGrounded = (claims: string[]) =>
    claims.filter((claim) => evidenceText.includes(claim.toLowerCase()));
  const skills = keepGrounded(strings(record.skills, 30));
  const domains = keepGrounded(strings(record.domains, 12));
  const capabilities = keepGrounded(strings(record.capabilities, 20));
  const sourceCharacters =
    (profile.rawProfile.about?.length || 0) +
    profile.experiences.reduce((sum, experience) => sum + (experience.description?.length || 0), 0);
  if (sourceCharacters >= 200) {
    if (strings(record.role_families, 6).length === 0) {
      throw new Error("Substantive profile representation has no role family");
    }
    if (skills.length + capabilities.length === 0) {
      throw new Error("Substantive profile representation has no skills or capabilities");
    }
    if (evidence.length === 0) {
      throw new Error("Substantive profile representation has no evidence");
    }
  }
  return {
    role_families: strings(record.role_families, 6),
    adjacent_roles: strings(record.adjacent_roles, 6),
    seniority: typeof record.seniority === "string" ? record.seniority.trim() : "unknown",
    skills,
    domains,
    capabilities,
    summary: typeof record.summary === "string" ? record.summary.trim() : "",
    evidence,
    experiences,
  };
}

export async function generateProfileRepresentation(
  profile: NormalizedProfile,
  usage?: { searchId?: string; jobId?: string; userId?: string },
) {
  const model = process.env.SEARCH_LIGHT_MODEL || getLightweightLlmModel();
  const profilePayload = {
    name: profile.name,
    current_title: profile.currentTitle,
    about: profile.rawProfile.about,
    education: profile.rawProfile.education,
    experiences: profile.experiences.map((item) => ({
      experience_ref: item.ref,
      title: item.title,
      company: item.company,
      period: [item.startDate, item.isCurrent ? "Present" : item.endDate],
      description: item.description,
    })),
  };
  let repairReason: string | null = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const { data } = await generateLlmJson<ProfileRepresentation>({
        model,
        system: SYSTEM_PROMPT,
        prompt: JSON.stringify({
          output_contract: PROFILE_REPRESENTATION_SCHEMA.schema,
          ...profilePayload,
          ...(repairReason ? {
            repair_instruction: `The previous output failed: ${repairReason}. Re-read the supplied evidence and return a complete grounded representation.`,
          } : {}),
        }),
        maxOutputTokens: 8000,
        timeoutMs: 60_000,
        temperature: 0,
        jsonSchema: PROFILE_REPRESENTATION_SCHEMA,
        deepSeekThinking: resolveDeepSeekThinkingMode("SEARCH_PROFILE_REPRESENTATION_THINKING", "disabled"),
        usageEvent: { ...usage, stage: attempt === 1 ? "profile_representation" : "profile_representation_repair" },
      });
      return { representation: validateProfileRepresentation(data, profile), model };
    } catch (error) {
      repairReason = error instanceof Error ? error.message : String(error);
      if (attempt === 2) throw error;
    }
  }
  throw new Error("Profile representation repair exhausted");
}

export function buildProfileSearchDocument(profile: NormalizedProfile, representation: ProfileRepresentation) {
  return [
    `Primary and adjacent roles: ${[...representation.role_families, ...representation.adjacent_roles].join("; ") || "Unknown"}`,
    `Seniority and scope: ${representation.seniority}; ${profile.yearsExperience ?? "unknown"} years; ${representation.summary || "Unknown"}`,
    `Core capabilities: ${representation.capabilities.join("; ") || "Unknown"}`,
    `Technical evidence: ${representation.skills.join("; ") || "Unknown"}`,
    `Domains: ${representation.domains.join("; ") || "Unknown"}`,
    `Education: ${[profile.highestDegree, ...profile.fieldsOfStudy].filter(Boolean).join("; ") || "Unknown"}`,
    `Profile summary: ${representation.summary || "Unknown"}`,
    ...profile.experiences.slice(0, 6).map((experience) =>
      `Experience: ${experience.title || "Unknown"} at ${experience.company || "Unknown"}; ${(experience.description || "").slice(0, 800) || "No description"}`,
    ),
  ].join("\n");
}
