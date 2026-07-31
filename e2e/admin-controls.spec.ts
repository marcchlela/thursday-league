import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow, login } from "./helpers";

test("league owners see the lightweight controls and confirmations", async ({ page }) => {
  await login(page);
  await page.goto("/admin", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Admin Control Room" })).toBeVisible();

  await expect(page.getByRole("tab", { name: "League" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Games" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Roster" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Seasons" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Audit" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Betting" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Notifications" })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);

  await page.getByRole("tab", { name: "League" }).click();
  await expect(page.getByRole("heading", { name: "Options" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();
  await expect(page.getByLabel("League owner")).toBeVisible();
  await expect(page.getByText("Only completion status is shown. Picks and bets stay private.")).toBeVisible();

  await page.getByRole("button", { name: "Make admin" }).first().click();
  const roleDialog = page.getByRole("dialog");
  await expect(roleDialog.getByRole("heading", { name: "Promote this member to admin?" })).toBeVisible();
  await roleDialog.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("tab", { name: "Seasons" }).click();
  await page.getByRole("button", { name: "Custom dates" }).click();
  await expect(page.getByPlaceholder("Season name, e.g. 2026/27")).toBeFocused();
  await expectNoHorizontalOverflow(page);
});

test("the league owner can add a roster player and schedule a game", async ({ page }) => {
  await login(page);
  await page.goto("/admin?section=roster", { waitUntil: "domcontentloaded" });

  await page.getByPlaceholder("Player name").fill("E2E Permission Player");
  await page.getByRole("button", { name: "Add player" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Player added." })).toBeVisible();
  await expect(page.getByText("E2E Permission Player", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Games" }).click();
  await page.locator('input[type="datetime-local"]').first().fill("2040-01-10T20:00");
  await page.getByRole("button", { name: "Create game" }).click();
  await expect(page.locator('[role="status"], [role="alert"]').filter({ hasText: "Game created" })).toBeVisible();
});

test("unsaved match statistics block accidental admin navigation", async ({ page }) => {
  await login(page);
  await page.goto("/admin", { waitUntil: "domcontentloaded" });
  const lineupReadyGame = page.getByRole("button", { name: /Lineup ready/ }).first();
  const lineupReadySection = lineupReadyGame.locator("xpath=ancestor::section[1]");
  const matchStatistics = lineupReadySection.getByRole("heading", { name: "Match statistics" });
  await expect(lineupReadyGame).toBeVisible();
  await expect(async () => {
    if (!(await matchStatistics.isVisible())) await lineupReadyGame.click();
    await expect(matchStatistics).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });

  const goalsInput = lineupReadySection.getByLabel(/Goals for /).first();
  await goalsInput.fill("9");
  await expect(page.getByText("Unsaved changes", { exact: true }).first()).toBeVisible();

  await page.getByRole("tab", { name: "Roster" }).click();
  const leaveDialog = page.getByRole("dialog");
  await expect(leaveDialog.getByRole("heading", { name: "Leave without saving statistics?" })).toBeVisible();
  await leaveDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("heading", { name: "Match statistics" }).first()).toBeVisible();
  await expect(goalsInput).toHaveValue("9");

  await page.getByRole("tab", { name: "Roster" }).click();
  await leaveDialog.getByRole("button", { name: "Leave without saving" }).click();
  await expect(page.getByRole("heading", { name: "Roster", exact: true })).toBeVisible();
});
