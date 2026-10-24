import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { ATTRIBUTION_COOKIE, ATTRIBUTION_MAX_AGE, ATTRIBUTION_STORAGE, acquisitionMetadata, readAcquisitionCookie, resolveAcquisition } from "../src/lib/growth-attribution";
import { getAttributionFromBrowser, syncAcquisitionCookie } from "../src/lib/analytics";
import { telemetryMetadata } from "../src/lib/telemetry";

test("first touch is fixed; latest non-direct replaces the whole touch and expires after 90 days", () => {
  const now = Date.now();
  assert.equal(resolveAcquisition(null, { traffic_source: "qa_internal" }, false, now).first.traffic_source, "direct");
  const first = resolveAcquisition(null, { traffic_source: "qa_email", utm_campaign: "qa_campaign", utm_content: "qa_alpha" }, true, now);
  const internal = resolveAcquisition(first, { traffic_source: "qa_poison" }, false, now + 1);
  const direct = resolveAcquisition(internal, { traffic_source: "direct" }, true, now + 2);
  assert.deepEqual(direct, first);
  const latest = resolveAcquisition(direct, { traffic_source: "qa_other", utm_campaign: "qa_second" }, true, now + 3);
  assert.equal(latest.first.utm_content, "qa_alpha");
  assert.equal(latest.latest.traffic_source, "qa_other");
  assert.equal(latest.latest.utm_content, undefined);
  const expired = resolveAcquisition(latest, { traffic_source: "direct" }, true, now + (ATTRIBUTION_MAX_AGE + 1) * 1000);
  assert.equal(expired.first.traffic_source, "direct");
});

test("attribution cookie and metadata accept only bounded campaign labels and UUID browser/session IDs", () => {
  const state = resolveAcquisition(null, { traffic_source: "qa_email", utm_content: "contact@example.test", utm_campaign: "https://private.test/?token=secret" }, true);
  assert.equal(state.latest.utm_content, undefined);
  const cookie = `${ATTRIBUTION_COOKIE}=${encodeURIComponent(JSON.stringify({ ...state, visitor_id: randomUUID(), session_id: randomUUID(), email: "never-collect@example.test" }))}`;
  const parsed = readAcquisitionCookie(cookie)!;
  assert.ok(parsed);
  assert.ok(!JSON.stringify(parsed).includes("@"));
  assert.equal(readAcquisitionCookie(`${ATTRIBUTION_COOKIE}=broken`), null);
  assert.equal(readAcquisitionCookie(`${ATTRIBUTION_COOKIE}=${encodeURIComponent(JSON.stringify(state))}`), null);
  assert.deepEqual(telemetryMetadata({ ...acquisitionMetadata(state), registration_verified: true, email: "private", utm_content: "private@example.test" }), {
    first_traffic_source: "qa_email", latest_traffic_source: "qa_email",
  });
});

test("browser navigation, refresh, new tab and fresh direct visits preserve the intended source without private query data", t => {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window"), oldDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  t.after(() => {
    if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow); else Reflect.deleteProperty(globalThis, "window");
    if (oldDocument) Object.defineProperty(globalThis, "document", oldDocument); else Reflect.deleteProperty(globalThis, "document");
  });
  const storage = () => { const entries = new Map<string,string>(); return { getItem: (key: string) => entries.get(key) || null, setItem: (key: string, value: string) => entries.set(key, value) }; };
  const localStorage = storage();
  let sessionStorage = storage();
  function load(search: string, referrer = "", fresh = false) {
    const browser = { localStorage: fresh ? storage() : localStorage, sessionStorage, location: { search, origin: "https://hirelix.online", protocol: "https:" } };
    const document = { referrer, cookie: "" };
    Object.defineProperty(globalThis, "window", { configurable: true, value: browser });
    Object.defineProperty(globalThis, "document", { configurable: true, value: document });
    return { browser, document };
  }
  const entry = load("?utm_source=qa_email&utm_campaign=qa_campaign&utm_content=qa_alpha&private_prompt=never-collect");
  assert.equal(getAttributionFromBrowser().utm_content, "qa_alpha");
  entry.browser.location.search = "?utm_source=qa_poison";
  assert.equal(getAttributionFromBrowser().traffic_source, "qa_email");
  load("?utm_source=qa_poison", "https://hirelix.online/product");
  assert.equal(getAttributionFromBrowser().traffic_source, "qa_email");
  sessionStorage = storage();
  load("");
  assert.equal(getAttributionFromBrowser().utm_campaign, "qa_campaign");
  const second = load("?utm_source=qa_other&utm_campaign=qa_second", "https://external.example/");
  assert.equal(getAttributionFromBrowser().traffic_source, "qa_other");
  assert.equal(getAttributionFromBrowser().utm_content, undefined);
  syncAcquisitionCookie({ visitor_id: randomUUID(), session_id: randomUUID() });
  const cookie = readAcquisitionCookie(second.document.cookie)!;
  assert.equal(cookie.first.utm_content, "qa_alpha");
  assert.equal(cookie.latest.traffic_source, "qa_other");
  assert.ok(!second.document.cookie.includes("private_prompt"));
  const newer = resolveAcquisition(cookie, { traffic_source: "qa_concurrent", utm_content: "qa_new_tab" }, true, Date.now() + 1);
  localStorage.setItem(ATTRIBUTION_STORAGE, JSON.stringify(newer));
  const signingInSession = randomUUID();
  syncAcquisitionCookie({ visitor_id: cookie.visitor_id, session_id: signingInSession });
  const beforeAuth = readAcquisitionCookie(second.document.cookie)!;
  assert.equal(beforeAuth.latest.utm_content, "qa_new_tab");
  assert.equal(beforeAuth.session_id, signingInSession);
  load("", "", true);
  assert.equal(getAttributionFromBrowser().traffic_source, "direct");
});
