import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("seeded member can browse the core league pages", async ({ page }) => {
  await login(page);

  await page.goto("/games", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("tab", { name: "Upcoming" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Results" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Lineups" })).toBeVisible();

  await page.goto("/players", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Players", exact: true })).toBeVisible();
  await expect(page.getByLabel("Search players")).toBeVisible();
  await expect(page.getByRole("link", { name: /Open .* player/ }).first()).toBeVisible();

  await page.goto("/fantasy", { waitUntil: "domcontentloaded" });
  const playSections = page.getByRole("navigation", { name: "Play sections" });
  await expect(playSections.getByRole("link", { name: "Fantasy", exact: true })).toBeVisible();
  await expect(playSections.getByRole("link", { name: "Bets", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Set Team" })).toBeVisible();
});

test("a normal member cannot open admin controls", async ({ page }) => {
  await login(page, "alex");
  await page.goto("/admin", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Admin Control Room" })).toHaveCount(0);
});
