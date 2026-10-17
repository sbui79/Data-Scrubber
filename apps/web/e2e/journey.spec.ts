import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const id = `e2e_${Date.now()}`;

async function noSeriousA11yIssues(page: Page, name: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => `${name}: ${v.id} (${v.nodes.length})`), "accessibility violations").toEqual([]);
}

test("public site states the boundaries", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /take control of your own public data/i })).toBeVisible();
  await expect(page.getByText("Not a people search service")).toBeVisible();
  await expect(page.getByText(/removal is never guaranteed/i).first()).toBeVisible();
  await noSeriousA11yIssues(page, "home");
  for (const p of ["/how-it-works", "/pricing", "/faq", "/security", "/terms", "/privacy", "/contact", "/safety"]) {
    const res = await page.goto(p);
    expect(res?.status(), p).toBe(200);
  }
  await page.goto("/safety");
  await expect(page.getByText(/911/).first()).toBeVisible();
});

test("anonymous visitors are sent to sign in", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/dev-login/);
});

test("a person can go from sign-up to a completed, exported and deleted account", async ({ page }) => {
  // --- sign in (dev) and onboard with required consents
  await page.goto("/dev-login");
  await page.getByLabel("Identity id").fill(id);
  await page.getByLabel("Email").fill(`${id}@example.test`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/onboarding/);
  await page.getByLabel("Profile nickname").fill("E2E Tester");
  await page.getByRole("button", { name: "Create my account" }).click();
  await expect(page).toHaveURL(/onboarding/); // blocked: required boxes unchecked
  await page.getByLabel(/I agree to the/).check();
  await page.getByLabel(/I have read the/).check();
  await page.getByLabel(/I authorize PrivatePath/).check();
  await page.getByRole("button", { name: "Create my account" }).click();
  await expect(page).toHaveURL(/profile/);

  // --- profile
  await page.getByLabel("Legal first name").fill("Casey");
  await page.getByLabel("Legal last name").fill("Testperson");
  await page.getByLabel(/Phone numbers you want to check/).fill("555-010-0188");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await noSeriousA11yIssues(page, "profile");

  // --- dashboard for a new user makes no progress claim
  await page.goto("/dashboard");
  await expect(page.getByText("Estimated").first()).toBeVisible();
  await noSeriousA11yIssues(page, "dashboard");

  // --- source directory + listing check
  await page.goto("/sources");
  await expect(page.getByText(/demonstration data/i)).toBeVisible();
  await noSeriousA11yIssues(page, "sources");
  await page.getByRole("link", { name: "Example People Finder" }).click();
  await expect(page.getByRole("status").filter({ hasText: /not verified as current/i })).toBeVisible();
  await page.getByLabel("I found my listing").check();
  await page.getByLabel(/Link to your listing/).fill("https://evil.test/p/1");
  await page.getByLabel(/This listing is about/).check();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/isn't valid for this source/i)).toBeVisible(); // wrong domain rejected
  await page.getByLabel(/Link to your listing/).fill("https://example-people-finder.test/p/42");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  // --- start a request
  await page.getByRole("button", { name: "Start a removal request" }).click();
  await expect(page).toHaveURL(/requests\/[\w-]+$/);
  await noSeriousA11yIssues(page, "request-step");

  // --- choose data, prepare, review
  await page.getByLabel("Current and previous addresses").check();
  await page.getByLabel(/last 4 digits of a phone number/).selectOption({ label: "Ending in 0188" });
  await page.getByLabel(/I confirm this request is about/).check();
  await page.getByRole("button", { name: "Prepare my request" }).click();
  const review = page.getByText(/Subject: Request to Remove My Personal Information/);
  await expect(review).toBeVisible();
  const draft = page.locator("pre");
  await expect(draft).toContainText("Casey Testperson");
  await expect(draft).toContainText("https://example-people-finder.test/p/42");
  await expect(draft).toContainText("Phone ending in 0188");
  await expect(draft).not.toContainText("555-010");
  await expect(draft).not.toContainText("@example.test");

  // --- approval gate: cannot approve until the explicit confirmation
  const approve = page.getByRole("button", { name: "Approve this request" });
  await expect(approve).toBeDisabled();
  await page.getByLabel(/I have reviewed this request/).check();
  await approve.click();
  await expect(page.getByRole("heading", { name: "Your approved request" })).toBeVisible();

  // --- copy only works after approval
  await page.getByRole("button", { name: "Copy text" }).click();
  await expect(page.getByText("Copied to your clipboard.")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("Request to Remove My Personal Information");
  await expect(page.getByRole("link", { name: /official opt-out page/ })).toHaveAttribute("href", /example-people-finder\.test\/opt-out/);

  // --- user records that THEY submitted it
  await page.getByRole("button", { name: "I submitted this request" }).click();
  await expect(page.getByRole("heading", { name: "Track the outcome" })).toBeVisible();

  // --- proof upload (tiny PNG)
  const png = path.join(tmpdir(), `${id}.png`);
  writeFileSync(png, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64"));
  await page.getByLabel(/Choose a file/).setInputFiles(png);
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByText("File added.")).toBeVisible();
  await expect(page.getByRole("link", { name: /PNG/ })).toBeVisible();

  // --- mark complete with a reference
  await page.getByLabel("Update status").selectOption({ label: "Removed / completed" });
  await page.getByLabel(/Confirmation number/).fill("REF-E2E-1");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();

  // --- reminders
  await page.goto("/reminders");
  await expect(page.getByRole("listitem").filter({ hasText: "Follow up in 30 days" })).toBeVisible(); // default created on submission
  await page.getByRole("button", { name: "Mute" }).click();
  await expect(page.getByText("Muted.").first()).toBeVisible();
  await noSeriousA11yIssues(page, "reminders");

  // --- california center
  await page.goto("/california");
  await expect(page.getByText(/never asks for your state or government login/i)).toBeVisible();
  await page.getByLabel(/1\. Confirm you are a California resident/).check();
  await expect(page.getByLabel(/1\. Confirm you are a California resident/)).toBeChecked();
  await expect(page.getByRole("link", { name: /Start a request on the official DROP platform/ })).toHaveAttribute("href", "https://consumer.drop.privacy.ca.gov");

  // --- dashboard now reflects the completed request
  await page.goto("/dashboard");
  await expect(page.getByRole("img", { name: /Estimated progress 100 percent/ }).or(page.getByLabel(/Estimated progress 100 percent/))).toBeVisible();

  // --- support: ID-like content is refused
  await page.goto("/help");
  await page.getByLabel("Subject").fill("Question");
  await page.getByLabel("Message").fill("my ssn is 123-45-6789");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(/never ask you to send a government ID/i)).toBeVisible();
  await noSeriousA11yIssues(page, "help");

  // --- settings: marketing is opt-in and revocable; a paid (mock) plan never gates export or deletion
  await page.goto("/settings");
  await noSeriousA11yIssues(page, "settings");
  const marketing = page.getByLabel(/Send me occasional product news/);
  await expect(marketing).not.toBeChecked();
  await marketing.check();
  await expect(page.getByText(/Opted in/)).toBeVisible();
  await marketing.uncheck();
  await page.getByRole("listitem").filter({ hasText: "Monthly monitoring" }).getByRole("button", { name: "Choose (mock)" }).click();
  await expect(page.getByText("Plan added (mock).")).toBeVisible();
  await expect(page.getByText(/always free and never require a paid plan/i)).toBeVisible();

  // --- export
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export my data" }).click()]);
  expect(download.suggestedFilename()).toBe("privatepath-export.json");
  const body = JSON.parse(await (await import("node:fs/promises")).readFile((await download.path())!, "utf8"));
  expect(body.profile.legalFirstName).toBe("Casey");
  expect(JSON.stringify(body.removalRequests)).toContain("REF-E2E-1");

  // --- delete account (confirmation required)
  await page.getByRole("button", { name: "Delete my account" }).click();
  const confirm = page.getByRole("button", { name: "Permanently delete" });
  await expect(confirm).toBeDisabled();
  await page.getByLabel(/Type DELETE/).fill("DELETE");
  await confirm.click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/dev-login/);
});
