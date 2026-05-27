import { expect, type Page, test } from "@playwright/test";

const jdText =
  "We are hiring a Senior Backend Engineer for a remote US SaaS team. The role needs PostgreSQL, distributed systems, API design, observability, and strong product engineering judgment. Candidates should have owned production services and worked closely with product teams.";

const billingSummary = {
  plan: {
    code: "pro_monthly",
    name: "Pro",
    description: "For technical headhunters sourcing active roles.",
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

const completedSearch = {
  search: {
    id: "core-search",
    title: "Senior Backend Engineer",
    jd_text: jdText,
    parsed_requirements: {
      title: "Senior Backend Engineer",
      hiring_brief: {
        role_core: {
          title: "Senior Backend Engineer",
          required_skills: ["PostgreSQL", "Distributed Systems", "APIs"],
        },
        work_model: "remote",
        location_scope: "US",
        constraint_reasoning: "Backend SaaS role with production systems ownership.",
      },
      launch_scope: "linkedin_plus_github",
      display_stats: {
        priority_outreach_count: 1,
        worth_reviewing_count: 0,
        recall_profile_count: 120,
        deep_review_completed_count: 25,
        contact_unlock_candidates: 1,
      },
    },
    status: "done",
    pipeline_step: "done",
    error_message: null,
    queued_at: "2026-05-15T07:48:00.000Z",
    parse_completed_at: "2026-05-15T07:50:00.000Z",
    search_completed_at: "2026-05-15T07:58:00.000Z",
    partial_ready_at: "2026-05-15T07:58:00.000Z",
    done_at: "2026-05-15T08:00:00.000Z",
    created_at: "2026-05-15T07:48:00.000Z",
    updated_at: "2026-05-15T08:00:00.000Z",
  },
  candidates: [
    {
      id: "core-candidate-1",
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
  ],
};

async function mockLoggedInCoreFlow(page: Page, calls: Array<{ path: string; body: Record<string, unknown> }>) {
  await page.addInitScript(() => window.sessionStorage.clear());

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

    if (url.pathname === "/api/search/clarify") {
      calls.push({
        path: url.pathname,
        body: JSON.parse(request.postData() || "{}") as Record<string, unknown>,
      });
      await route.fulfill({
        json: {
          parsed_requirements: completedSearch.search.parsed_requirements,
          summary: {
            title: "Senior Backend Engineer",
            requiredSkills: ["PostgreSQL", "Distributed Systems", "APIs"],
            niceToHaveSkills: ["Observability"],
            experienceYearsMin: 7,
            workModel: "remote",
            locationScope: "US",
          },
          clarification: {
            message: "Ready to launch.",
            ready_to_launch: true,
          },
        },
      });
      return;
    }

    if (url.pathname === "/api/search/create") {
      calls.push({
        path: url.pathname,
        body: JSON.parse(request.postData() || "{}") as Record<string, unknown>,
      });
      await route.fulfill({ json: { id: "core-search" } });
      return;
    }

    if (url.pathname === "/api/searches/core-search") {
      await route.fulfill({ json: completedSearch });
      return;
    }

    await route.fulfill({
      status: 404,
      json: { error: `Unexpected API call in core flow test: ${request.method()} ${url.pathname}` },
    });
  });
}

test.describe("Core user flow", () => {
  test("keeps a pasted JD through the landing auth gate", async ({ page }) => {
    await page.goto("/");

    await page.getByPlaceholder("Paste the full client job description here...").fill(jdText);
    await page.getByTestId("hero-primary-cta").click();

    await expect(page.getByTestId("landing-auth-modal")).toBeVisible();
    await expect(page.getByRole("heading", { name: "One more step to build your shortlist." })).toBeVisible();
    await expect(page.getByTestId("landing-auth-preview-title")).toContainText("We are hiring a Senior Backend Engineer");
    await expect(page.getByRole("button", { name: /Continue with Google/i })).toBeVisible();
  });

  test("lets an authenticated recruiter create a sourcing run and land on the shortlist workbench", async ({
    page,
  }) => {
    const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
    await mockLoggedInCoreFlow(page, calls);

    await page.goto("/app/search/new");
    await expect(page.getByRole("heading", { name: "Paste the client role and confirm the brief." })).toBeVisible();

    await page.getByPlaceholder("Paste the full client job description here...").fill(jdText);
    await page.getByRole("button", { name: "Build brief" }).click();

    await expect(page.getByText("Reading JD...")).toBeVisible();
    await page.getByRole("button", { name: "Launch shortlist" }).click();
    await expect(page).toHaveURL(/\/app\/search\/core-search$/);
    await expect(page.getByRole("heading", { name: "Senior Backend Engineer" })).toBeVisible();
    await expect(page.getByTestId("client-ready-shortlist")).toContainText("Jordan Lee");
    await expect(page.getByTestId("outreach-approval-queue")).toContainText("LinkedIn copy");

    expect(calls.find((call) => call.path === "/api/search/clarify")?.body).toMatchObject({
      jd_text: jdText,
    });
    expect(calls.find((call) => call.path === "/api/search/create")?.body).toMatchObject({
      jd_text: jdText,
      candidate_count: 50,
    });
  });
});
