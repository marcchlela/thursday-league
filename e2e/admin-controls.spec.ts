import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("admin wallet adjustment creates a visible audited correction", async ({ page }) => {
  await login(page);
  await page.goto("/admin", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Admin Control Room" })).toBeVisible();

  await page.getByRole("tab", { name: "Betting" }).click();
  await expect(page.getByRole("heading", { name: "Adjust wallet" })).toBeVisible();
  await page.getByText("Adjust wallet", { exact: true }).click();

  await page.getByLabel("User").selectOption({ label: "alex" });
  await page.getByLabel("Adjustment").selectOption("credit");
  await page.getByLabel("Amount in coins").fill("7.50");
  await page.getByLabel("Mandatory reason").fill("E2E controlled wallet correction");
  await page.getByRole("button", { name: "Review adjustment" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Add 7.5 coins?" })).toBeVisible();
  await dialog.getByRole("button", { name: "Confirm adjustment" }).click();
  const successToast = page.getByRole("status").filter({
    hasText: /alex wallet adjusted\. New balance:/,
  });
  await expect(successToast).toBeVisible();
  await expect(successToast.getByRole("button", { name: "Dismiss notification" })).toBeVisible();

  await page.getByRole("tab", { name: "Audit" }).click();
  await expect(page.getByRole("heading", { name: "Wallet adjusted", exact: true }).first()).toBeVisible();
  await expect(page.getByText(/E2E controlled wallet correction/).first()).toBeVisible();
});

test("unsaved match statistics block accidental admin navigation", async ({ page }) => {
  await login(page);
  await page.goto("/admin", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Match statistics" }).first()).toBeVisible();

  const goalsInput = page.getByLabel(/Goals for /).first();
  await goalsInput.fill("9");
  await expect(page.getByText("Unsaved changes", { exact: true }).first()).toBeVisible();

  page.once("dialog", async dialog => {
    expect(dialog.message()).toContain("unsaved match statistics");
    await dialog.dismiss();
  });
  await page.getByRole("tab", { name: "Betting" }).click();
  await expect(page.getByRole("heading", { name: "Match statistics" }).first()).toBeVisible();
  await expect(goalsInput).toHaveValue("9");

  page.once("dialog", async dialog => {
    expect(dialog.message()).toContain("unsaved match statistics");
    await dialog.accept();
  });
  await page.getByRole("tab", { name: "Betting" }).click();
  await expect(page.getByRole("heading", { name: "Betting control" })).toBeVisible();
});
