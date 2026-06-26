import {
  generateLlmJson,
  getDefaultLlmModel,
  getLlmApiKey,
  resolveDeepSeekThinkingMode,
} from "@/lib/llm-client";
import { JD_SEARCH_INTENT_PROMPT } from "@/lib/prompts";

const COMMON_SKILLS = [
  "TypeScript",
  "JavaScript",
  "React",
  "Next.js",
  "Node.js",
  "Python",
  "Java",
  "Go",
  "Rust",
  "Ruby",
  "Rails",
  "PostgreSQL",
  "MySQL",
  "MongoDB",
  "Redis",
  "GraphQL",
  "REST API",
  "AWS",
  "GCP",
  "Azure",
  "Docker",
  "Kubernetes",
  "Terraform",
  "CI/CD",
  "Microservices",
  "Distributed Systems",
  "System Design",
  "Kafka",
  "Spark",
  "Airflow",
  "LLM",
  "AI Agent",
  "LangChain",
  "Prompt Engineering",
  "Machine Learning",
  "Data Engineering",
  "Observability",
  "DevOps",
  "SRE",
  "Backend",
  "Frontend",
  "Full Stack",
];

type ParsedSearchIntent = {
  title?: unknown;
  hiring_brief?: unknown;
  headhunter_brief?: unknown;
  sourcing_plan?: unknown;
  recall_iterations?: unknown;
  recall_spec?: unknown;
  advancement_rubric?: unknown;
  required_skills?: unknown;
  nice_to_have_skills?: unknown;
  location?: unknown;
  experience_years_min?: unknown;
  parse_origin?: unknown;
  user_clarification?: unknown;
};

type LaunchOptions = {
  candidateCount: number;
  displayCount: number;
  highlightCount: number;
  outreachPoolTarget: number;
  planCode: string;
  executionProfile: string;
  requestedCandidateCount?: number;
  profileScanBudget?: number;
};

type ParseJobDescriptionOptions = {
  populateTargetCompanies?: boolean;
};

export type ParsedJobSummary = {
  title: string;
  requiredSkills: string[];
  niceToHaveSkills: string[];
  experienceYearsMin: number | null;
  workModel: "onsite" | "hybrid" | "remote" | "unknown";
  locationScope: string | null;
  locationFlexibility: "strict" | "moderate" | "flexible";
  relocationAllowed: "yes" | "no" | "unknown";
  mustHaveConstraints: string[];
  softConstraints: string[];
  constraintReasoning: string | null;
};

function normalizeNullableString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeStringArray(value: unknown, maxItems: number) {
  if (!Array.isArray(value)) return [];
  const deduped = new Set<string>();

  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    deduped.add(trimmed);
    if (deduped.size >= maxItems) break;
  }

  return Array.from(deduped);
}

function normalizeEnumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" && allowed.includes(value as T)
    ? (value as T)
    : fallback;
}

function inferLaneKind(
  value: unknown,
  strategy: "title" | "skill" | "seniority" | "company",
) {
  if (
    value === "primary_exact" ||
    value === "primary_relaxed" ||
    value === "target_company_engineering" ||
    value === "adjacent_authorized" ||
    value === "exploration"
  ) {
    return value;
  }
  if (strategy === "company") return "target_company_engineering";
  if (strategy === "skill" || strategy === "seniority") return "primary_relaxed";
  return "primary_exact";
}

function normalizeBudget(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(1, Math.round(value))
    : fallback;
}

function defaultInitialBudget(laneKind: string) {
  if (laneKind === "primary_exact") return 35;
  if (laneKind === "primary_relaxed") return 15;
  if (laneKind === "exploration") return 10;
  if (laneKind === "target_company_engineering") return 25;
  return 15;
}

function defaultMaxBudget(laneKind: string) {
  if (laneKind === "primary_exact") return 150;
  if (laneKind === "primary_relaxed") return 80;
  if (laneKind === "exploration") return 15;
  if (laneKind === "target_company_engineering") return 50;
  return 40;
}

