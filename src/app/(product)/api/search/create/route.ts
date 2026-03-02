import { NextRequest, NextResponse } from "next/server";
// import { after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { JD_PARSE_PROMPT } from "@/lib/prompts";
import { buildPDLQuery, searchPeople, pdlPersonToCandidate } from "@/lib/pdl";

export const maxDuration = 60;

/** Strip markdown code fences from Claude responses */
function extractJSON(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  return text.trim();
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
    const { jd_text } = await req.json();
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

    // Await the full pipeline before returning — maxDuration=60 gives enough time
    await parseAndGenerate(search.id, jd_text.trim());

    return NextResponse.json({ id: search.id });
  } catch (err) {
    console.error("Search create error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

async function parseAndGenerate(searchId: string, jdText: string) {
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const anthropicBaseUrl = process.env.ANTHROPIC_BASE_URL;
  const anthropicModel = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
  const pdlApiKey = process.env.PDL_API_KEY;

  if (!anthropicApiKey) {
    // No API key: use mock data for development
    await mockGenerate(searchId, jdText);
    return;
  }

  try {
    console.log(`[parseAndGenerate] Starting for search ${searchId}`);
    console.log(`[parseAndGenerate] Config: baseUrl=${anthropicBaseUrl}, model=${anthropicModel}, hasPDL=${!!pdlApiKey}`);

    const anthropic = createAnthropic({
      apiKey: anthropicApiKey,
      ...(anthropicBaseUrl ? { baseURL: anthropicBaseUrl } : {}),
    });

    // Step 1: Parse JD with Claude
    console.log(`[parseAndGenerate] Step 1: Parsing JD...`);
    const { text: parsedJson } = await generateText({
      model: anthropic(anthropicModel),
      system: JD_PARSE_PROMPT,
      prompt: jdText,
      maxOutputTokens: 2000,
    });
    console.log(`[parseAndGenerate] Step 1 done, raw length: ${parsedJson.length}`);

    let parsed;
    try {
      parsed = JSON.parse(extractJSON(parsedJson));
    } catch {
      parsed = { title: "Untitled Role", required_skills: [], experience_years_min: 0 };
    }

    await supabaseAdmin
      .from("hirelix_searches")
      .update({
        title: parsed.title || "Untitled Role",
        parsed_requirements: parsed,
      })
      .eq("id", searchId);

    // Step 2: Search for real candidates via PDL, or fall back to AI-generated
    let candidates: {
      name: string;
      headline: string | null;
      location: string | null;
      skills: string[];
      experience_years: number | null;
      match_score: number;
      match_reasons: string[];
      profile_url: string | null;
      email: string | null;
      outreach_draft: string | null;
    }[];

    if (pdlApiKey) {
      // --- Real candidates from People Data Labs ---
      const pdlQuery = buildPDLQuery(parsed);
      console.log("[PDL] Query:", JSON.stringify(pdlQuery));

      const pdlResult = await searchPeople(pdlApiKey, pdlQuery, 10);
      console.log(`[PDL] Found ${pdlResult.total} total, returned ${pdlResult.data.length}`);

      candidates = pdlResult.data.map((p) => pdlPersonToCandidate(p));

      // Use Claude to score & rank the real candidates
      if (candidates.length > 0) {
        const scoringPrompt = `You are a recruiting AI. Score each candidate based on how well they match the job requirements.

Job Requirements:
${JSON.stringify(parsed, null, 2)}

Candidates:
${candidates.map((c, i) => `${i + 1}. ${c.name} — ${c.headline || "N/A"}, Skills: ${c.skills.slice(0, 10).join(", ")}, ${c.experience_years || "?"} years exp, Location: ${c.location || "Unknown"}`).join("\n")}

For each candidate (by number), return a JSON array with objects containing:
- index: number (0-based)
- match_score: number 0-100
- match_reasons: string[] (2-3 specific reasons)

Return ONLY valid JSON array, no markdown.`;

        const { text: scoringJson } = await generateText({
          model: anthropic(anthropicModel),
          prompt: scoringPrompt,
          maxOutputTokens: 3000,
        });

        try {
          const scores = JSON.parse(extractJSON(scoringJson));
          for (const s of scores) {
            const idx = typeof s.index === "number" ? s.index : parseInt(s.index);
            if (idx >= 0 && idx < candidates.length) {
              candidates[idx].match_score = s.match_score || 50;
              candidates[idx].match_reasons = s.match_reasons || [];
            }
          }
        } catch {
          // If scoring fails, assign default scores based on position
          candidates.forEach((c, i) => {
            c.match_score = Math.max(50, 95 - i * 5);
            c.match_reasons = ["Profile matches required skills"];
          });
        }

        // Sort by match score descending
        candidates.sort((a, b) => b.match_score - a.match_score);
      }
    } else {
      // --- No PDL key: AI-generated fake candidates ---
      const { text: candidatesJson } = await generateText({
        model: anthropic(anthropicModel),
        system: `You are a recruiting AI. Generate 10 realistic candidate profiles matching these requirements. Return ONLY a JSON array.`,
        prompt: `Job Requirements:\n${JSON.stringify(parsed, null, 2)}\n\nGenerate 10 candidates with fields: name, headline, location, skills (array), experience_years, match_score (0-100), match_reasons (array), profile_url, email. Make them diverse in match quality and background.`,
        maxOutputTokens: 8000,
      });

      try {
        candidates = JSON.parse(extractJSON(candidatesJson));
      } catch {
        candidates = [];
      }
    }

    // Step 3: Generate personalized outreach emails for each candidate
    for (const c of candidates) {
      try {
        const { text: emailDraft } = await generateText({
          model: anthropic(anthropicModel),
          system: `Write a short personalized recruiting outreach email (under 150 words). Sound human, reference the candidate's background, state the opportunity clearly. Return ONLY the email text starting with "Hi [Name],".`,
          prompt: `Role: ${parsed.title}${parsed.company ? ` at ${parsed.company}` : ""}\nCandidate: ${c.name}, ${c.headline || "Professional"}\nSkills: ${c.skills.slice(0, 8).join(", ")}\nExperience: ${c.experience_years || "N/A"} years\nMatch reasons: ${c.match_reasons.join("; ") || "General fit"}`,
          maxOutputTokens: 500,
        });
        c.outreach_draft = emailDraft;
      } catch (emailErr) {
        console.error(`[email] Failed for ${c.name}:`, emailErr);
        c.outreach_draft = `Hi ${c.name.split(" ")[0]},\n\nI came across your profile and thought your background would be a great fit for our ${parsed.title} role. Would you be open to a quick chat?\n\nBest regards`;
      }
    }

    // Insert candidates into DB
    if (candidates.length > 0) {
      const rows = candidates.map((c) => ({
        search_id: searchId,
        name: c.name || "Unknown",
        headline: c.headline || null,
        location: c.location || null,
        skills: c.skills || [],
        experience_years: c.experience_years || null,
        match_score: c.match_score || 0,
        match_reasons: c.match_reasons || [],
        profile_url: c.profile_url || null,
        email: c.email || null,
        outreach_draft: c.outreach_draft || null,
      }));

      await supabaseAdmin.from("hirelix_candidates").insert(rows);
    }

    await supabaseAdmin
      .from("hirelix_searches")
      .update({ status: "done", updated_at: new Date().toISOString() })
      .eq("id", searchId);
  } catch (err) {
    console.error("[parseAndGenerate] FAILED at some step:", err instanceof Error ? err.message : String(err));
    console.error("[parseAndGenerate] Stack:", err instanceof Error ? err.stack : "no stack");
    await supabaseAdmin
      .from("hirelix_searches")
      .update({ status: "error", updated_at: new Date().toISOString() })
      .eq("id", searchId);
  }
}

async function mockGenerate(searchId: string, jdText: string) {
  // Extract a rough title from the first line
  const firstLine = jdText.split("\n")[0].trim();
  const title = firstLine.length > 80 ? firstLine.slice(0, 80) : firstLine;

  await supabaseAdmin
    .from("hirelix_searches")
    .update({
      title: title || "Untitled Role",
      parsed_requirements: {
        title,
        required_skills: ["React", "TypeScript", "Node.js"],
        experience_years_min: 3,
        seniority: "Senior",
      },
      status: "processing",
    })
    .eq("id", searchId);

  // Simulate some delay
  await new Promise((r) => setTimeout(r, 2000));

  const mockCandidates = [
    { name: "Alex Chen", headline: "Senior Frontend Engineer at Stripe", location: "San Francisco, CA", skills: ["React", "TypeScript", "GraphQL", "Node.js"], experience_years: 6, match_score: 95, match_reasons: ["Strong React/TS experience", "Built payment UIs at scale", "Open source contributor"], profile_url: "https://linkedin.com/in/alex-chen", email: "alex.chen@example.com", outreach_draft: "Hi Alex,\n\nI came across your work at Stripe and was impressed by your experience building complex payment interfaces with React and TypeScript.\n\nWe're building Hirelix, an AI-powered recruiting tool, and are looking for a Senior Frontend Engineer to help shape our product. Given your background in building polished, user-facing products, I think you'd be a great fit.\n\nWould you be open to a quick 15-minute chat this week?\n\nBest,\n[Your Name]" },
    { name: "Sarah Kim", headline: "Staff Engineer at Vercel", location: "Remote", skills: ["Next.js", "React", "TypeScript", "Tailwind CSS"], experience_years: 8, match_score: 92, match_reasons: ["Deep Next.js expertise", "Staff-level engineering", "Full-stack capable"], profile_url: "https://linkedin.com/in/sarah-kim", email: "sarah.kim@example.com", outreach_draft: "Hi Sarah,\n\nYour work on the Vercel platform caught my eye — especially your contributions to the Next.js ecosystem.\n\nWe're hiring a Senior Frontend Engineer at Hirelix to build our AI-powered recruiting product. Your experience with Next.js and modern React patterns would be incredibly valuable here.\n\nWould you have 15 minutes for a quick conversation?\n\nBest,\n[Your Name]" },
    { name: "Marcus Johnson", headline: "Frontend Lead at Notion", location: "New York, NY", skills: ["React", "TypeScript", "CSS", "Performance Optimization"], experience_years: 7, match_score: 88, match_reasons: ["Led frontend team", "Performance optimization expert", "Product-minded engineer"], profile_url: "https://linkedin.com/in/marcus-johnson", email: "marcus.j@example.com", outreach_draft: "Hi Marcus,\n\nI noticed your work leading the frontend team at Notion — the attention to performance and UX detail really stands out.\n\nWe're looking for a Senior Frontend Engineer at Hirelix who can bring that same craft to our AI recruiting product. It's an early-stage opportunity with a lot of ownership.\n\nWould you be open to learning more?\n\nBest,\n[Your Name]" },
    { name: "Priya Patel", headline: "Senior Software Engineer at Figma", location: "San Francisco, CA", skills: ["React", "TypeScript", "WebGL", "Node.js", "Python"], experience_years: 5, match_score: 85, match_reasons: ["Complex UI engineering", "Real-time collaboration experience", "Strong CS fundamentals"], profile_url: "https://linkedin.com/in/priya-patel", email: "priya.patel@example.com", outreach_draft: "Hi Priya,\n\nYour experience building Figma's collaborative interfaces is really impressive — the real-time UI challenges you've tackled are exactly the kind of problems we're solving.\n\nAt Hirelix, we're building an AI recruiting agent and need a Senior Frontend Engineer. I think your background would translate perfectly.\n\nInterested in a quick chat?\n\nBest,\n[Your Name]" },
    { name: "David Nguyen", headline: "Full Stack Developer at Shopify", location: "Toronto, Canada", skills: ["React", "Ruby on Rails", "TypeScript", "PostgreSQL"], experience_years: 4, match_score: 78, match_reasons: ["Full-stack capability", "E-commerce product experience", "Fast learner"], profile_url: "https://linkedin.com/in/david-nguyen", email: "d.nguyen@example.com", outreach_draft: "Hi David,\n\nI came across your profile and was drawn to your full-stack experience at Shopify, particularly your work on merchant-facing tools.\n\nWe're building Hirelix — an AI tool that helps recruiters find candidates faster. We're looking for a Senior Frontend Engineer, and your product-building experience would be a great fit.\n\nWould you be open to a brief conversation?\n\nBest,\n[Your Name]" },
    { name: "Emily Rodriguez", headline: "React Developer at Airbnb", location: "Los Angeles, CA", skills: ["React", "TypeScript", "Testing", "Accessibility"], experience_years: 5, match_score: 82, match_reasons: ["Strong React expertise", "Accessibility focus", "Large-scale app experience"], profile_url: "https://linkedin.com/in/emily-rodriguez", email: "emily.r@example.com", outreach_draft: "Hi Emily,\n\nYour focus on accessibility and quality at Airbnb really stood out to me — it's rare to find engineers who prioritize inclusive design from the start.\n\nWe're hiring a Senior Frontend Engineer at Hirelix to build our AI recruiting platform. We'd love someone who brings that same attention to craft.\n\nWould you have time for a quick call?\n\nBest,\n[Your Name]" },
    { name: "James Wright", headline: "Frontend Engineer at Linear", location: "Remote (Europe)", skills: ["React", "TypeScript", "Tailwind", "Framer Motion"], experience_years: 4, match_score: 80, match_reasons: ["Fast-paced startup experience", "Beautiful UI craft", "Modern stack alignment"], profile_url: "https://linkedin.com/in/james-wright", email: "james.w@example.com", outreach_draft: "Hi James,\n\nLinear's UI is one of the best in SaaS — and knowing you've been part of building that says a lot about your craft.\n\nWe're looking for a Senior Frontend Engineer at Hirelix to help build an AI recruiting tool. The role involves a lot of the same attention to detail and speed that Linear is known for.\n\nWould you be interested in chatting?\n\nBest,\n[Your Name]" },
    { name: "Lisa Chang", headline: "Senior UI Engineer at Databricks", location: "Seattle, WA", skills: ["React", "TypeScript", "D3.js", "Data Visualization"], experience_years: 6, match_score: 75, match_reasons: ["Data visualization skills", "Enterprise UI experience", "TypeScript expertise"], profile_url: "https://linkedin.com/in/lisa-chang", email: "lisa.chang@example.com", outreach_draft: "Hi Lisa,\n\nYour work on data visualization at Databricks is impressive — especially the complex dashboards you've built with React and D3.\n\nAt Hirelix, we're building an AI recruiting tool where data presentation is key. We're looking for a Senior Frontend Engineer, and your visualization expertise would be a unique asset.\n\nWould you be open to learning more?\n\nBest,\n[Your Name]" },
    { name: "Tom Anderson", headline: "Software Engineer at GitHub", location: "Remote", skills: ["React", "Ruby", "TypeScript", "Git"], experience_years: 3, match_score: 72, match_reasons: ["Developer tool experience", "Open source mindset", "Growing skill set"], profile_url: "https://linkedin.com/in/tom-anderson", email: "tom.a@example.com", outreach_draft: "Hi Tom,\n\nYour work at GitHub and your contributions to open source projects caught my attention.\n\nWe're building Hirelix, an AI recruiting tool, and looking for a frontend engineer who understands developer tools. Your experience building for a technical audience would be really valuable.\n\nWould you be up for a quick conversation?\n\nBest,\n[Your Name]" },
    { name: "Nina Volkov", headline: "Frontend Developer at Wise", location: "London, UK", skills: ["React", "TypeScript", "Micro-frontends", "CI/CD"], experience_years: 5, match_score: 68, match_reasons: ["Fintech product experience", "Micro-frontend architecture", "International team experience"], profile_url: "https://linkedin.com/in/nina-volkov", email: "nina.v@example.com", outreach_draft: "Hi Nina,\n\nYour experience building fintech products at Wise — especially the micro-frontend architecture — is really interesting.\n\nWe're looking for a Senior Frontend Engineer at Hirelix to help build our AI recruiting platform. The architectural challenges are similar to what you've tackled at Wise.\n\nWould you have time for a brief chat?\n\nBest,\n[Your Name]" },
  ];

  const rows = mockCandidates.map((c) => ({
    search_id: searchId,
    ...c,
  }));

  await supabaseAdmin.from("hirelix_candidates").insert(rows);

  await supabaseAdmin
    .from("hirelix_searches")
    .update({ status: "done", updated_at: new Date().toISOString() })
    .eq("id", searchId);
}
