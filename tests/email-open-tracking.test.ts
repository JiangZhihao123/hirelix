import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { GET } from "../src/app/o/[emailId]/pixel.gif/route";
import {
  classifyEmailImageRequest,
  isValidEmailPixelId,
} from "../src/lib/email-open-tracking";

test("email pixel accepts bounded outreach and test ids", () => {
  assert.equal(isValidEmailPixelId("2026-07-28-pixeltest-gmail"), true);
  assert.equal(isValidEmailPixelId("2026-07-28-batch12-recruiter-name"), true);
  assert.equal(isValidEmailPixelId("../../etc/passwd"), false);
  assert.equal(isValidEmailPixelId("arbitrary-id"), false);
});

test("email pixel distinguishes Gmail proxy and security scanners", () => {
  assert.equal(
    classifyEmailImageRequest("Mozilla/5.0 (via ggpht.com GoogleImageProxy)"),
    "image_proxy",
  );
  assert.equal(classifyEmailImageRequest("Proofpoint URL Defense Scanner"), "security_scanner");
  assert.equal(classifyEmailImageRequest("curl/8.7.1"), "automated_or_unknown");
  assert.equal(classifyEmailImageRequest("Mozilla/5.0 AppleWebKit/605.1.15"), "mail_client_or_proxy");
});

test("invalid email pixel ids return a non-cacheable transparent GIF without database access", async () => {
  const response = await GET(
    new NextRequest("https://hirelix.online/o/invalid/pixel.gif"),
    { params: Promise.resolve({ emailId: "invalid" }) },
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/gif");
  assert.match(response.headers.get("cache-control") || "", /no-store/);
  assert.equal((await response.arrayBuffer()).byteLength, 43);
});