function normalizeSourcingLaneContracts(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const lane = entry && typeof entry === "object"
        ? (entry as Record<string, unknown>)
        : {};
      const strategy = normalizeEnumValue(
        lane.strategy,
        ["title", "skill", "seniority", "company"] as const,
        "title",
      );
      const titleTerms = normalizeStringArray(lane.title_terms, 18);
      const skillTerms = normalizeStringArray(lane.skill_terms, 18);
      const companyTerms = normalizeStringArray(lane.company_terms, 15);
      if (titleTerms.length === 0 && skillTerms.length === 0 && companyTerms.length === 0) {
        return null;
      }
      const laneKind = inferLaneKind(lane.lane_kind, strategy);
      const name = normalizeNullableString(lane.name) || `${laneKind} lane`;
      return {
        name,
        strategy,
        lane_kind: laneKind,
        target_persona:
          normalizeNullableString(lane.target_persona) ||
          (companyTerms.length > 0
            ? `Engineering profiles at ${companyTerms.slice(0, 3).join(", ")}`
            : `Profiles matching ${titleTerms.slice(0, 3).join(", ") || skillTerms.slice(0, 3).join(", ") || name}`),
        non_negotiables: normalizeStringArray(lane.non_negotiables, 8),
        relaxed_evidence: normalizeStringArray(lane.relaxed_evidence, 8),
        exclusion_patterns: normalizeStringArray(lane.exclusion_patterns, 8),
        initial_budget: normalizeBudget(lane.initial_budget, defaultInitialBudget(laneKind)),
        max_budget: normalizeBudget(lane.max_budget, defaultMaxBudget(laneKind)),
        title_terms: titleTerms,
        skill_terms: skillTerms,
        company_terms: companyTerms,
        avoid_terms: normalizeStringArray(lane.avoid_terms, 8),
        budget_weight:
          typeof lane.budget_weight === "number" && Number.isFinite(lane.budget_weight)
            ? Math.max(0.25, Math.min(4, lane.budget_weight))
            : 1,
      };
    })
    .filter((lane): lane is NonNullable<typeof lane> => Boolean(lane))
    .slice(0, 4);
}

function buildDefaultHeadhunterBrief(params: {
  rawBrief: unknown;
  title: string;
  functionFocus: string | null;
  requiredSkills: string[];
  mustHaveSignals: string[];
  avoidProfiles: string[];
  lateralTitles: string[];
}) {
  const brief = params.rawBrief && typeof params.rawBrief === "object"
    ? (params.rawBrief as Record<string, unknown>)
    : {};
  return {
    role_mission:
      normalizeNullableString(brief.role_mission) ||
      params.functionFocus ||
      `Hire a strong ${params.title} who can solve the role's core engineering problem.`,
    ideal_candidate_backgrounds: normalizeStringArray(brief.ideal_candidate_backgrounds, 8).length > 0
      ? normalizeStringArray(brief.ideal_candidate_backgrounds, 8)
      : [
        `${params.title} with evidence of ${params.requiredSkills.slice(0, 3).join(", ") || "similar production work"}`,
      ],
    allowed_adjacent_profiles: normalizeStringArray(brief.allowed_adjacent_profiles, 8).length > 0
      ? normalizeStringArray(brief.allowed_adjacent_profiles, 8)
      : params.lateralTitles.map((title) => `${title} with equivalent same-work evidence`).slice(0, 6),
    misleading_profile_patterns: normalizeStringArray(brief.misleading_profile_patterns, 8).length > 0
      ? normalizeStringArray(brief.misleading_profile_patterns, 8)
      : params.avoidProfiles,
    equivalent_evidence: normalizeStringArray(brief.equivalent_evidence, 8).length > 0
      ? normalizeStringArray(brief.equivalent_evidence, 8)
      : params.mustHaveSignals.slice(0, 6),
    verification_risks: normalizeStringArray(brief.verification_risks, 8).length > 0
      ? normalizeStringArray(brief.verification_risks, 8)
      : ["Confirm exact scope, seniority, and current hands-on ownership before presenting."],
  };
}

function buildDefaultSourcingPlan(
  rawPlan: unknown,
  lanes: ReturnType<typeof normalizeSourcingLaneContracts>,
  title: string,
) {
  const plan = rawPlan && typeof rawPlan === "object"
    ? (rawPlan as Record<string, unknown>)
    : {};
  const planLanes = normalizeSourcingLaneContracts(plan.lanes);
  const toPlanLane = (lane: ReturnType<typeof normalizeSourcingLaneContracts>[number]) => ({
    name: lane.name,
    lane_kind: lane.lane_kind,
    target_persona: lane.target_persona,
    non_negotiables: lane.non_negotiables,
    relaxed_evidence: lane.relaxed_evidence,
    exclusion_patterns: lane.exclusion_patterns,
    initial_budget: lane.initial_budget,
    max_budget: lane.max_budget,
  });
  const finalLanes = planLanes.length > 0
    ? planLanes.map(toPlanLane)
    : lanes.map(toPlanLane);
  return {
    strategy_mode: "headhunter_v1",
    first_probe_goal:
      normalizeNullableString(plan.first_probe_goal) ||
      `Validate that the first 50 recalled profiles are genuinely plausible ${title} candidates before expanding.`,
    lanes: finalLanes,
    early_stop_rules: normalizeStringArray(plan.early_stop_rules, 8).length > 0
      ? normalizeStringArray(plan.early_stop_rules, 8)
      : [
        "Stop lanes dominated by non-engineering, generic, or unrelated profiles.",
        "Revise lanes that match title/company but lack same-work evidence.",
      ],
  };
}

