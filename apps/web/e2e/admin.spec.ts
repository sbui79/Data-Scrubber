import { expect, test, type Browser } from "@playwright/test";

async function signIn(browser: Browser, id: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/dev-login");
  await page.getByLabel("Identity id").fill(id);
  await page.getByLabel("Email").fill(`${id}@example.test`);
  await page.getByRole("button", { name: "Sign in" }).click();
  return { ctx, page };
}

test("a new source needs a second reviewer before customers see it; non-staff get a 404", async ({ browser }) => {
  const domain = `e2e-source-${Date.now()}.test`;
  const name = `E2E Source ${Date.now()}`;

  const a = await signIn(browser, "mock_seed-admin-a");
  await a.page.goto("/admin");
  await expect(a.page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await a.page.goto("/admin/sources");
  await a.page.getByLabel("Name", { exact: true }).fill(name);
  await a.page.getByLabel(/^Domain/).fill(domain);
  await a.page.getByLabel("Category").fill("Test category");
  await a.page.getByLabel(/Official opt-out URL/).fill(`https://${domain}/opt-out`);
  await a.page.getByLabel("Verification method").fill("Email");
  await a.page.getByLabel(/^Instructions/).fill("Example instructions.");
  await a.page.getByRole("button", { name: "Propose source" }).click();
  await expect(a.page.getByText(/second compliance reviewer must approve/i)).toBeVisible();

  // The proposer cannot approve their own proposal
  const card = a.page.locator("section", { hasText: name });
  await expect(card.getByRole("button", { name: "Needs a different reviewer" })).toBeDisabled();

  // A customer cannot see it yet
  const user = await signIn(browser, `e2e_cust_${Date.now()}`);
  await user.page.getByLabel("Profile nickname").fill("Customer");
  await user.page.getByLabel(/I agree to the/).check();
  await user.page.getByLabel(/I have read the/).check();
  await user.page.getByLabel(/I authorize PrivatePath/).check();
  await user.page.getByRole("button", { name: "Create my account" }).click();
  await user.page.goto("/sources");
  await expect(user.page.getByText(name)).toHaveCount(0);
  expect((await user.page.goto("/admin"))?.status()).toBe(404);

  // A second reviewer approves
  const b = await signIn(browser, "mock_seed-admin-b");
  await b.page.goto("/admin/sources");
  await b.page.locator("section", { hasText: name }).getByRole("button", { name: "Approve and publish" }).click();
  await expect(b.page.getByText("Approved and published.")).toBeVisible();

  // Now the customer sees it, labeled as an example
  await user.page.goto("/sources");
  await expect(user.page.getByRole("link", { name })).toBeVisible();

  // Support area: redacted queue only
  await b.page.goto("/admin/support");
  await expect(b.page.getByRole("heading", { name: "Support cases" })).toBeVisible();

  await Promise.all([a.ctx.close(), b.ctx.close(), user.ctx.close()]);
});
