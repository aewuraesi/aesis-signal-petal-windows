import { test, expect, openApp, go, openTask, storedTask, task } from "./seed";

test("task title and details can be edited", async ({ page }) => {
  await openApp(page);
  await openTask(page, "SSO rollout");
  await page.locator("#issue-detail-title").fill("Contractor SSO rollout");
  await page.locator(".detail-heading-fields textarea").fill("Waiting for final IdP metadata.");
  await page.locator(".detail-save-actions button").click();
  await expect(page.locator(".issue-card-main", { hasText: "Contractor SSO rollout" })).toBeVisible();
  const task = await storedTask(page, "t-blocked-pro");
  expect(task.title).toBe("Contractor SSO rollout");
  expect(task.details).toBe("Waiting for final IdP metadata.");
});

test("dashboard quick complete updates the task immediately", async ({ page }) => {
  await openApp(page);
  await go(page, "Dashboard");
  const card = page.locator(".issue-card", { hasText: "SSO rollout" });
  await card.locator(".issue-card-actions button", { hasText: "Complete" }).click();
  await expect(card.locator(".status")).toHaveText("Resolved");
  await expect(card.locator(".completed-tag")).toHaveText("✓ Completed");
  await expect(card.locator(".issue-card-actions button", { hasText: "Completed" })).toHaveCount(0);
  expect((await storedTask(page, "t-blocked-pro")).status).toBe("Resolved");
});

test("profile can be edited and onboarding replayed from Settings", async ({ page }) => {
  await openApp(page);
  await go(page, "Settings");
  await page.locator(".profile-settings-form input[name=name]").fill("Ama");
  await page.locator(".profile-settings-form input[name=role]").fill("Product lead");
  await page.locator(".profile-settings-form button", { hasText: "Save profile" }).click();
  await expect(page.locator(".brand strong")).toContainText("Ama");
  await page.locator(".profile-settings-form button", { hasText: "Replay onboarding" }).click();
  await expect(page.locator(".onboarding-card")).toBeVisible();
});

/* A due date stored in any other shape used to render as an EMPTY field while the task went
   on counting as overdue — a date that existed in the data and nowhere on screen. Restoring
   an older backup, or a sync payload written by different code, is how you get one. */
test("a due date from an older backup still shows in the field", async ({ page }) => {
  const due = new Date(Date.now() + 3 * 86400000).toISOString();
  await openApp(page, [task("iso", { title: "Renewal with an ISO date", lane: "professional", status: "Ongoing", expected: due })], []);
  await openTask(page, "Renewal with an ISO date");

  const field = page.locator('.detail-modal input[type="datetime-local"]');
  await expect(field).not.toHaveValue("");
  expect(await field.inputValue()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

  // And it is written back in that shape, so it stays visible next time.
  const stored = await storedTask(page, "iso");
  expect(stored.expected).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
});