function inferExperienceYears(jdText: string) {
  const match = jdText.match(/(\d+)\s*\+?\s*(?:years?|yrs?)(?:\s+of)?\s+(?:software|engineering|professional|relevant|industry)?/i);
  if (!match) return null;
  const years = Number.parseInt(match[1] || "", 10);
  return Number.isFinite(years) ? years : null;
}

function inferWorkModel(jdText: string) {
  const lower = jdText.toLowerCase();
  if (lower.includes("hybrid")) return "hybrid";
  if (lower.includes("remote")) return "remote";
  if (lower.includes("onsite") || lower.includes("on-site") || lower.includes("on site")) {
    return "onsite";
  }
  return "unknown";
}

function inferLocationScope(jdText: string) {
  const patterns = [
    /\b(remote in|based in|located in|location[:\s]+)([A-Z][A-Za-z .,-]{2,40})/i,
    /\b(New York|San Francisco|London|Berlin|Paris|Amsterdam|Toronto|Vancouver|Austin|Seattle|Boston|Los Angeles)\b/i,
  ];

  for (const pattern of patterns) {
    const match = jdText.match(pattern);
    const value = match?.[2] || match?.[1];
    if (value) return value.trim();
  }

  return null;
}

function inferCountries(jdText: string) {
  const lower = jdText.toLowerCase();
  const countries = new Set<string>();
  if (/\b(united states|u\.s\.|usa|us-only)\b/.test(lower)) countries.add("US");
  if (/\b(canada|ca-only)\b/.test(lower)) countries.add("CA");
  if (/\b(united kingdom|uk-only|u\.k\.)\b/.test(lower)) countries.add("GB");
  if (/\b(europe|eu-only|european union)\b/.test(lower)) countries.add("EU");
  return Array.from(countries);
}

function inferTitle(jdText: string) {
  const firstLines = jdText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4);

  for (const line of firstLines) {
    if (line.length <= 80 && /(engineer|developer|manager|lead|architect|scientist|head|recruiter)/i.test(line)) {
      return line.replace(/[:\-–]\s*$/, "");
    }
  }

  return "Untitled Role";
}

function inferSkills(jdText: string, maxItems: number) {
  const lower = jdText.toLowerCase();
  const found = COMMON_SKILLS.filter((skill) => lower.includes(skill.toLowerCase()));
  return found.slice(0, maxItems);
}

// Strip role-qualifier suffixes after comma or dash that appear in JD titles
// e.g. "Senior Software Engineer, Cloud" → "Senior Software Engineer"
//      "Staff Engineer — Platform" → "Staff Engineer"
function cleanTitleSuffix(t: string): string {
  return t.split(/[,\-–—]/)[0]?.trim() ?? t;
}

// Given a raw title (possibly with suffix), expand to ≥3 LinkedIn-friendly seniority variants
function expandTitleVariants(rawVariants: string[], mainTitle: string): string[] {
  const SENIORITY_UPGRADES: Record<string, string[]> = {
    junior: ["Junior", "Associate", ""],
    associate: ["Associate", "Junior", ""],
    mid: ["", "Senior"],
    senior: ["Senior", "Staff", "Principal", "Lead"],
    staff: ["Staff", "Senior", "Principal"],
    principal: ["Principal", "Staff", "Senior"],
    lead: ["Lead", "Senior", "Staff"],
    founding: ["Founding", "Senior", "Staff"],
  };

  // Clean all incoming variants (strip comma/dash suffixes)
  const cleaned = rawVariants.map(cleanTitleSuffix).filter(Boolean);

  // Also clean and include the main title
  const cleanMain = cleanTitleSuffix(mainTitle);
  if (cleanMain && !cleaned.includes(cleanMain)) cleaned.unshift(cleanMain);

  // Check if we already have enough clean variants
  if (cleaned.length >= 3) {
    const deduped = [...new Set(cleaned)];
    if (deduped.length >= 3) return deduped.slice(0, 8);
  }

  // Need to generate more: detect seniority in the main title
  const lowerMain = cleanMain.toLowerCase();
  let matchedSeniority: string | null = null;
  let baseRole = cleanMain;

  for (const key of Object.keys(SENIORITY_UPGRADES)) {
    if (lowerMain.startsWith(key + " ")) {
      matchedSeniority = key;
      baseRole = cleanMain.slice(key.length + 1).trim();
      break;
    }
  }
  // Handle "Head of X" / "VP of X" / "Director of X" patterns
  if (!matchedSeniority) {
    const headMatch = /^(head of|vp of|director of)\s+(.+)$/i.exec(cleanMain);
    if (headMatch) {
      const subject = headMatch[2] ?? "";
      const generated = [
        `Head of ${subject}`,
        `VP of ${subject}`,
        `Director of ${subject}`,
        `${subject} Lead`,
      ].filter(Boolean);
      return [...new Set([...cleaned, ...generated])].slice(0, 8);
    }
  }

  if (matchedSeniority && baseRole) {
    const prefixes = SENIORITY_UPGRADES[matchedSeniority] ?? [];
    const expanded = prefixes
      .map((p) => (p ? `${p} ${baseRole}` : baseRole))
      .filter(Boolean);
    const result = [...new Set([...cleaned, ...expanded])];
    if (result.length >= 3) return result.slice(0, 8);
  }

  // Last resort: no seniority detected, just return what we have (at least the cleaned main title)
  return [...new Set(cleaned.length > 0 ? cleaned : [cleanMain])].slice(0, 8);
}

