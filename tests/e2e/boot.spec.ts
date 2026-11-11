import { expect, test } from "@playwright/test";

test("the built game boots, starts Practice, and plays one move", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console.error: ${message.text()}`);
  });
  page.on("pageerror", (error) => {
    errors.push(`pageerror: ${error.message}`);
  });

  await page.goto("./");
  await expect(page.locator('body[data-ready="true"]')).toBeAttached({
    timeout: 10_000,
  });

  // Down reaches Practice whether or not a button sits above it; focus clamps.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");

  // #debug-moves is visually hidden on purpose, so read its text only.
  const moves = page.locator("#debug-moves");
  await expect(moves).toHaveText("0");
  // Play exposes no ready signal and Phaser drops a key pressed before its
  // listener exists, so press again only while no move has landed: a second
  // counted press reads "2" and still fails.
  await expect(async () => {
    if ((await moves.textContent()) === "0") await page.keyboard.press("Enter");
    await expect(moves).toHaveText("1", { timeout: 1_000 });
  }).toPass({ timeout: 10_000 });

  expect(errors).toEqual([]);
});
