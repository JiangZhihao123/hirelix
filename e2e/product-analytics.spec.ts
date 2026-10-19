import { test, expect } from "@playwright/test";

test("real local collector records public navigation once, strips query data, and reads back through the protected dashboard", async ({
  page,
  baseURL,
  request,
}) => {
  test.skip(
    !baseURL || !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname),
    "Only run against isolated local QA",
  );
  const secret = process.env.OPS_DASHBOARD_SECRET;
  test.skip(!secret, "Local operator credential required");
  const source = `browser_analytics_${Date.now()}`;
  const read = async () => {
    const response = await request.get(
      `/api/ops/analytics?internal=1&source=${source}`,
      { headers: { Authorization: `Bearer ${secret}` } },
    );
    expect(response.status()).toBe(200);
    return response.json();
  };
  await page.goto(
    `/?utm_source=${source}&utm_medium=qa&private_prompt=never-collect-this`,
  );
  await expect.poll(async () => (await read()).traffic.page_views).toBe(1);
  await page
    .getByRole("link", { name: "Prepare a client recommendation", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "candidate submissions",
  );
  await expect.poll(async () => (await read()).traffic.page_views).toBe(2);
  const saved = await read();
  expect(saved.sources[0].source).toBe(source);
  expect(
    saved.recent.some((event: { route: string }) => event.route.includes("?")),
  ).toBe(false);
  await page.goto("/ops/ceo");
  await page.getByLabel("访问凭据", { exact: true }).fill(secret!);
  await page.getByRole("button", { name: "打开看板", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "网站流量与产品使用", exact: true }),
  ).toBeVisible();
  await page.getByLabel("包含内部 / 本地测试", { exact: true }).check();
  await page.getByLabel("来源", { exact: true }).fill(source);
  await page.getByRole("button", { name: "应用筛选", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "刷新", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "来源与页面", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "推广活动 UTM", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: source, exact: true }).first(),
  ).toBeVisible();
  expect((await read()).traffic.page_views).toBe(2);
  for (const label of ["产品与回访", "质量与错误", "事件明细", "总览与转化"]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "数据加载失败" }),
    ).toHaveCount(0);
  }
  await page.getByLabel("来源", { exact: true }).fill("all");
  await page.getByRole("button", { name: "应用筛选", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "刷新", exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: "output/analytics/overview.png",
    fullPage: true,
  });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出当前数据", exact: true }).click();
  const download = await downloadPromise;
  await download.saveAs("output/analytics/dashboard-export.json");
  await page.getByRole("button", { name: "切换访问凭据", exact: true }).click();
  await page
    .getByLabel("访问凭据", { exact: true })
    .fill("invalid-operator-credential");
  await page.getByRole("button", { name: "打开看板", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "访问凭据无效" }),
  ).toHaveText("访问凭据无效");
});
