import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow } from "./helpers";

test("a new user can complete introduction, signup, and first-league creation", async ({
  page
}, testInfo) => {
  test.setTimeout(240_000);
  const project = testInfo.project.name.startsWith("mobile") ? "m" : "d";
  const username = `onboard_${project}_${Date.now().toString(36)}`;

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/welcome$/, { timeout: 60_000 });
  await expect(page.getByRole("heading", { name: /Your league lives here/i })).toBeVisible();
  await expect(page.getByAltText(/Tilo welcoming you/i)).toBeVisible();
  await expect(page.getByText("Step 1 of 3")).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Turn form into competition/i })).toBeVisible();
  await expect(page.getByText("Virtual currency", { exact: true })).toBeVisible();
  await expect(page.getByText("Step 2 of 3")).toBeVisible();

  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Keep the whole league in sync/i })).toBeVisible();
  await expect(page.getByAltText(/Tilo celebrating/i)).toBeVisible();
  await expect(page.getByText("Step 3 of 3")).toBeVisible();

  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/login\?mode=signup$/);
  await expect(page.getByRole("heading", { name: "Create account" })).toBeVisible();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Email", { exact: true }).fill(`${username}@example.com`);
  await page.locator('input[autocomplete="new-password"]').first().fill("Onboarding123!");
  await page.getByLabel("Confirm password").fill("Onboarding123!");
  await page.getByRole("button", { name: "Create account", exact: true }).click();

  await expect(page).toHaveURL(/\/onboarding\/league\?from=welcome$/, {
    timeout: 45_000
  });
  await expect(page.getByRole("heading", { name: "Where do you play?" })).toBeVisible();
  await expect(page.getByLabel("League code")).toBeVisible();
  await expect(page.getByRole("link", { name: /Build your league/i })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole("link", { name: /Build your league/i }).click();
  await expect(page).toHaveURL(/\/onboarding\/create$/);
  await page.getByLabel("League name").fill(`First League ${testInfo.project.name}`);
  await expect(page.getByRole("switch", { name: /Fantasy/i })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("switch", { name: /Virtual betting/i })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Create league", exact: true }).click();

  await expect(page).toHaveURL(/\/onboarding\/finish\?league=/, {
    timeout: 45_000
  });
  await expect(page.getByRole("heading", { name: "Your league is live" })).toBeVisible();
  await expect(page.getByText(/^TL-[A-Z0-9]{4}-[A-Z0-9]{4}$/)).toBeVisible();
  await page.getByRole("button", { name: "Copy invite link" }).click();
  await expect(page.getByRole("button", { name: "Link copied" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Set up notifications" })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole("button", { name: "Set up players" }).click();
  await expect(page).toHaveURL(/\/l\/first-league-.*\/admin\?section=roster$/);
  await expect(page.getByRole("heading", { name: "Admin Control Room" })).toBeVisible();
});

test("server auth supports immediate username login while email waits for verification", async ({
  page,
  request
}, testInfo) => {
  test.setTimeout(120_000);
  const project = testInfo.project.name.startsWith("mobile") ? "m" : "d";
  const username = `identity_${project}_${Date.now().toString(36)}`;
  const email = `${username}@example.com`;
  const password = "Onboarding123!";

  const signup = await request.post("/api/auth/signup", {
    data: { username, email, password, platform: "web" }
  });
  expect(signup.status()).toBe(201);
  const signupBody = await signup.json() as { session?: { access_token?: string } | null };
  expect(signupBody.session?.access_token).toBeTruthy();

  const unverifiedEmailLogin = await request.post("/api/auth/session", {
    data: { identity: email, password }
  });
  expect(unverifiedEmailLogin.status()).toBe(401);

  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await expect(page.getByLabel("Username or email")).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(page.locator("form input")).toHaveCount(2);
  await page.getByLabel("Username or email").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  const usernameLogin = page.waitForResponse(response =>
    response.url().includes("/api/auth/session")
      && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Enter Thursday League" }).click();
  expect((await usernameLogin).status()).toBe(200);
});
