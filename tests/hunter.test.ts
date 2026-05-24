import test from "node:test";
import assert from "node:assert/strict";

import { checkApolloHealth, findEmail } from "../src/lib/hunter";

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("findEmail falls through to Hunter when Apollo rejects current credentials", async () => {
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    requests.push(url);

    if (url.includes("apollo.io")) {
      assert.equal(url.startsWith("https://api.apollo.io/api/v1/people/match?"), true);
      const params = new URL(url).searchParams;
      assert.equal(params.get("linkedin_url"), "https://www.linkedin.com/in/ada-lovelace/");
      assert.equal(params.get("domain"), "example.com");
      assert.equal(params.get("reveal_personal_emails"), "false");
      return new Response("Invalid access credentials.", { status: 401 });
    }

    if (url.includes("/email-finder")) {
      assert.equal(new URL(url).searchParams.get("domain"), "example.com");
      return Response.json({
        data: {
          email: "ada.lovelace@example.com",
          score: 96,
          company: "Example",
          sources: [],
        },
      });
    }

    throw new Error(`Unexpected request: ${url}`);
  };

  const result = await findEmail({
    apolloApiKey: "bad-apollo-key",
    hunterApiKey: "hunter-key",
    firstName: "Ada",
    lastName: "Lovelace",
    linkedinUrl: "https://www.linkedin.com/in/ada-lovelace/",
    metadata: {
      current_company: {
        name: "Example",
        website: "https://www.example.com/about",
      },
    },
  });

  assert.deepEqual(result, {
    name: "Ada Lovelace",
    email: "ada.lovelace@example.com",
    confidence: 96,
    source: "hunter",
  });
  assert.equal(requests.length, 2);
});

test("findEmail returns Apollo as the primary precise source when people enrichment finds work email", async () => {
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    requests.push(url);

    if (url.includes("apollo.io")) {
      return Response.json({
        person: {
          email: "ada@apollo-example.com",
        },
      });
    }

    throw new Error(`Unexpected fallback request: ${url}`);
  };

  const result = await findEmail({
    apolloApiKey: "apollo-key",
    hunterApiKey: "hunter-key",
    firstName: "Ada",
    lastName: "Lovelace",
    linkedinUrl: "https://www.linkedin.com/in/ada-lovelace/",
    metadata: {
      company_domain: "apollo-example.com",
    },
  });

  assert.deepEqual(result, {
    name: "Ada Lovelace",
    email: "ada@apollo-example.com",
    confidence: 90,
    source: "apollo",
  });
  assert.equal(requests.length, 1);
});

test("checkApolloHealth requires Apollo to report an authenticated API key", async () => {
  globalThis.fetch = async (input) => {
    assert.equal(String(input), "https://api.apollo.io/api/v1/auth/health");
    return Response.json({
      healthy: true,
      is_logged_in: true,
    });
  };

  assert.deepEqual(await checkApolloHealth("apollo-key"), {
    healthy: true,
    isLoggedIn: true,
  });
});

test("findEmail verifies guessed email patterns only when Hunter marks them valid with enough score", async () => {
  const verifiedEmails: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);

    if (url.includes("/email-finder")) {
      return Response.json({ data: { email: null, score: 0, sources: [] } });
    }

    if (url.includes("/email-verifier")) {
      const email = new URL(url).searchParams.get("email") || "";
      verifiedEmails.push(email);
      return Response.json({
        data: {
          status: email === "ada@example.com" ? "valid" : "invalid",
          score: email === "ada@example.com" ? 90 : 20,
        },
      });
    }

    throw new Error(`Unexpected request: ${url}`);
  };

  const result = await findEmail({
    hunterApiKey: "hunter-key",
    firstName: "Ada",
    lastName: "Lovelace",
    linkedinUrl: "https://www.linkedin.com/in/ada-lovelace/",
    metadata: {
      company_name: "Example",
      company_domain: "example.com",
    },
  });

  assert.equal(result.email, "ada@example.com");
  assert.equal(result.confidence, 90);
  assert.equal(result.source, "hunter");
  assert.deepEqual(verifiedEmails, [
    "ada.lovelace@example.com",
    "adalovelace@example.com",
    "ada@example.com",
  ]);
});
