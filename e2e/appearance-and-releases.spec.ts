import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("appearance persists and release notes clear their unread badge", async ({ page }) => {
  await login(page);
  await page.goto("/settings", { waitUntil: "domcontentloaded" });

  const lightTheme = page.getByRole("radio", { name: /Light/ });
  await lightTheme.click();
  await expect(lightTheme).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("radio", { name: /Light/ })).toHaveAttribute("aria-checked", "true");

  const whatsNew = page.getByRole("link", { name: /What.s New/ });
  await expect(whatsNew.getByText("New update")).toBeVisible();
  await whatsNew.click();
  await expect(page.getByRole("heading", { name: /What.s New/ })).toBeVisible();
  await expect(page.getByText("v0.4.0")).toBeVisible();

  await page.goto("/settings", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("link", { name: /What.s New/ }).getByText("New update")).toHaveCount(0);
});