// Role keyword → adjacent lateral titles a headhunter would also target
const LATERAL_ROLE_MAP: Array<[RegExp, string[]]> = [
  [/backend engineer|backend developer/i, ["Platform Engineer", "Software Engineer", "Infrastructure Engineer", "Site Reliability Engineer"]],
  [/software engineer|software developer/i, ["Backend Engineer", "Platform Engineer", "Full Stack Engineer", "Staff Engineer"]],
  [/frontend engineer|frontend developer|ui engineer/i, ["Full Stack Engineer", "Software Engineer", "React Developer", "Web Engineer"]],
  [/full.?stack/i, ["Frontend Engineer", "Backend Engineer", "Software Engineer", "Product Engineer"]],
  [/platform engineer/i, ["Infrastructure Engineer", "Backend Engineer", "Site Reliability Engineer", "DevOps Engineer"]],
  [/infrastructure engineer/i, ["Platform Engineer", "Site Reliability Engineer", "DevOps Engineer", "Cloud Engineer"]],
  [/site reliability|sre\b/i, ["Platform Engineer", "Infrastructure Engineer", "DevOps Engineer", "Backend Engineer"]],
  [/devops engineer/i, ["Site Reliability Engineer", "Platform Engineer", "Infrastructure Engineer", "Cloud Engineer"]],
  [/cloud engineer/i, ["Infrastructure Engineer", "DevOps Engineer", "Platform Engineer", "Site Reliability Engineer"]],
  [/data engineer/i, ["Analytics Engineer", "Backend Engineer", "Data Platform Engineer", "Software Engineer"]],
  [/ml engineer|machine learning engineer/i, ["AI Engineer", "Data Scientist", "Applied Scientist", "Research Engineer"]],
  [/data scientist/i, ["ML Engineer", "Applied Scientist", "Analytics Engineer", "Research Scientist"]],
  [/ai engineer|applied scientist/i, ["ML Engineer", "Data Scientist", "Research Engineer", "Software Engineer"]],
  [/mobile engineer|ios engineer|android engineer/i, ["Software Engineer", "React Native Developer", "iOS Developer", "Android Developer"]],
  [/security engineer/i, ["Application Security Engineer", "Cloud Security Engineer", "Software Engineer", "Site Reliability Engineer"]],
  [/staff engineer|principal engineer|lead engineer/i, ["Senior Software Engineer", "Engineering Manager", "Platform Engineer", "Backend Engineer"]],
];

function inferLateralTitleVariants(mainTitle: string): string[] {
  const clean = cleanTitleSuffix(mainTitle);
  for (const [pattern, laterals] of LATERAL_ROLE_MAP) {
    if (pattern.test(clean)) {
      // Exclude the main title itself and its close seniority variants
      const cleanLower = clean.toLowerCase().replace(/^(senior|staff|principal|lead|junior|associate)\s+/, "");
      return laterals
        .filter(l => !l.toLowerCase().includes(cleanLower))
        .slice(0, 4);
    }
  }
  return [];
}

