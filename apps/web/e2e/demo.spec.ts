// 5-minute demo script (plan section 11). Needs a seeded live DB and saved sessions per demo role:
//   DEMO_E2E=1 DEMO_STATE_STUDENT=./e2e/.auth/student.json DEMO_STATE_PGRC=... DEMO_STATE_RB=... DEMO_STATE_MGMT=... DEMO_STATE_COLLEGE=...
// Create each state file once by logging in as that demo account and calling page.context().storageState({ path }).
// Each step is skipped when its state file is missing, so the spec never fails on a partly set-up machine.
import { test, expect, type Browser } from "@playwright/test";

const LIVE = process.env.DEMO_E2E === "1";
const state = (role: string) => process.env[`DEMO_STATE_${role}`];
const APEX = "Apex Institute of Technology";

async function as(browser: Browser, role: string) {
  const file = state(role);
  if (!file) test.skip(true, `DEMO_STATE_${role} not set`);
  return browser.newContext({ storageState: file! });
}

test.describe("5-minute demo script", () => {
  test.skip(!LIVE, "Set DEMO_E2E=1 with a seeded database to run the demo script");

  test("0:00 student files a fee complaint at Apex", async ({ browser }) => {
    const ctx = await as(browser, "STUDENT");
    const page = await ctx.newPage();
    await page.goto("/student/new");
    await expect(page.getByText(APEX).first()).toBeVisible();
    await ctx.close();
  });

  test("1:00 PGRC sees the coordination alert for Apex", async ({ browser }) => {
    const ctx = await as(browser, "PGRC");
    const page = await ctx.newPage();
    await page.goto("/aicte");
    await expect(page.getByText(/Overlap Alerts/)).toBeVisible();
    await page.goto("/aicte/alerts");
    await expect(page.getByText(APEX).first()).toBeVisible();
    await ctx.close();
  });

  test("3:30 senior management sees the dashboard and can export the bureau report", async ({ browser }) => {
    const ctx = await as(browser, "MGMT");
    const page = await ctx.newPage();
    await page.goto("/aicte/reports");
    await page.getByRole("combobox", { name: "Report" }).selectOption("bureau_wise");
    await expect(page.getByText("Bureau-wise workload")).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Export CSV" }).click();
    expect((await download).suggestedFilename()).toMatch(/\.csv$/);
    await ctx.close();
  });

  test("4:15 RB officer sees the policy assistant abstain on an unknown topic", async ({ browser }) => {
    const ctx = await as(browser, "RB");
    const page = await ctx.newPage();
    await page.goto("/aicte/assistant");
    await page.getByRole("textbox", { name: "Policy question" }).fill("What is the price of mangoes in Lucknow?");
    await page.keyboard.press("Enter");
    await expect(page.getByText("Not found in the policy corpus")).toBeVisible({ timeout: 20_000 });
    await ctx.close();
  });

  test("5:00 student sees plain-language status on My Cases", async ({ browser }) => {
    const ctx = await as(browser, "STUDENT");
    const page = await ctx.newPage();
    await page.goto("/student");
    await expect(page.getByText(/NS-2026-/).first()).toBeVisible();
    await ctx.close();
  });
});
