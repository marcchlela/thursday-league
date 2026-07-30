import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow, login } from "./helpers";

test("code approval and owner-admin-member transitions work end to end", async ({
  browser,
  page
}) => {
  // Three isolated authenticated browser contexts plus first-load compilation
  // of admin, players, fantasy, and betting routes can exceed four minutes on
  // Windows CI even when every interaction is healthy.
  test.setTimeout(420_000);
  await login(page);
  await page.goto("/leagues", { waitUntil: "domcontentloaded" });

  await page.getByLabel("League name").fill("Acceptance League");
  await page.getByRole("button", { name: "Create league", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Acceptance League is ready" })).toBeVisible();
  const joinCode = await page.locator("code").textContent();
  expect(joinCode).toMatch(/^TL-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  await page.getByRole("button", { name: "Open league" }).click();
  await expect(page).toHaveURL(/\/l\/acceptance-league(?:-\d+)?$/);
  const leaguePath = new URL(page.url()).pathname;
  await expect(page.getByRole("heading", { name: "Get the first match ready" })).toBeVisible();
  await expect(page.getByText("0/3 · 3 games left to unlock betting")).toBeVisible();
  await expectNoHorizontalOverflow(page);

  // A logged-out recipient keeps the invite URL through authentication, sees
  // the confirmation screen, and joins only after explicitly accepting.
  await page.locator('button[aria-haspopup="menu"]').first().click();
  const inviteResponsePromise = page.waitForResponse(response =>
    response.url().includes("/rest/v1/rpc/create_league_invite_link")
    && response.request().method() === "POST"
  );
  await page.getByRole("menuitem", { name: "Invite a friend" }).click();
  const inviteResponse = await inviteResponsePromise;
  expect(inviteResponse.ok()).toBeTruthy();
  const invitation = await inviteResponse.json() as { token?: string };
  expect(invitation.token).toMatch(/^[0-9a-f]{48}$/);

  const inviteeContext = await browser.newContext({
    viewport: page.viewportSize() || { width: 1280, height: 720 }
  });
  const inviteePage = await inviteeContext.newPage();
  const memberContext = await browser.newContext({
    viewport: page.viewportSize() || { width: 1280, height: 720 }
  });
  const memberPage = await memberContext.newPage();

  try {
    await inviteePage.goto(`/invite/${invitation.token}`, { waitUntil: "domcontentloaded" });
    await expect(inviteePage).toHaveURL(/\/login$/);
    await inviteePage.getByLabel("Username").fill("omar");
    await inviteePage.locator('input[autocomplete="current-password"]').fill("LocalTest123!");
    const signInResponse = inviteePage.waitForResponse(response =>
      response.url().includes("/auth/v1/token")
      && response.request().method() === "POST"
    );
    await inviteePage.getByRole("button", { name: "Enter Thursday League" }).click();
    await expect((await signInResponse).status()).toBe(200);
    await expect(inviteePage.getByRole("heading", { name: "You've been invited" })).toBeVisible();
    await expect(inviteePage.getByRole("heading", { name: "Acceptance League" })).toBeVisible();
    await inviteePage.getByRole("button", { name: "Accept invitation" }).click();
    await expect(inviteePage).toHaveURL(new RegExp(`${leaguePath}$`));

    await login(memberPage, "lina");
    await memberPage.goto("/leagues", { waitUntil: "domcontentloaded" });
    await memberPage.getByRole("button", { name: "Join with code" }).click();
    await memberPage.getByLabel("League code").fill(joinCode || "");
    await memberPage.getByRole("button", { name: "Find league" }).click();
    await expect(memberPage.getByRole("heading", { name: "Acceptance League" })).toBeVisible();
    await memberPage.getByRole("button", { name: "Request to join" }).click();
    await expect(memberPage.getByRole("status").filter({
      hasText: "Request sent to Acceptance League"
    })).toBeVisible();
    await expect(memberPage.locator(`a[href="${leaguePath}"]`)).toHaveCount(0);
    await expectNoHorizontalOverflow(memberPage);

    await page.goto(`${leaguePath}/admin?section=league`, { waitUntil: "domcontentloaded" });
    const requestRow = page.getByRole("group", { name: "Join request from lina" });
    await requestRow.getByRole("button", { name: "Approve" }).click();
    const approvalDialog = page.getByRole("dialog");
    await expect(approvalDialog.getByRole("heading", { name: "Approve lina?" })).toBeVisible();
    await approvalDialog.getByRole("button", { name: "Approve member" }).click();
    await expect(page.getByText("Member approved.")).toBeVisible();

    await memberPage.goto(`${leaguePath}/admin`, { waitUntil: "domcontentloaded" });
    await expect(memberPage).toHaveURL(new RegExp(`${leaguePath}$`));
    await expect(memberPage.getByRole("heading", { name: "Admin Control Room" })).toHaveCount(0);

    const memberRow = page.getByRole("group", { name: "League member lina" });
    await memberRow.getByRole("button", { name: "Make admin" }).click();
    const promotionDialog = page.getByRole("dialog");
    await expect(promotionDialog.getByRole("heading", { name: "Promote this member to admin?" })).toBeVisible();
    await promotionDialog.getByRole("button", { name: "Make admin" }).click();
    await expect(page.getByText("Member promoted to admin.")).toBeVisible();

    await memberPage.goto(`${leaguePath}/admin?section=roster`, { waitUntil: "domcontentloaded" });
    await expect(memberPage.getByRole("heading", { name: "Admin Control Room" })).toBeVisible();
    await memberPage.getByPlaceholder("Player name").fill("Acceptance Admin Player");
    await memberPage.getByRole("button", { name: "Add player" }).click();
    await expect(memberPage.getByRole("status").filter({ hasText: "Player added." })).toBeVisible();
    await expect(memberPage.getByText("Acceptance Admin Player", { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(memberPage);

    await page.reload({ waitUntil: "domcontentloaded" });
    const adminRow = page.getByRole("group", { name: "League member lina" });
    await adminRow.getByRole("button", { name: "Make member" }).click();
    const demotionDialog = page.getByRole("dialog");
    await expect(demotionDialog.getByRole("heading", { name: "Make this admin a member?" })).toBeVisible();
    await demotionDialog.getByRole("button", { name: "Make member" }).click();
    await expect(page.getByText("Admin changed to member.")).toBeVisible();

    await memberPage.goto(`${leaguePath}/admin`, { waitUntil: "domcontentloaded" });
    await expect(memberPage).toHaveURL(new RegExp(`${leaguePath}$`));
    await expect(memberPage.getByRole("heading", { name: "Admin Control Room" })).toHaveCount(0);

    // Switching the tenant at the same relative route must replace the full
    // provider subtree; data unique to the previous league cannot remain.
    await page.goto(`${leaguePath}/players`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Acceptance Admin Player", { exact: true })).toBeVisible();
    await page.locator('button[aria-haspopup="menu"]').first().click();
    await page.getByRole("menuitem", { name: "Thursday League", exact: true }).click();
    await expect(page).toHaveURL(/\/l\/thursday-league\/players$/);
    await expect(page.getByText("Acceptance Admin Player", { exact: true })).toHaveCount(0);
    await page.goto("/l/thursday-league/fantasy", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Acceptance Admin Player", { exact: true })).toHaveCount(0);
    await page.goto("/l/thursday-league/betting", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Acceptance Admin Player", { exact: true })).toHaveCount(0);

    await page.goto(`${leaguePath}/admin?section=league`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Archive", exact: true }).click();
    const archiveDialog = page.getByRole("dialog");
    await expect(archiveDialog.getByRole("heading", { name: "Archive this league?" })).toBeVisible();
    await archiveDialog.getByRole("button", { name: "Archive league" }).click();
    await expect(page).toHaveURL(/\/leagues(?:\?notice=unavailable)?$/);
  } finally {
    await Promise.allSettled([
      inviteeContext.close(),
      memberContext.close()
    ]);
  }
});

test("notification controls stay platform-owned", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);

  await page.goto("/settings/notifications", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Send test notification" })).toHaveCount(0);
  const removedTestEndpoint = await page.request.post("/api/push/test");
  expect(removedTestEndpoint.status()).toBe(404);

  await page.goto("/platform-admin", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Platform Control" })).toBeVisible();
  await page.getByRole("button", { name: "Notifications" }).click();
  await expect(page.getByRole("heading", { name: "Send announcement" })).toBeVisible();
  await expect(page.getByLabel("Title")).toBeVisible();
  await expect(page.getByLabel("Description")).toBeVisible();
  await expect(page.getByText("Open notification in")).toBeVisible();
  await expect(page.getByText("Failed custom announcements retry automatically")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