function sanitizeAdvancementRubric(
  value: unknown,
  params: {
    title: string;
    roleCore: Record<string, unknown>;
    requiredSkills: string[];
    mustHaveSignals: string[];
    mustHaveConstraints: string[];
  },
) {
  const item = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const functionFocus = normalizeNullableString(params.roleCore.function_focus);
  const seniority = normalizeNullableString(params.roleCore.seniority);
  const required = params.requiredSkills.slice(0, 5);
  const signals = params.mustHaveSignals.length > 0
    ? params.mustHaveSignals.slice(0, 5)
    : required;

  return {
    same_work_evidence:
      normalizeStringArray(item.same_work_evidence, 5).length > 0
        ? normalizeStringArray(item.same_work_evidence, 5)
        : [
          functionFocus
            ? `Profile evidence shows current work in ${functionFocus}.`
            : `Profile evidence shows current work comparable to ${params.title}.`,
          signals.length > 0
            ? `Recent role mentions ${signals.join(", ")} in real project or ownership context.`
            : "Recent role description shows the same day-to-day problem space as the JD.",
        ],
    seniority_evidence:
      normalizeStringArray(item.seniority_evidence, 5).length > 0
        ? normalizeStringArray(item.seniority_evidence, 5)
        : [
          seniority
            ? `Scope matches ${seniority} expectations, not just a title string.`
            : "Scope, ownership, and complexity match the level implied by the JD.",
        ],
    must_have_evidence:
      normalizeStringArray(item.must_have_evidence, 6).length > 0
        ? normalizeStringArray(item.must_have_evidence, 6)
        : signals.map((signal) => `Concrete profile evidence for ${signal}.`).slice(0, 6),
    acceptable_tradeoffs:
      normalizeStringArray(item.acceptable_tradeoffs, 5).length > 0
        ? normalizeStringArray(item.acceptable_tradeoffs, 5)
        : [
          "Different title is acceptable when the profile shows equivalent work.",
          "Missing exact tool wording is acceptable when comparable system ownership is explicit.",
        ],
    reject_signals:
      normalizeStringArray(item.reject_signals, 6).length > 0
        ? normalizeStringArray(item.reject_signals, 6)
        : [
          "Only title, employer brand, or target-company membership supports the match.",
          "Profile evidence is mostly unrelated to the JD's core work.",
          ...params.mustHaveConstraints.slice(0, 3).map((constraint) => `Clear mismatch on ${constraint}.`),
        ].slice(0, 6),
  };
}

