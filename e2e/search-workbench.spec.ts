import { expect, type Page, test } from "@playwright/test";

type CandidatePatch = {
  id: string;
  body: Record<string, unknown>;
};

const now = "2026-05-15T08:00:00.000Z";

const billingSummary = {
  plan: {
    code: "pro_monthly",
    name: "Pro",
    description: "For independent technical headhunters sourcing active roles.",
    priceLabel: "$299",
    cadenceLabel: "per seat / month",
    billingCycle: "month",
    searchesPerMonth: 30,
    candidateLimitPerSearch: 50,
    enrichesPerMonth: 300,
    exportEnabled: true,
    clientBriefEnabled: true,
    priceCents: 29900,
    ctaLabel: "Upgrade monthly",
  },
  subscription: {
    planCode: "pro_monthly",
    status: "active",
    billingCycle: "month",
    startedAt: "2026-05-01T00:00:00.000Z",
    renewsAt: "2026-06-01T00:00:00.000Z",
  },
  usage: {
    periodStart: "2026-05-01T00:00:00.000Z",
    periodEnd: "2026-06-01T00:00:00.000Z",
    searchesUsed: 4,
    searchesLimit: 30,
    searchesRemaining: 26,
    enrichesUsed: 21,
    enrichesLimit: 300,
    enrichesRemaining: 279,
    candidateLimitPerSearch: 50,
    exportEnabled: true,
    clientBriefEnabled: true,
    extraSearchCredits: 0,
    extraEnrichCredits: 0,
  },
  checkout: {
    paddleEnabled: false,
    monthlyPriceIdConfigured: false,
    annualPriceIdConfigured: false,
    starterMonthlyPriceIdConfigured: false,
    starterAnnualPriceIdConfigured: false,
    businessPriceIdConfigured: false,
    agencyPriceIdConfigured: false,
    searchPackPriceIdConfigured: false,
    contactPackPriceIdConfigured: false,
  },
};

const searchFixture = {
  search: {
    id: "search-workbench",
    title: "Senior Backend Engineer",
    jd_text:
      "We need a senior backend engineer with PostgreSQL, distributed systems, API design, and product engineering depth for a US remote SaaS role.",
    parsed_requirements: {
      hiring_brief: {
        role_core: {
          title: "Senior Backend Engineer",
          required_skills: ["PostgreSQL", "Distributed Systems", "APIs"],
        },
        work_model: "remote",
        location_scope: "US",
        constraint_reasoning:
          "Strict backend role with product systems scope and clear public evidence requirements.",
      },
      launch_scope: "linkedin_plus_github",
      display_stats: {
        priority_outreach_count: 2,
        worth_reviewing_count: 0,
        recall_profile_count: 120,
        deep_review_completed_count: 25,
        contact_unlock_candidates: 2,
        brief_ready_at: "2026-05-15T07:50:00.000Z",
        time_to_brief_ready_ms: 90_000,
      },
    },
    status: "done",
    pipeline_step: "done",
    error_message: null,
    queued_at: "2026-05-15T07:48:00.000Z",
    parse_completed_at: "2026-05-15T07:50:00.000Z",
    search_completed_at: "2026-05-15T07:58:00.000Z",
    partial_ready_at: "2026-05-15T07:58:00.000Z",
    done_at: now,
    created_at: "2026-05-15T07:48:00.000Z",
    updated_at: now,
  },
  candidates: [
    {
      id: "candidate-1",
      name: "Jordan Lee",
      headline: "Senior Backend Engineer at Stripe",
      location: "New York, NY",
      skills: ["PostgreSQL", "APIs", "Distributed Systems"],
      experience_years: 8,
      match_score: 91,
      match_reasons: ["Built payment APIs", "Strong PostgreSQL depth"],
      profile_url: "https://linkedin.com/in/jordan-lee",
      github_url: "https://github.com/jordanlee",
      email: "jordan@example.com",
      outreach_draft: JSON.stringify({
        subject: "Jordan, quick question about backend systems",
        linkedin: "Hi Jordan, your backend systems work stood out because of the API depth.",
        email: "Hi Jordan, your backend systems work stood out because of the API depth.",
      }),
      status: "new",
      metadata: {
        display_tier: "priority_outreach",
        work_history: [{ title: "Senior Backend Engineer", company: "Stripe", start_date: "2021", end_date: null }],
        suitability: {
          advance_recommendation: "advance",
          blocking_severity: "none",
          constraint_verdicts: {
            location_fit: "local",
            work_model_fit: "yes",
            must_have_coverage: "strong",
          },
        },
        scoring_breakdown: {
          capability_score: 92,
          relevance_score: 90,
          join_likelihood_score: 75,
          overall_score: 91,
        },
        selling_kit: {
          version: 1,
          evidence_basis: "public_evidence",
          recommendation: "reach_out_first",
          one_line_pitch: "Strong backend systems match with concrete API evidence.",
          outreach_opener: "Your backend API work at Stripe stood out.",
          client_brief: {
            positioning: "Jordan is a strong backend candidate for API-heavy systems work.",
            why_match: ["Deep API experience", "PostgreSQL production ownership"],
            evidence_refs: ["GitHub API project [1]"],
            risks_to_verify: ["Confirm startup interest"],
          },
          evidence_badges: [{ label: "API depth", tier: "strong", citation_label: "[1]" }],
          risk_flags: ["Confirm compensation range"],
        },
      },
    },
    {
      id: "candidate-2",
      name: "Priya Shah",
      headline: "Staff Software Engineer at Datadog",
      location: "Austin, TX",
      skills: ["Distributed Systems", "Observability", "APIs"],
      experience_years: 10,
      match_score: 84,
      match_reasons: ["Led observability platform work", "Strong distributed systems background"],
      profile_url: "https://linkedin.com/in/priya-shah",
      github_url: "https://github.com/priyashah",
      email: "priya@example.com",
      outreach_draft: JSON.stringify({
        subject: "Priya, backend platform role",
        linkedin: "Hi Priya, your observability platform work looks relevant to this backend role.",
        email: "Hi Priya, your observability platform work looks relevant to this backend role.",
      }),
      status: "new",
      metadata: {
        display_tier: "priority_outreach",
        work_history: [{ title: "Staff Software Engineer", company: "Datadog", start_date: "2020", end_date: null }],
        suitability: {
          advance_recommendation: "advance",
          blocking_severity: "none",
          constraint_verdicts: {
            location_fit: "nearby",
            work_model_fit: "yes",
            must_have_coverage: "strong",
          },
        },
        scoring_breakdown: {
          capability_score: 88,
          relevance_score: 82,
          join_likelihood_score: 71,
          overall_score: 84,
        },
        selling_kit: {
          version: 1,
          evidence_basis: "public_evidence",
          recommendation: "reach_out_first",
          one_line_pitch: "Platform engineer with strong observability and systems evidence.",
          outreach_opener: "Your observability platform work at Datadog stood out.",
          client_brief: {
            positioning: "Priya is a strong backup-to-lead candidate for platform-heavy backend work.",
            why_match: ["Distributed systems leadership", "API and observability depth"],
            evidence_refs: ["Open source observability contribution [1]"],
            risks_to_verify: ["Confirm hands-on coding appetite"],
          },
          evidence_badges: [{ label: "Systems depth", tier: "strong", citation_label: "[1]" }],
          risk_flags: ["Confirm current availability"],
        },
      },
    },
  ],
};

