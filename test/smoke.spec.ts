import { expect, test } from '@playwright/test'

test('loads first frame and validates combat and high-altitude flight', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  const started = Date.now()
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'START RAID' })).toBeVisible()
  await page.getByRole('button', { name: 'START RAID' }).click()
  await expect(page.locator('canvas')).toBeVisible()
  expect(Date.now() - started).toBeLessThan(3000)

  await page.keyboard.down('q')
  await page.waitForTimeout(700)
  await page.keyboard.up('q')
  await page.waitForTimeout(550)
  const heldShotMetrics = JSON.parse(await page.locator('canvas').getAttribute('data-render-metrics') ?? '{}')
  expect(heldShotMetrics.laserShotsFired).toBe(1)
  expect(heldShotMetrics.activeTraffic).toBeGreaterThan(0)

  await page.keyboard.press('q')
  await page.waitForTimeout(550)
  const secondShotMetrics = JSON.parse(await page.locator('canvas').getAttribute('data-render-metrics') ?? '{}')
  expect(secondShotMetrics.laserShotsFired).toBe(2)

  const viewport = page.viewportSize()!
  await page.mouse.move(viewport.width / 2, 4)
  await page.keyboard.down('w')
  await page.waitForTimeout(7500)
  await page.keyboard.up('w')
  await page.waitForTimeout(550)
  const altitudeMetrics = JSON.parse(await page.locator('canvas').getAttribute('data-render-metrics') ?? '{}')
  expect(altitudeMetrics.height).toBeGreaterThan(125)
  expect(altitudeMetrics.activeBuildings).toBeGreaterThan(20)
  await page.mouse.move(viewport.width / 2, viewport.height - 4)
  await page.waitForTimeout(900)
  await page.screenshot({ path: testInfo.outputPath('high-altitude.png') })
  expect(errors).toEqual([])
})
