import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow, login } from "./helpers";

test("seeded member can browse the core league pages", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);

  await page.goto("/l/thursday-league/games", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("tab", { name: "Upcoming" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Results" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Lineups" })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto("/l/thursday-league/players", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Players", exact: true })).toBeVisible();
  await expect(page.getByLabel("Search players")).toBeVisible();
  await expect(page.getByRole("link", { name: /Open .* player/ }).first()).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto("/l/thursday-league/fantasy", { waitUntil: "domcontentloaded" });
  const playSections = page.getByRole("navigation", { name: "Play sections" });
  await expect(playSections.getByRole("link", { name: "Fantasy", exact: true })).toBeVisible();
  await expect(playSections.getByRole("link", { name: "Bets", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Set Team" })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await playSections.getByRole("link", { name: "Bets", exact: true }).click();
  await expect(page).toHaveURL(/\/l\/thursday-league\/betting$/);
  await page.getByRole("tab", { name: "Standings" }).click();
  await expect(page.getByRole("heading", { name: "Standings", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "League picks" })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test("a normal member cannot open admin controls", async ({ page }) => {
  await login(page, "alex");
  await page.goto("/l/thursday-league/admin", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/l\/thursday-league$/);
  await expect(page.getByRole("heading", { name: "Admin Control Room" })).toHaveCount(0);
});

test("a league can be created, switched into, and archived without affecting the current league", async ({ page }) => {
  await login(page);
  await page.goto("/leagues", { waitUntil: "domcontentloaded" });

  await page.getByLabel("League name").fill("E2E Side League");
  await page.getByRole("button", { name: "Create league", exact: true }).click();
  await expect(page.getByRole("heading", { name: "E2E Side League is ready" })).toBeVisible();
  await expect(page.locator("code")).toHaveText(/^TL-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  await page.getByRole("button", { name: "Open league" }).click();

  await expect(page).toHaveURL(/\/l\/e2e-side-league(?:-\d+)?$/);
  await page.getByRole("button", { name: /League E2E Side League/ }).click();
  await expect(page.getByRole("menuitem", { name: "Thursday League" })).toBeVisible();
  await page.getByRole("menuitem", { name: "E2E Side League" }).click();

  await page.goto(`${new URL(page.url()).pathname}/admin?section=league`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Archive this league?" })
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Archive league" }).click();
  await expect(page).toHaveURL(/\/leagues(?:\?notice=unavailable)?$/);
  await expect(page.getByRole("link", { name: /Thursday League/ })).toBeVisible();
});