function sanitizeIntentCandidate(
  raw: ParsedSearchIntent | null | undefined,
  jdText: string,
): ParsedSearchIntent {
  const title = normalizeNullableString(raw?.title) || inferTitle(jdText);
  const requiredSkills =
    normalizeStringArray(
      raw?.hiring_brief && typeof raw.hiring_brief === "object"
        ? (raw.hiring_brief as { role_core?: { required_skills?: unknown } }).role_core?.required_skills
        : raw?.required_skills,
      12,
    );
  const niceToHaveSkills =
    normalizeStringArray(
      raw?.hiring_brief && typeof raw.hiring_brief === "object"
        ? (raw.hiring_brief as { role_core?: { nice_to_have_skills?: unknown } }).role_core?.nice_to_have_skills
        : raw?.nice_to_have_skills,
      12,
    );

  const fallbackCoreSkills = inferSkills(jdText, 10);
  const hiringBrief =
    raw?.hiring_brief && typeof raw.hiring_brief === "object"
      ? (raw.hiring_brief as Record<string, unknown>)
      : {};
  const roleCore =
    hiringBrief.role_core && typeof hiringBrief.role_core === "object"
      ? (hiringBrief.role_core as Record<string, unknown>)
      : {};
  const recallSpec =
    raw?.recall_spec && typeof raw.recall_spec === "object"
      ? (raw.recall_spec as Record<string, unknown>)
      : {};

  const normalizedRequiredSkills =
    requiredSkills.length > 0 ? requiredSkills : fallbackCoreSkills.slice(0, 6);
  const normalizedNiceToHaveSkills =
    niceToHaveSkills.length > 0 ? niceToHaveSkills : fallbackCoreSkills.slice(6, 10);
  const rawTitleVariants = normalizeStringArray(recallSpec.title_variants, 8);
  const titleVariants = expandTitleVariants(rawTitleVariants, title);
  const coreSkillTerms = normalizeStringArray(recallSpec.core_skill_terms, 12);
  const normalizedSourcingLanes = normalizeSourcingLaneContracts(recallSpec.sourcing_lanes);
  const mustHaveConstraints = normalizeStringArray(hiringBrief.must_have_constraints, 10);
  const rawMustHaveSignals = normalizeStringArray(recallSpec.must_have_signals, 12);
  const normalizedMustHaveSignals = rawMustHaveSignals.length > 0
    ? rawMustHaveSignals
    : normalizedRequiredSkills;
  const normalizedAvoidProfiles = normalizeStringArray(recallSpec.avoid_profiles, 8);
  const normalizedLateralTitleVariants = (() => {
    const fromLlm = normalizeStringArray(recallSpec.lateral_title_variants, 6);
    return fromLlm.length >= 2 ? fromLlm : inferLateralTitleVariants(title);
  })();
  const functionFocus = normalizeNullableString(roleCore.function_focus);
  const headhunterBrief = buildDefaultHeadhunterBrief({
    rawBrief: raw?.headhunter_brief,
    title,
    functionFocus,
    requiredSkills: normalizedRequiredSkills,
    mustHaveSignals: normalizedMustHaveSignals,
    avoidProfiles: normalizedAvoidProfiles,
    lateralTitles: normalizedLateralTitleVariants,
  });

  const normalized: ParsedSearchIntent = {
    title,
    experience_years_min:
      typeof raw?.experience_years_min === "number"
        ? raw.experience_years_min
        : inferExperienceYears(jdText),
    required_skills: normalizedRequiredSkills,
    nice_to_have_skills: normalizedNiceToHaveSkills,
    location:
      normalizeNullableString(
        hiringBrief.location_scope ?? raw?.location,
      ) || inferLocationScope(jdText),
    hiring_brief: {
      role_core: {
        title: normalizeNullableString(roleCore.title) || title,
        seniority: normalizeNullableString(roleCore.seniority),
        function_focus: functionFocus,
        required_skills: normalizedRequiredSkills,
        nice_to_have_skills: normalizedNiceToHaveSkills,
      },
      work_model: normalizeEnumValue(
        hiringBrief.work_model,
        ["onsite", "hybrid", "remote", "unknown"] as const,
        inferWorkModel(jdText),
      ),
      location_scope:
        normalizeNullableString(hiringBrief.location_scope) || inferLocationScope(jdText),
      location_flexibility: normalizeEnumValue(
        hiringBrief.location_flexibility,
        ["strict", "moderate", "flexible"] as const,
        "moderate",
      ),
      relocation_allowed: normalizeEnumValue(
        hiringBrief.relocation_allowed,
        ["yes", "no", "unknown"] as const,
        "unknown",
      ),
      must_have_constraints: mustHaveConstraints,
      soft_constraints: normalizeStringArray(hiringBrief.soft_constraints, 10),
      company_stage_expectation: normalizeEnumValue(
        hiringBrief.company_stage_expectation,
        ["startup", "growth", "enterprise", "unknown"] as const,
        "unknown",
      ),
      constraint_reasoning: normalizeNullableString(hiringBrief.constraint_reasoning),
    },
    recall_spec: {
      countries: normalizeStringArray(recallSpec.countries, 5).length > 0
        ? normalizeStringArray(recallSpec.countries, 5)
        : inferCountries(jdText),
      title_variants: titleVariants.length > 0 ? titleVariants : [title],
      core_skill_terms: coreSkillTerms.length > 0 ? coreSkillTerms : fallbackCoreSkills,
      differentiating_skill_terms: normalizeStringArray(recallSpec.differentiating_skill_terms, 5),
      baseline_skill_terms: normalizeStringArray(recallSpec.baseline_skill_terms, 6),
      domain_terms: normalizeStringArray(recallSpec.domain_terms, 3),
      must_have_signals: normalizedMustHaveSignals,
      avoid_profiles: normalizeStringArray(recallSpec.avoid_profiles, 8),
      strict_location_terms: normalizeStringArray(recallSpec.strict_location_terms, 10),
      nearby_location_terms: normalizeStringArray(recallSpec.nearby_location_terms, 10),
      geo_strategy: normalizeNullableString(recallSpec.geo_strategy),
      recall_confidence: normalizeEnumValue(
        recallSpec.recall_confidence,
        ["high", "medium", "low"] as const,
        "medium",
      ),
      role_breadth: normalizeEnumValue(
        recallSpec.role_breadth,
        ["narrow", "balanced", "broad"] as const,
        "balanced",
      ),
      sourcing_lanes: normalizedSourcingLanes,
      lateral_title_variants: normalizedLateralTitleVariants,
      target_companies: normalizeStringArray(recallSpec.target_companies, 15),
      recall_strategy: (() => {
        // LLM often defaults to "standard" even when it shouldn't — enforce multi_round
        // in code whenever we have meaningful lateral variants or target companies
        const hasLaterals = normalizeStringArray(recallSpec.lateral_title_variants, 6).length >= 2
          || inferLateralTitleVariants(title).length > 0;
        const hasTargets = normalizeStringArray(recallSpec.target_companies, 15).length > 0;
        if (hasLaterals || hasTargets) return "multi_round";
        return normalizeEnumValue(
          recallSpec.recall_strategy,
          ["standard", "multi_round"] as const,
          "standard",
        );
      })(),
    },
    headhunter_brief: headhunterBrief,
    sourcing_plan: buildDefaultSourcingPlan(
      raw?.sourcing_plan,
      normalizedSourcingLanes,
      title,
    ),
    recall_iterations: Array.isArray(raw?.recall_iterations) ? raw.recall_iterations : [],
  };
  normalized.advancement_rubric = sanitizeAdvancementRubric(raw?.advancement_rubric, {
    title,
    roleCore,
    requiredSkills: normalizedRequiredSkills,
    mustHaveSignals: normalizedMustHaveSignals,
    mustHaveConstraints,
  });
  return normalized;
}