async function mockAuthenticatedWorkbench(page: Page, patches: CandidatePatch[]) {
  await page.addInitScript(() => {
    window.sessionStorage.clear();
  });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/api/auth/get-session") {
      await route.fulfill({
        json: {
          user: {
            id: "test-user",
            email: "recruiter@example.com",
            name: "Test Recruiter",
            image: null,
          },
          session: {
            id: "test-session",
            userId: "test-user",
            expiresAt: "2026-06-15T00:00:00.000Z",
          },
        },
      });
      return;
    }

    if (url.pathname === "/api/billing") {
      await route.fulfill({ json: { billing: billingSummary } });
      return;
    }

    if (url.pathname === "/api/searches/search-workbench") {
      await route.fulfill({ json: searchFixture });
      return;
    }

    const candidateMatch = url.pathname.match(/^\/api\/candidates\/([^/]+)$/);
    if (candidateMatch && request.method() === "PATCH") {
      patches.push({
        id: candidateMatch[1],
        body: JSON.parse(request.postData() || "{}") as Record<string, unknown>,
      });
      await route.fulfill({ json: { ok: true } });
      return;
    }

    await route.fulfill({
      status: 404,
      json: { error: `Unexpected API call in e2e: ${request.method()} ${url.pathname}` },
    });
  });
}

test.describe("Search workbench", () => {
  test.skip(({ isMobile }) => isMobile, "Workbench regression is covered on desktop.");

  test("covers client brief, outreach approval, and real-role validation status tracking", async ({
    context,
    page,
  }) => {
    const patches: CandidatePatch[] = [];
    await mockAuthenticatedWorkbench(page, patches);

    await page.goto("/app/search/search-workbench");
    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: new URL(page.url()).origin,
    });

    const shortlist = page.getByTestId("client-ready-shortlist");
    await expect(shortlist).toBeVisible();
    await expect(shortlist).toContainText("Client-ready shortlist");
    await expect(shortlist).toContainText("Jordan Lee");
    await expect(shortlist).toContainText("Priya Shah");

    await page.getByTestId("copy-client-brief").click();
    await expect(page.getByTestId("copy-client-brief")).toContainText("Copied");
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toContain("Client-ready shortlist: Senior Backend Engineer");

    const queue = page.getByTestId("outreach-approval-queue");
    await expect(queue).toBeVisible();
    await expect(queue).toContainText("Outreach approval queue");
    for (const status of ["contacted", "replied", "submitted", "interview", "placed"]) {
      await expect(page.getByTestId(`validation-count-${status}-value`)).toHaveText("0");
    }

    await expect(page.getByTestId("copy-linkedin-candidate-1")).toBeEnabled();
    await page.getByTestId("copy-linkedin-candidate-1").click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toContain("backend systems work stood out");

    await page.getByTestId("mark-contacted-candidate-1").click();
    await expect(page.getByTestId("validation-count-contacted-value")).toHaveText("1");
    await expect(page.getByTestId("outreach-queue-candidate-candidate-1")).toContainText("Contacted");

    await page.getByTestId("mark-submitted-candidate-2").click();
    await expect(page.getByTestId("validation-count-submitted-value")).toHaveText("1");
    await expect(page.getByTestId("outreach-queue-candidate-candidate-2")).toContainText("Submitted");

    await expect
      .poll(() => patches.map((patch) => `${patch.id}:${String(patch.body.status)}`).join("|"))
      .toContain("candidate-1:contacted");
    expect(patches).toContainEqual({ id: "candidate-2", body: { status: "submitted" } });
  });
});
