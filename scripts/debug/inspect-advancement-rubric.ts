import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";

import { closeDb, db } from "@/db/client";
import { hirelix_searches } from "@/db/schema";
import {
  buildParsedRequirementsForLaunch,
  parseJobDescriptionToDraft,
} from "@/lib/jd-parse";
import { generateLlmJson, getLightweightLlmModel } from "@/lib/llm-client";
import {
  buildPromptSearchContext,
  normalizeRecallSpec,
  sanitizeAdvancementRubric,
  sanitizeHiringBrief,
} from "@/lib/search-jobs";
import {
  buildAdvancementRubricInspectionReport,
  buildAdvancementRubricLlmReviewPrompt,
  normalizeAdvancementRubricLlmReview,
} from "@/lib/search/advancement-rubric-inspection";
import { getInitialSearchExecutionProfile } from "@/lib/search-execution";

type CliOptions = {
  input: string | null;
  parseJd: boolean;
  judgeRubric: boolean;
  out: string | null;
};

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split("\n")) {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    let value = match[2].trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    input: null,
    parseJd: false,
    judgeRubric: false,
    out: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;
    if (arg === "--parse-jd") {
      options.parseJd = true;
      continue;
    }
    if (arg === "--judge-rubric") {
      options.judgeRubric = true;
      continue;
    }
    if (arg.startsWith("--out=")) {
      options.out = arg.slice("--out=".length);
      continue;
    }
    if (arg === "--out") {
      index += 1;
      options.out = argv[index] ?? null;
      continue;
    }
    if (!options.input) {
      options.input = arg;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.input) {
    throw new Error(
      "Usage: npx tsx scripts/debug/inspect-advancement-rubric.ts <search-id|parsed-json-file|jd-file> [--parse-jd] [--judge-rubric] [--out tmp/rubric.json]",
    );
  }
  return options;
}

function looksLikeUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function recordFromJson(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected a JSON object with parsed requirements.");
  }
  return value as Record<string, unknown>;
}

async function loadParsedFromSearch(searchId: string) {
  const rows = await db
    .select({
      id: hirelix_searches.id,
      parsed_requirements: hirelix_searches.parsed_requirements,
    })
    .from(hirelix_searches)
    .where(eq(hirelix_searches.id, searchId))
    .limit(1);
  const search = rows[0];
  if (!search) throw new Error(`Search not found: ${searchId}`);
  return {
    searchId,
    source: "search" as const,
    parsed: recordFromJson(search.parsed_requirements),
    jdText: null,
  };
}

async function loadParsedFromFile(filePath: string, options: CliOptions) {
  const absolutePath = path.resolve(filePath);
  const raw = fs.readFileSync(absolutePath, "utf8");
  if (!options.parseJd) {
    return {
      searchId: null,
      source: "parsed_json" as const,
      parsed: recordFromJson(JSON.parse(raw)),
      jdText: null,
    };
  }

  const draft = await parseJobDescriptionToDraft(raw, { populateTargetCompanies: true });
  const profile = getInitialSearchExecutionProfile("free");
  const candidateCount = profile.deliveryReferenceCount;
  return {
    searchId: null,
    source: "jd_parse" as const,
    jdText: raw,
    parsed: buildParsedRequirementsForLaunch(draft, raw, {
      candidateCount,
      displayCount: candidateCount,
      highlightCount: profile.highlightCount,
      outreachPoolTarget: candidateCount,
      planCode: "free",
      executionProfile: profile.name,
      profileScanBudget: candidateCount,
    }) as Record<string, unknown>,
  };
}

async function main() {
  loadEnvFile(path.resolve(".env.local"));
  loadEnvFile(path.resolve(".env"));

  const options = parseArgs(process.argv.slice(2));
  const inputData = looksLikeUuid(options.input!)
    ? await loadParsedFromSearch(options.input!)
    : await loadParsedFromFile(options.input!, options);

  const baseReport = buildAdvancementRubricInspectionReport(inputData.parsed, {
    searchId: inputData.searchId,
    source: inputData.source,
    sanitizeHiringBrief,
    normalizeRecallSpec,
    sanitizeAdvancementRubric,
    buildPromptSearchContext,
  });
  const llmReview = options.judgeRubric
    ? normalizeAdvancementRubricLlmReview((await generateLlmJson<{
      verdict?: unknown;
      summary?: unknown;
      strengths?: unknown;
      gaps?: unknown;
      suggested_changes?: unknown;
    }>({
      model: getLightweightLlmModel(),
      prompt: buildAdvancementRubricLlmReviewPrompt({
        jdText: inputData.jdText,
        parsed: inputData.parsed,
        scoringContextPreview: baseReport.scoring_context_preview,
      }),
      temperature: 0,
      maxOutputTokens: 900,
      jsonMode: true,
      deepSeekThinking: "disabled",
      usageEvent: {
        searchId: inputData.searchId ?? undefined,
        stage: "advancement_rubric_inspection",
        batchSize: 1,
        metadata: { source: inputData.source },
      },
    })).data)
    : null;
  const report = llmReview
    ? buildAdvancementRubricInspectionReport(inputData.parsed, {
      searchId: inputData.searchId,
      source: inputData.source,
      llmReview,
      sanitizeHiringBrief,
      normalizeRecallSpec,
      sanitizeAdvancementRubric,
      buildPromptSearchContext,
    })
    : baseReport;

  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (options.out) {
    const outPath = path.resolve(options.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, output);
  }
  process.stdout.write(output);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
