import test from "node:test";
import assert from "node:assert/strict";

import { findEmail } from "../src/lib/hunter";

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("findEmail falls through to Hunter when Apollo rejects current credentials", async () => {
  const requests: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    requests.push(url);

    if (url.includes("apollo.io")) {
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
