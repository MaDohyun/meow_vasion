import { expect, test } from '@playwright/test'

test('loads first frame and validates combat and high-altitude flight', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  const started = Date.now()
  await page.goto('/')
  // Selected by role rather than by label: the start button is translated, so
  // matching its text would tie the smoke run to one language.
  const startButton = page.locator('.intro-actions .primary-button')
  await expect(startButton).toBeVisible()
  // No weapon to choose any more - the only loadout is the beam and the laser.
  await expect(page.locator('.weapon-choice')).toHaveCount(0)
  await startButton.click()
  await expect(page.locator('canvas').first()).toBeVisible()
  expect(Date.now() - started).toBeLessThan(8000)
  await expect(page.locator('.tutorial-mission')).toBeVisible()

  // Nothing is broadcast yet: the sighting report waits until the player has
  // had ten seconds in the air, which is longer than this run stays alive.
  await expect(page.locator('.breaking-band')).toHaveCount(0)

  await page.keyboard.down('q')
  await page.waitForTimeout(700)
  await page.keyboard.up('q')
  await page.waitForTimeout(550)
  const heldShotMetrics = JSON.parse(await page.locator('canvas[data-render-metrics]').getAttribute('data-render-metrics') ?? '{}')
  expect(heldShotMetrics.laserShotsFired).toBe(1)
  expect(heldShotMetrics.activeTraffic).toBe(0)
  expect(heldShotMetrics.tutorialCats).toBe(1)
  expect(heldShotMetrics.remainingTime).toBe(300)

  await page.keyboard.press('q')
  await page.waitForTimeout(550)
  const secondShotMetrics = JSON.parse(await page.locator('canvas[data-render-metrics]').getAttribute('data-render-metrics') ?? '{}')
  expect(secondShotMetrics.laserShotsFired).toBe(2)

  // The run clock and normal spawners begin only after the one-cat tutorial.
  await page.keyboard.down('e')
  await page.waitForTimeout(4000)
  await page.keyboard.up('e')
  await page.waitForTimeout(900)
  const missionMetrics = JSON.parse(await page.locator('canvas[data-render-metrics]').getAttribute('data-render-metrics') ?? '{}')
  expect(missionMetrics.missionStage).toBe(1)
  expect(missionMetrics.remainingTime).toBeLessThan(300)
  expect(missionMetrics.activeTraffic).toBeGreaterThan(0)
  await expect(page.locator('.mission-panel')).toContainText('미션 1')

  const viewport = page.viewportSize()!
  await page.mouse.move(viewport.width / 2, 4)
  await page.keyboard.down('w')
  await page.waitForTimeout(7500)
  await page.keyboard.up('w')
  await page.waitForTimeout(550)
  const altitudeMetrics = JSON.parse(await page.locator('canvas[data-render-metrics]').getAttribute('data-render-metrics') ?? '{}')
  expect(altitudeMetrics.height).toBeGreaterThan(125)
  expect(altitudeMetrics.activeBuildings).toBeGreaterThan(20)
  await page.mouse.move(viewport.width / 2, viewport.height - 4)
  await page.waitForTimeout(900)
  await page.screenshot({ path: testInfo.outputPath('high-altitude.png') })
  expect(errors).toEqual([])
})
