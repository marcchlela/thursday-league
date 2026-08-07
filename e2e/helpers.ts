import { expect, Page } from "@playwright/test";

const LOCAL_USERS: Record<string, string> = {
  marcos: "20000000-0000-4000-8000-000000000001",
  alex: "20000000-0000-4000-8000-000000000002",
  maya: "20000000-0000-4000-8000-000000000003",
  sam: "20000000-0000-4000-8000-000000000004",
  lina: "20000000-0000-4000-8000-000000000005",
  omar: "20000000-0000-4000-8000-000000000006"
};

export async function login(page: Page, username = "marcos") {
  const userId = LOCAL_USERS[username];
  if (!userId) throw new Error(`Unknown seeded test user: ${username}`);

  await page.addInitScript(({ key }) => {
    window.localStorage.setItem(key, "completed");
  }, { key: `thursday-league:notification-onboarding:v1:${userId}` });

  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Username or email").fill(username);
  await page.locator('input[autocomplete="current-password"]').fill("LocalTest123!");
  const signInResponse = page.waitForResponse(response =>
    response.url().includes("/api/auth/session") &&
    response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Enter Thursday League" }).click();
  await expect((await signInResponse).status()).toBe(200);

  // Local Auth and PostgREST containers can differ by a fraction of a second
  // immediately after reset. Let the new JWT become valid everywhere before
  // loading the authenticated data-heavy home route.
  await page.waitForTimeout(2_500);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Next match", { exact: true })).toBeVisible();
}

export async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(async () => page.evaluate(() =>
    document.documentElement.scrollWidth - window.innerWidth
  )).toBeLessThanOrEqual(2);
}
