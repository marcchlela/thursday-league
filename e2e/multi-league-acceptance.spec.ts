import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow, login } from "./helpers";

test("code approval and owner-admin-member transitions work end to end", async ({
  browser,
  page
}) => {
  test.setTimeout(240_000);
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
  await expectNoHorizontalOverflow(page);

  const memberContext = await browser.newContext({
    viewport: page.viewportSize() || { width: 1280, height: 720 }
  });
  const memberPage = await memberContext.newPage();

  try {
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

    await page.getByRole("button", { name: "Archive", exact: true }).click();
    const archiveDialog = page.getByRole("dialog");
    await expect(archiveDialog.getByRole("heading", { name: "Archive this league?" })).toBeVisible();
    await archiveDialog.getByRole("button", { name: "Archive league" }).click();
    await expect(page).toHaveURL(/\/leagues(?:\?notice=unavailable)?$/);
  } finally {
    await memberContext.close();
  }
});
