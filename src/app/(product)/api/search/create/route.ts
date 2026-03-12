import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { JD_PARSE_PROMPT } from "@/lib/prompts";
import { buildPDLQuery, searchPeople, pdlPersonToCandidate, pdlPersonToRichProfile, type PDLPerson } from "@/lib/pdl";
import { serperSearch, buildLinkedInSearchQueries, parseSearchResults, serperCandidateToRichProfile, serperCandidateToDbCandidate, type SerperCandidate } from "@/lib/serper";
import { scrapeLinkedInProfiles, brightDataProfileToRichText, type BrightDataProfile } from "@/lib/brightdata";
import { findEmail } from "@/lib/hunter";

export const maxDuration = 300;

/** Strip markdown code fences from Claude responses and fix truncated JSON */
function extractJSON(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  let result = fenced ? fenced[1].trim() : text.trim();
  // Fix truncated JSON arrays
  if (result.startsWith("[") && !result.endsWith("]")) {
    const lastBrace = result.lastIndexOf("}");
    if (lastBrace > 0) {
      result = result.substring(0, lastBrace + 1) + "]";
    }
  }
  return result;
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function getUserFromRequest(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

export async function POST(req: NextRequest) {
  const token = getUserFromRequest(req);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );

  const {
    data: { user },
  } = await supabaseUser.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  try {
    const { jd_text, candidate_count } = await req.json();
    const maxCandidates = Math.min(Math.max(Number(candidate_count) || 5, 1), 20);
    if (!jd_text || typeof jd_text !== "string" || jd_text.trim().length < 50) {
      return NextResponse.json(
        { error: "Job description is too short (min 50 chars)" },
        { status: 400 },
      );
    }

    // Create search record first with pending status
    const { data: search, error: insertErr } = await supabaseAdmin
      .from("hirelix_searches")
      .insert({
        user_id: user.id,
        jd_text: jd_text.trim(),
        status: "processing",
        parsed_requirements: { candidate_count: maxCandidates },
      })
      .select("id")
      .single();

    if (insertErr || !search) {
      console.error("Insert search error:", insertErr);
      return NextResponse.json(
        { error: "Failed to create search" },
        { status: 500 },
      );
    }

    // Run pipeline in after() — continues executing after response is sent
    const userId = user.id;
    after(async () => {
      await runPipeline(search.id, jd_text.trim(), maxCandidates, userId);
    });

    return NextResponse.json({ id: search.id });
  } catch (err) {
    console.error("Search create error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

function buildFilterPrompt(
  parsed: Record<string, unknown>,
  richProfiles: string,
  poolSize: number,
  candidateCount: number,
): string {
  return `You are an expert AI recruiter. Your job is to deeply analyze candidate profiles and select the BEST matches for a role.

## Job Requirements
Title: ${parsed.title || "N/A"}
Seniority: ${parsed.seniority || "N/A"}
Required Skills: ${(Array.isArray(parsed.required_skills) ? parsed.required_skills : []).join(", ") || "N/A"}
Nice-to-have Skills: ${(Array.isArray(parsed.nice_to_have_skills) ? parsed.nice_to_have_skills : []).join(", ") || "N/A"}
Min Experience: ${parsed.experience_years_min || "?"} years
Location: ${parsed.location || "N/A"}
Key Responsibilities: ${(Array.isArray(parsed.key_responsibilities) ? parsed.key_responsibilities : []).join("; ") || "N/A"}

## Candidate Pool (${poolSize} people)
${richProfiles}

## Your Task
Select the TOP ${candidateCount} candidates. For each, return:
- index: number (the [N] index from the profile)
- match_score: 0-100
- match_reasons: string[] (3-4 SPECIFIC reasons referencing their actual experience)
- skills: string[] (inferred technical skills based on their profile, max 8)

Return a JSON array of exactly ${candidateCount} objects, sorted by match_score descending. Return ONLY valid JSON, no markdown.`;
}

function buildSerperFilterPrompt(
  parsed: Record<string, unknown>,
  richProfiles: string,
  poolSize: number,
  candidateCount: number,
): string {
  return `You are an expert AI recruiter. You are analyzing LinkedIn profiles found via Google search to select the best candidates for a role.

## Job Requirements
Title: ${parsed.title || "N/A"}
Seniority: ${parsed.seniority || "N/A"}
Required Skills: ${(Array.isArray(parsed.required_skills) ? parsed.required_skills : []).join(", ") || "N/A"}
Nice-to-have Skills: ${(Array.isArray(parsed.nice_to_have_skills) ? parsed.nice_to_have_skills : []).join(", ") || "N/A"}
Min Experience: ${parsed.experience_years_min || "?"} years
Location: ${parsed.location || "N/A"}
Key Responsibilities: ${(Array.isArray(parsed.key_responsibilities) ? parsed.key_responsibilities : []).join("; ") || "N/A"}

## Candidate Pool (${poolSize} LinkedIn profiles)
${richProfiles}

## Your Task
Analyze each candidate based on their LinkedIn headline and Google snippet. Select the TOP ${candidateCount} candidates. For each, return:
- index: number (the [N] index from the profile)
- match_score: 0-100 (based on how well their profile matches the job requirements)
- match_reasons: string[] (3-4 SPECIFIC reasons referencing information from their actual profile)
- skills: string[] (technical skills you can infer from their headline and snippet, max 8)
- location: string | null (location if mentioned in snippet)
- experience_years: number | null (estimated years of experience if inferable)

Return a JSON array of exactly ${candidateCount} objects, sorted by match_score descending. Return ONLY valid JSON, no markdown.`;
}

function buildDeepScorePrompt(
  parsed: Record<string, unknown>,
  richProfiles: string,
  poolSize: number,
  candidateCount: number,
): string {
  return `You are an expert AI recruiter. You have FULL LinkedIn profile data for each candidate including their complete work history, education, skills, and about section. Use this rich data to make highly accurate assessments.

## Job Requirements
Title: ${parsed.title || "N/A"}
Seniority: ${parsed.seniority || "N/A"}
Required Skills: ${(Array.isArray(parsed.required_skills) ? parsed.required_skills : []).join(", ") || "N/A"}
Nice-to-have Skills: ${(Array.isArray(parsed.nice_to_have_skills) ? parsed.nice_to_have_skills : []).join(", ") || "N/A"}
Min Experience: ${parsed.experience_years_min || "?"} years
Location: ${parsed.location || "N/A"}
Key Responsibilities: ${(Array.isArray(parsed.key_responsibilities) ? parsed.key_responsibilities : []).join("; ") || "N/A"}

## Candidate Profiles (${poolSize} people — FULL LinkedIn data)
${richProfiles}

## Your Task
Deeply analyze each candidate's COMPLETE profile. Select the TOP ${candidateCount} candidates. For each, return:
- index: number (the [N] index from the profile)
- match_score: 0-100 (based on their actual experience, skills, and background)
- match_reasons: string[] (3-4 SPECIFIC reasons referencing their actual work history, skills, and education)
- skills: string[] (verified technical skills from their profile, max 10)
- experience_years: number | null (calculated from their work history)
- location: string | null

Score strictly based on:
1. Relevant work experience and job titles
2. Technical skills match (from their skills list AND job descriptions)
3. Seniority level alignment
4. Location fit
5. Education and certifications relevance

Return a JSON array of exactly ${candidateCount} objects, sorted by match_score descending. Return ONLY valid JSON, no markdown.`;
}

export async function runPipelineForRetry(searchId: string, jdText: string, candidateCount: number, userId: string) {
  return runPipeline(searchId, jdText, candidateCount, userId);
}

async function runPipeline(searchId: string, jdText: string, candidateCount: number, userId: string) {
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const anthropicBaseUrl = process.env.ANTHROPIC_BASE_URL;
  const anthropicModel = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";

  // Fetch user's PDL key from settings
  let pdlApiKey: string | null = null;
  try {
    const { data: settings } = await supabaseAdmin
      .from("hirelix_user_settings")
      .select("pdl_api_key")
      .eq("user_id", userId)
      .single();
    if (settings?.pdl_api_key) {
      pdlApiKey = settings.pdl_api_key;
      console.log(`[pipeline] Using user's PDL API key`);
    }
  } catch {
    // No user settings
  }

  // Serper.dev Google Search API (free tier, 2500 searches/month)
  const serperApiKey = process.env.SERPER_API_KEY || null;
  // Bright Data LinkedIn scraper
  const brightdataToken = process.env.BRIGHTDATA_API_TOKEN || null;
  const brightdataDatasetId = process.env.BRIGHTDATA_DATASET_ID || null;
  // Email: Apollo → Hunter fallback
  const apolloApiKey = process.env.APOLLO_API_KEY || null;
  const hunterApiKey = process.env.HUNTER_API_KEY || null;
  // Data source priority: PDL (user key) → Serper/Google (platform) → error
  const dataSource = pdlApiKey ? "pdl" : serperApiKey ? "serper" : null;
  const hasBrightData = !!(brightdataToken && brightdataDatasetId);
  console.log(`[pipeline] Data source: ${dataSource || "none"} (PDL: ${!!pdlApiKey}, Serper: ${!!serperApiKey}, BrightData: ${hasBrightData}, Apollo: ${!!apolloApiKey}, Hunter: ${!!hunterApiKey})`);

  async function setStep(step: string) {
    await supabaseAdmin
      .from("hirelix_searches")
      .update({ pipeline_step: step, updated_at: new Date().toISOString() })
      .eq("id", searchId);
  }

  if (!anthropicApiKey) {
    await setStep("error");
    await supabaseAdmin.from("hirelix_searches").update({ status: "error" }).eq("id", searchId);
    return;
  }

  try {
    const anthropic = createAnthropic({
      apiKey: anthropicApiKey,
      ...(anthropicBaseUrl ? { baseURL: anthropicBaseUrl } : {}),
    });

    // Step 1: Parse JD
    await setStep("parsing");
    console.log(`[pipeline] Step 1: Parsing JD for ${searchId}`);
    const { text: parsedJson } = await generateText({
      model: anthropic(anthropicModel),
      system: JD_PARSE_PROMPT,
      prompt: jdText,
      maxOutputTokens: 2000,
    });

    let parsed;
    try {
      parsed = JSON.parse(extractJSON(parsedJson));
    } catch {
      parsed = { title: "Untitled Role", required_skills: [], experience_years_min: 0 };
    }

    parsed.candidate_count = candidateCount;
    await supabaseAdmin
      .from("hirelix_searches")
      .update({
        title: parsed.title || "Untitled Role",
        parsed_requirements: parsed,
        pipeline_step: "parsed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", searchId);
    console.log(`[pipeline] Parsed: ${parsed.title}`);

    // Step 2: Search candidates
    let candidates: {
      name: string;
      headline: string | null;
      location: string | null;
      skills: string[];
      experience_years: number | null;
      match_score: number;
      match_reasons: string[];
      profile_url: string | null;
      github_url: string | null;
      email: string | null;
      outreach_draft: string | null;
    }[] = [];

    // ── Step 2: Search candidates (PDL → Google/Serper → error) ──
    let usedDataSource = false;
    const candidateMetadata: Record<string, unknown>[] = [];

    if (dataSource === "pdl" && pdlApiKey) {
      // ─── PDL path (user's own key) ───
      await setStep("searching");
      const poolSize = Math.min(candidateCount * 5, 50);
      console.log(`[pipeline] Step 2a: PDL wide search (pool=${poolSize})`);
      let pdlResult: { total: number; data: PDLPerson[] } = { total: 0, data: [] };
      try {
        const pdlQuery = buildPDLQuery(parsed);
        pdlResult = await searchPeople(pdlApiKey, pdlQuery, poolSize);
        console.log(`[pipeline] PDL returned ${pdlResult.data.length} results`);
      } catch (pdlErr) {
        console.error("[pipeline] PDL search failed:", pdlErr instanceof Error ? pdlErr.message : String(pdlErr));
      }

      if (pdlResult.data.length > 0) {
        usedDataSource = true;
        await setStep("scoring");
        const richProfiles = pdlResult.data.map((p, i) => pdlPersonToRichProfile(p, i)).join("\n\n");
        const filterPrompt = buildFilterPrompt(parsed, richProfiles, pdlResult.data.length, candidateCount);

        console.log(`[pipeline] Step 2b: AI filtering ${pdlResult.data.length} → top ${candidateCount}`);
        const { text: filterJson } = await generateText({ model: anthropic(anthropicModel), prompt: filterPrompt, maxOutputTokens: 4000 });

        const candidatePdlMap: PDLPerson[] = [];
        try {
          const selected = JSON.parse(extractJSON(filterJson));
          candidates = [];
          for (const s of selected) {
            const idx = typeof s.index === "number" ? s.index : parseInt(s.index);
            if (idx >= 0 && idx < pdlResult.data.length) {
              const c = pdlPersonToCandidate(pdlResult.data[idx]);
              c.match_score = s.match_score || 50;
              c.match_reasons = s.match_reasons || [];
              if (Array.isArray(s.skills) && s.skills.length > 0 && c.skills.length === 0) c.skills = s.skills;
              candidates.push(c);
              candidatePdlMap.push(pdlResult.data[idx]);
            }
          }
          candidates.sort((a, b) => b.match_score - a.match_score);
        } catch {
          console.error("[pipeline] AI filter parse failed, using PDL fallback");
          candidates = pdlResult.data.slice(0, candidateCount).map((p) => {
            const c = pdlPersonToCandidate(p);
            c.match_score = 50;
            c.match_reasons = ["Profile matches required skills"];
            candidatePdlMap.push(p);
            return c;
          });
        }

        // Build metadata from PDL data
        for (let i = 0; i < candidates.length; i++) {
          const pdlPerson = candidatePdlMap[i];
          const meta: Record<string, unknown> = { source: "pdl" };
          if (pdlPerson?.experience?.length) {
            meta.work_history = pdlPerson.experience
              .filter((e) => e.title?.name || e.company?.name)
              .slice(0, 5)
              .map((e) => ({ title: e.title?.name || null, company: e.company?.name || null, start_date: e.start_date || null, end_date: e.end_date || null }));
          }
          if (pdlPerson?.education?.length) {
            meta.education = pdlPerson.education
              .filter((e) => e.school?.name)
              .slice(0, 3)
              .map((e) => ({ school: e.school?.name || null, degree: e.degrees?.[0] || null, major: e.majors?.[0] || null }));
          }
          candidateMetadata.push(meta);
        }
      }
    }

    if (!usedDataSource && dataSource === "serper" && serperApiKey) {
      // ─── 5-Layer Pipeline: Serper → AI Pre-screen → Bright Data → AI Deep Score → Email ───

      // Layer 1: Serper search for LinkedIn URLs
      await setStep("searching");
      const searchQueries = buildLinkedInSearchQueries(parsed);
      const targetPool = Math.min(candidateCount * 4, 20);
      console.log(`[pipeline] Layer 1: Google/Serper search (target=${targetPool}, queries=${searchQueries.length})`);

      let serperCandidates: SerperCandidate[] = [];
      const seenUrls = new Set<string>();
      try {
        for (const query of searchQueries) {
          if (serperCandidates.length >= targetPool) break;
          const needed = targetPool - serperCandidates.length;
          console.log(`[pipeline] Serper query: "${query}" (need ${needed} more)`);
          const results = await serperSearch(serperApiKey, query, Math.min(needed + 5, 20));
          const parsed2 = parseSearchResults(results);
          for (const c of parsed2) {
            const url = c.linkedin_url.toLowerCase();
            if (!seenUrls.has(url)) {
              seenUrls.add(url);
              serperCandidates.push(c);
            }
          }
          console.log(`[pipeline] After query: ${serperCandidates.length} unique candidates`);
        }
      } catch (serperErr) {
        console.error("[pipeline] Serper search failed:", serperErr instanceof Error ? serperErr.message : String(serperErr));
      }

      if (serperCandidates.length > 0) {
        usedDataSource = true;

        // Layer 2: AI pre-screen (filter out obviously bad matches before expensive scraping)
        await setStep("scoring");
        const richProfiles = serperCandidates.map((p, i) => serperCandidateToRichProfile(p, i)).join("\n\n");
        // Ask AI to select more candidates than needed — Bright Data + deep scoring will refine
        const preScreenCount = hasBrightData ? Math.min(serperCandidates.length, candidateCount * 2) : candidateCount;
        const filterPrompt = buildSerperFilterPrompt(parsed, richProfiles, serperCandidates.length, preScreenCount);

        console.log(`[pipeline] Layer 2: AI pre-screening ${serperCandidates.length} → top ${preScreenCount}`);
        const { text: filterJson } = await generateText({ model: anthropic(anthropicModel), prompt: filterPrompt, maxOutputTokens: 4000 });

        let preScreened: { idx: number; serperCandidate: SerperCandidate; preScore: number; preReasons: string[]; preSkills: string[]; preLocation: string | null; preYears: number | null }[] = [];
        try {
          const selected = JSON.parse(extractJSON(filterJson));
          for (const s of selected) {
            const idx = typeof s.index === "number" ? s.index : parseInt(s.index);
            if (idx >= 0 && idx < serperCandidates.length) {
              preScreened.push({
                idx,
                serperCandidate: serperCandidates[idx],
                preScore: s.match_score || 50,
                preReasons: s.match_reasons || [],
                preSkills: Array.isArray(s.skills) ? s.skills : [],
                preLocation: s.location || null,
                preYears: s.experience_years || null,
              });
            }
          }
          preScreened.sort((a, b) => b.preScore - a.preScore);
        } catch {
          console.error("[pipeline] AI pre-screen parse failed, using all serper results");
          preScreened = serperCandidates.slice(0, preScreenCount).map((c, i) => ({
            idx: i, serperCandidate: c, preScore: 50, preReasons: ["Profile matches search criteria"], preSkills: [], preLocation: null, preYears: null,
          }));
        }
        console.log(`[pipeline] Pre-screened: ${preScreened.length} candidates passed`);

        // Layer 3: Bright Data scrape (only pre-screened candidates)
        let brightDataProfiles: BrightDataProfile[] = [];
        if (hasBrightData && preScreened.length > 0) {
          await setStep("scraping");
          const urlsToScrape = preScreened.map((p) => p.serperCandidate.linkedin_url);
          console.log(`[pipeline] Layer 3: Bright Data scraping ${urlsToScrape.length} profiles...`);
          try {
            brightDataProfiles = await scrapeLinkedInProfiles(brightdataToken!, brightdataDatasetId!, urlsToScrape);
            console.log(`[pipeline] Bright Data returned ${brightDataProfiles.length} profiles`);
          } catch (bdErr) {
            console.error("[pipeline] Bright Data scraping failed:", bdErr instanceof Error ? bdErr.message : String(bdErr));
          }
        }

        // Layer 4: AI deep scoring with full profile data OR fallback to pre-screen scores
        if (brightDataProfiles.length > 0) {
          await setStep("scoring");
          const deepProfileTexts = brightDataProfiles.map((p, i) => brightDataProfileToRichText(p, i)).join("\n\n");
          const deepScorePrompt = buildDeepScorePrompt(parsed, deepProfileTexts, brightDataProfiles.length, candidateCount);

          console.log(`[pipeline] Layer 4: AI deep scoring ${brightDataProfiles.length} profiles → top ${candidateCount}`);
          const { text: deepJson } = await generateText({ model: anthropic(anthropicModel), prompt: deepScorePrompt, maxOutputTokens: 4000 });

          try {
            const deepScored = JSON.parse(extractJSON(deepJson));
            candidates = [];
            for (const s of deepScored) {
              const idx = typeof s.index === "number" ? s.index : parseInt(s.index);
              if (idx >= 0 && idx < brightDataProfiles.length) {
                const bdProfile = brightDataProfiles[idx];
                const c = {
                  name: bdProfile.name || "Unknown",
                  headline: bdProfile.current_company ? `${bdProfile.current_company.title || ""} at ${bdProfile.current_company.name || ""}`.trim() : null,
                  location: [bdProfile.city, bdProfile.country_code].filter(Boolean).join(", ") || null,
                  skills: Array.isArray(s.skills) ? s.skills : (bdProfile.skills || []).slice(0, 10),
                  experience_years: s.experience_years || null,
                  match_score: s.match_score || 50,
                  match_reasons: s.match_reasons || [],
                  profile_url: bdProfile.url || bdProfile.input?.url || null,
                  github_url: null as string | null,
                  email: null as string | null,
                  outreach_draft: null as string | null,
                };
                candidates.push(c);
                // Store rich metadata from Bright Data
                const meta: Record<string, unknown> = { source: "brightdata" };
                if (bdProfile.experience?.length) {
                  meta.work_history = bdProfile.experience.slice(0, 5).map((e) => ({
                    title: e.title, company: e.company, duration: e.duration, description: e.description?.substring(0, 200),
                  }));
                }
                if (bdProfile.education?.length) {
                  meta.education = bdProfile.education.slice(0, 3).map((e) => ({
                    school: e.subtitle, degree: e.degree, field: e.field_of_study,
                  }));
                }
                if (bdProfile.about) meta.about = bdProfile.about.substring(0, 500);
                candidateMetadata.push(meta);
              }
            }
            candidates.sort((a, b) => b.match_score - a.match_score);
          } catch {
            console.error("[pipeline] AI deep score parse failed, falling back to pre-screen data");
            brightDataProfiles = []; // trigger fallback below
          }
        }

        // Fallback: use pre-screen data if Bright Data unavailable or failed
        if (candidates.length === 0) {
          console.log(`[pipeline] Using pre-screen results (no Bright Data or deep scoring failed)`);
          candidates = preScreened.slice(0, candidateCount).map((p) => {
            const c = serperCandidateToDbCandidate(p.serperCandidate);
            c.match_score = p.preScore;
            c.match_reasons = p.preReasons;
            if (p.preSkills.length > 0) c.skills = p.preSkills;
            if (p.preLocation) c.location = p.preLocation;
            if (p.preYears) c.experience_years = p.preYears;
            candidateMetadata.push({ source: "google" });
            return c;
          });
        }

        // Layer 5: Email lookup (Apollo → Hunter fallback)
        if (candidates.length > 0 && (apolloApiKey || hunterApiKey)) {
          await setStep("enriching");
          console.log(`[pipeline] Layer 5: Email lookup for ${candidates.length} candidates (Apollo: ${!!apolloApiKey}, Hunter: ${!!hunterApiKey})`);
          for (let i = 0; i < candidates.length; i++) {
            const c = candidates[i];
            const nameParts = (c.name || "").split(" ");
            const firstName = nameParts[0] || "";
            const lastName = nameParts.slice(1).join(" ") || "";
            const company = c.headline?.match(/at\s+(.+)$/i)?.[1]?.trim() || "";
            if (!firstName || !c.profile_url) continue;
            try {
              const emailResult = await findEmail({
                apolloApiKey,
                hunterApiKey,
                firstName,
                lastName,
                company,
                linkedinUrl: c.profile_url,
              });
              if (emailResult.email) {
                c.email = emailResult.email;
                console.log(`[pipeline] Email found for ${c.name}: ${emailResult.email} (via ${emailResult.source})`);
              }
            } catch (emailErr) {
              console.log(`[pipeline] Email lookup failed for ${c.name}: ${emailErr instanceof Error ? emailErr.message : String(emailErr)}`);
            }
          }
        }
      }
    }

    // Insert candidates to DB
    if (usedDataSource && candidates.length > 0) {
      const scoredRows = candidates.map((c, i) => ({
        search_id: searchId,
        name: c.name || "Unknown",
        headline: c.headline || null,
        location: c.location || null,
        skills: Array.isArray(c.skills) ? c.skills : [],
        experience_years: c.experience_years || null,
        match_score: c.match_score || 0,
        match_reasons: Array.isArray(c.match_reasons) ? c.match_reasons : [],
        profile_url: c.profile_url || null,
        github_url: c.github_url || null,
        email: c.email || null,
        outreach_draft: null,
        metadata: candidateMetadata[i] || {},
      }));
      await supabaseAdmin.from("hirelix_candidates").insert(scoredRows);
      console.log(`[pipeline] Inserted ${scoredRows.length} candidates (source: ${dataSource})`);
    }

    if (!usedDataSource) {
      const reason = !dataSource
        ? "No data source available. Please contact the administrator or add your own PDL API key in Settings."
        : `${dataSource === "pdl" ? "PDL" : "Google"} search failed or returned no results. Please try again later.`;
      console.log(`[pipeline] No candidates: ${reason}`);
      await supabaseAdmin
        .from("hirelix_searches")
        .update({ status: "error", pipeline_step: "error", error_message: reason, updated_at: new Date().toISOString() })
        .eq("id", searchId);
      return;
    }

    // Step 3: Generate outreach emails
    await setStep("emailing");
    console.log(`[pipeline] Step 3: Generating ${candidates.length} outreach emails`);
    if (candidates.length > 0) {
      try {
        const hasEmails = candidates.some((c) => c.email && !c.email.includes("***"));
        const outreachType = hasEmails ? "email and LinkedIn InMail" : "LinkedIn InMail";
        const emailPrompt = `Write personalized recruiting outreach messages for each candidate below. Each message should be under 100 words, sound human, reference the candidate's specific background, and state the opportunity clearly.

Role: ${parsed.title}${parsed.company ? ` at ${parsed.company}` : ""}

Candidates:
${candidates.map((c, i) => `${i + 1}. ${c.name} — ${c.headline || "Professional"}, Skills: ${(Array.isArray(c.skills) ? c.skills : []).slice(0, 5).join(", ")}, ${c.experience_years || "?"} years exp, Match reasons: ${(Array.isArray(c.match_reasons) ? c.match_reasons : []).slice(0, 2).join("; ")}`).join("\n")}

Return a JSON array where each element has:
- index: number (0-based)
- subject: string (a compelling subject line)
- linkedin_message: string (a short LinkedIn InMail message, under 80 words, casual and direct, starting with "Hi [FirstName],")${hasEmails ? '\n- email: string (a slightly more formal email body, under 100 words, starting with "Hi [FirstName],")' : ""}

Return ONLY valid JSON, no markdown.`;

        const { text: emailsJson } = await generateText({
          model: anthropic(anthropicModel),
          prompt: emailPrompt,
          maxOutputTokens: 4000,
        });

        try {
          const emails = JSON.parse(extractJSON(emailsJson));
          for (const e of emails) {
            const idx = typeof e.index === "number" ? e.index : parseInt(e.index);
            if (idx >= 0 && idx < candidates.length) {
              const parts: Record<string, string> = {};
              if (e.subject) parts.subject = e.subject;
              if (e.linkedin_message) parts.linkedin = e.linkedin_message;
              if (e.email) parts.email = e.email;
              candidates[idx].outreach_draft = JSON.stringify(parts);
            }
          }
        } catch {
          console.error("[pipeline] Email parse failed");
        }
      } catch (emailErr) {
        console.error("[pipeline] Email generation failed:", emailErr);
      }

      // Fallback outreach
      const fallbackMsg = (name: string) => `Hi ${name.split(" ")[0]}, I came across your profile and thought your background would be a great fit for our ${parsed.title} role. Would you be open to a quick chat?`;
      for (const c of candidates) {
        if (!c.outreach_draft) {
          c.outreach_draft = JSON.stringify({
            subject: `${parsed.title} opportunity`,
            linkedin: fallbackMsg(c.name),
            email: fallbackMsg(c.name) + "\n\nBest regards",
          });
        }
      }
    }

    // Update candidates with outreach drafts
    if (candidates.length > 0) {
      const { data: dbCandidates } = await supabaseAdmin
        .from("hirelix_candidates")
        .select("id, name")
        .eq("search_id", searchId)
        .order("match_score", { ascending: false });

      if (dbCandidates) {
        for (let i = 0; i < Math.min(candidates.length, dbCandidates.length); i++) {
          if (candidates[i].outreach_draft) {
            await supabaseAdmin
              .from("hirelix_candidates")
              .update({ outreach_draft: candidates[i].outreach_draft })
              .eq("id", dbCandidates[i].id);
          }
        }
      }
    }

    await supabaseAdmin
      .from("hirelix_searches")
      .update({ status: "done", pipeline_step: "done", updated_at: new Date().toISOString() })
      .eq("id", searchId);
    console.log(`[pipeline] Done for search ${searchId}`);
  } catch (err) {
    console.error(`[pipeline] FAILED for ${searchId}:`, err instanceof Error ? err.message : String(err));
    console.error("[pipeline] Stack:", err instanceof Error ? err.stack : "no stack");
    await supabaseAdmin
      .from("hirelix_searches")
      .update({ status: "error", pipeline_step: "error", updated_at: new Date().toISOString() })
      .eq("id", searchId);
  }
}
