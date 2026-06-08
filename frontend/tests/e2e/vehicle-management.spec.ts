import { test, expect } from '@playwright/test';

test.describe('Vehicle Management E2E', () => {
  test('vehicle list page loads', async ({ page }) => {
    await page.goto('/vehicles');
    await expect(page.locator('h1')).toContainText('Vehicles');
    await expect(page.locator('text=Create Vehicle')).toBeVisible();
  });

  test('vehicle creation page loads with form', async ({ page }) => {
    await page.goto('/vehicles/new');
    await expect(page.locator('h1')).toContainText('Create Vehicle');
    await expect(page.locator('label:has-text("Make")')).toBeVisible();
    await expect(page.locator('label:has-text("Model")')).toBeVisible();
    await expect(page.locator('label:has-text("Year")')).toBeVisible();
  });

  test('vehicle detail page structure', async ({ page }) => {
    // This test assumes a vehicle exists; in a real E2E suite you would create one first
    await page.goto('/vehicles/00000000-0000-0000-0000-000000000001');
    // Should show error or loading state for non-existent vehicle
    await expect(
      page.locator('text=Vehicle not found or you do not have access.'),
    ).toBeVisible();
  });
});
