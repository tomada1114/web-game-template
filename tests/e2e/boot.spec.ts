import { expect as baseExpect, test } from "@playwright/test";

test("the built game boots, starts Practice, and plays one move", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console.error: ${message.text()}`);
  });
  page.on("pageerror", (error) => {
    errors.push(`pageerror: ${error.message}`);
  });

  // Every assertion names the errors collected so far, so a script error that
  // breaks boot reads as that error rather than as a bare locator timeout.
  const expect = <T>(actual: T) =>
    baseExpect(actual, `page errors so far: ${JSON.stringify(errors)}`);

  await page.goto("./");
  await expect(page.locator('body[data-ready="true"]')).toBeAttached({
    timeout: 10_000,
  });

  // Down reaches Practice whether or not a button sits above it; focus clamps.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");

  // Play sets body[data-scene="play"] once its key listener exists, so one
  // press must count; #debug-moves is visually hidden, so read its text only.
  await expect(page.locator('body[data-scene="play"]')).toBeAttached();
  const moves = page.locator("#debug-moves");
  await expect(moves).toHaveText("0");
  await page.keyboard.press("Enter");
  await expect(moves).toHaveText("1");

  baseExpect(errors).toEqual([]);
});