export async function parseJobDescriptionToDraft(
  jdText: string,
  options: ParseJobDescriptionOptions = {},
) {
  getLlmApiKey();
  const { data: parsed } = await generateLlmJson<ParsedSearchIntent>({
    model: getDefaultLlmModel(),
    system: JD_SEARCH_INTENT_PROMPT,
    prompt: jdText,
    maxOutputTokens: 3200,
    temperature: 0,
    timeoutMs: 50000,
    deepSeekThinking: resolveDeepSeekThinkingMode("SEARCH_PARSE_THINKING", "disabled"),
    // Use json_mode instead of strict JSON schema — the schema constrained the model
    // too much and caused it to return empty arrays for lateral_title_variants and
    // target_companies even with explicit prompt instructions to fill them.
    // sanitizeIntentCandidate normalizes all fields so loose JSON is fine here.
    jsonMode: true,
  });

  const result = sanitizeIntentCandidate(parsed, jdText);

  // If LLM didn't populate target_companies, run a focused second call
  const recallSpec = result.recall_spec as Record<string, unknown> | undefined;
  const existingCompanies = Array.isArray(recallSpec?.target_companies)
    ? (recallSpec.target_companies as string[])
    : [];

  const shouldPopulateTargetCompanies =
    options.populateTargetCompanies ?? true;

  if (shouldPopulateTargetCompanies && existingCompanies.length === 0) {
    const titleStr = typeof result.title === "string" ? result.title : "";
    const rs2 = result.recall_spec as Record<string, unknown> | undefined;
    const domainTerms = Array.isArray(rs2?.domain_terms) ? (rs2.domain_terms as string[]) : [];
    const coreSkills = Array.isArray(rs2?.core_skill_terms) ? (rs2.core_skill_terms as string[]).slice(0, 4) : [];
    const jdSnippet = jdText.slice(0, 600);

    const { data: raw } = await generateLlmJson<{ companies: string[] }>({
      model: getDefaultLlmModel(),
      system: "You are an expert headhunter. Return ONLY valid JSON.",
      prompt: `I'm sourcing for: ${titleStr}
Industry/domain: ${[...domainTerms, ...coreSkills].join(", ") || "technology"}
JD excerpt: ${jdSnippet}

Name 8-12 companies where strong candidates for this role currently work today — direct competitors, same-vertical companies, or companies known for this type of talent.
Return a JSON object with a "companies" key: {"companies": ["Company A", "Company B", ...]}`,
      maxOutputTokens: 300,
      temperature: 0,
      timeoutMs: 12000,
      jsonMode: true,
      deepSeekThinking: resolveDeepSeekThinkingMode("SEARCH_PARSE_THINKING", "disabled"),
    });

    // Extract companies array from the response object
    let companies: string[] = [];
    if (raw && typeof raw === "object") {
      const obj = raw as Record<string, unknown>;
      const val = obj.companies ?? obj.target_companies ?? obj.data ?? Object.values(obj)[0];
      if (Array.isArray(val)) {
        companies = val.filter((c): c is string => typeof c === "string" && c.trim().length > 0);
      }
    }

    if (companies.length === 0) {
      throw new Error("Target company generation returned no companies.");
    }
    if (recallSpec) {
      recallSpec.target_companies = companies.slice(0, 15);
      recallSpec.recall_strategy = "multi_round";
    }
  }

  return result;
}

