import { expect, test } from '@playwright/test'

test('loads first frame and starts without console errors', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  const started = Date.now()
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'START RAID' })).toBeVisible()
  await page.getByRole('button', { name: 'START RAID' }).click()
  await expect(page.locator('canvas')).toBeVisible()
  expect(Date.now() - started).toBeLessThan(3000)
  expect(errors).toEqual([])
})