export function buildParsedRequirementsForLaunch(
  draft: ParsedSearchIntent,
  jdText: string,
  options: LaunchOptions,
) {
  const normalized = sanitizeIntentCandidate(draft, jdText);
  const draftRecord =
    draft && typeof draft === "object"
      ? (draft as Record<string, unknown>)
      : {};
  const parseOrigin = normalizeNullableString(draftRecord.parse_origin);
  const userClarification = normalizeNullableString(draftRecord.user_clarification);
  const timestamp = new Date().toISOString();
  const hiringBrief =
    normalized.hiring_brief && typeof normalized.hiring_brief === "object"
      ? (normalized.hiring_brief as Record<string, unknown>)
      : {};
  const recallSpec =
    normalized.recall_spec && typeof normalized.recall_spec === "object"
      ? (normalized.recall_spec as Record<string, unknown>)
      : {};

  return {
    ...normalized,
    ...(parseOrigin ? { parse_origin: parseOrigin } : {}),
    ...(userClarification ? { user_clarification: userClarification } : {}),
    title: normalizeNullableString(normalized.title) || inferTitle(jdText),
    required_skills: normalizeStringArray(normalized.required_skills, 12),
    nice_to_have_skills: normalizeStringArray(normalized.nice_to_have_skills, 12),
    location: normalizeNullableString(normalized.location),
    experience_years_min:
      typeof normalized.experience_years_min === "number"
        ? normalized.experience_years_min
        : inferExperienceYears(jdText),
    candidate_count: options.candidateCount,
    display_count: options.displayCount,
    highlight_count: options.highlightCount,
    requested_candidate_count:
      options.requestedCandidateCount ?? options.candidateCount,
    outreach_pool_target: options.outreachPoolTarget,
    ...(typeof options.profileScanBudget === "number"
      ? { profile_scan_budget: Math.max(1, Math.round(options.profileScanBudget)) }
      : {}),
    plan_code: options.planCode,
    launch_mode: "tech_recruiter_mvp",
    launch_scope: "linkedin_plus_github",
    execution_profile: options.executionProfile,
    activation_run: false,
    search_phase: "mvp_focus",
    search_started_at: timestamp,
    advancement_rubric: normalized.advancement_rubric,
    hiring_brief: {
      ...hiringBrief,
      role_core:
        hiringBrief.role_core && typeof hiringBrief.role_core === "object"
          ? hiringBrief.role_core
          : {
              title: normalized.title,
              required_skills: normalized.required_skills,
              nice_to_have_skills: normalized.nice_to_have_skills,
            },
    },
    recall_spec: {
      ...recallSpec,
      title_variants: normalizeStringArray(recallSpec.title_variants, 8).length > 0
        ? normalizeStringArray(recallSpec.title_variants, 8)
        : [normalized.title],
      core_skill_terms: normalizeStringArray(recallSpec.core_skill_terms, 12).length > 0
        ? normalizeStringArray(recallSpec.core_skill_terms, 12)
        : normalizeStringArray(normalized.required_skills, 12),
    },
  };
}

export function summarizeParsedJob(draft: ParsedSearchIntent): ParsedJobSummary {
  const hiringBrief =
    draft.hiring_brief && typeof draft.hiring_brief === "object"
      ? (draft.hiring_brief as Record<string, unknown>)
      : {};
  const roleCore =
    hiringBrief.role_core && typeof hiringBrief.role_core === "object"
      ? (hiringBrief.role_core as Record<string, unknown>)
      : {};

  return {
    title: normalizeNullableString(draft.title) || "Untitled Role",
    requiredSkills: normalizeStringArray(roleCore.required_skills ?? draft.required_skills, 12),
    niceToHaveSkills: normalizeStringArray(
      roleCore.nice_to_have_skills ?? draft.nice_to_have_skills,
      12,
    ),
    experienceYearsMin:
      typeof draft.experience_years_min === "number"
        ? draft.experience_years_min
        : null,
    workModel: normalizeEnumValue(
      hiringBrief.work_model,
      ["onsite", "hybrid", "remote", "unknown"] as const,
      "unknown",
    ),
    locationScope: normalizeNullableString(hiringBrief.location_scope ?? draft.location),
    locationFlexibility: normalizeEnumValue(
      hiringBrief.location_flexibility,
      ["strict", "moderate", "flexible"] as const,
      "moderate",
    ),
    relocationAllowed: normalizeEnumValue(
      hiringBrief.relocation_allowed,
      ["yes", "no", "unknown"] as const,
      "unknown",
    ),
    mustHaveConstraints: normalizeStringArray(hiringBrief.must_have_constraints, 10),
    softConstraints: normalizeStringArray(hiringBrief.soft_constraints, 10),
    constraintReasoning: normalizeNullableString(hiringBrief.constraint_reasoning),
  };
}
