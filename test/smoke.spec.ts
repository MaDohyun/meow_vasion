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
  // had ten seconds of game time, and the clock does not start until the
  // tutorial cat is rescued.
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

/**
 * A finger aims by dragging, not by pointing: see src/core/aim. The maths is
 * unit tested; what only a browser can show is the wiring - that a drag on the
 * open city moves the reticle, and that a drag on the stick or a fire button
 * belongs to that control and leaves the reticle where it was.
 */
test.describe('touch aiming', () => {
  // A phone-sized viewport with a real touchscreen, which is what both the
  // .mobile-controls media query and the drag reticle key off.
  test.use({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })

  test('drags the reticle with the finger and leaves the HUD controls alone', async ({ context, page }) => {
    await page.goto('/')
    await page.locator('.intro-actions .primary-button').tap()
    await expect(page.locator('canvas').first()).toBeVisible()
    await expect(page.locator('.joystick')).toBeVisible()

    // Percentages straight off the reticle, which is positioned from the same
    // aim the laser raycast uses.
    const aim = async () => {
      const style = (await page.locator('.reticle').getAttribute('style')) ?? ''
      return {
        x: Number(/left:\s*([-\d.]+)%/.exec(style)?.[1]),
        y: Number(/top:\s*([-\d.]+)%/.exec(style)?.[1]),
      }
    }

    // Playwright's touchscreen only taps, and a mouse drag would arrive as a
    // mouse pointer and take the cursor path instead.
    const touch = await context.newCDPSession(page)
    const drag = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y, id: 1 }] })
      for (let step = 1; step <= 10; step += 1) {
        const at = step / 10
        const x = from.x + (to.x - from.x) * at
        const y = from.y + (to.y - from.y) * at
        await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 1 }] })
      }
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await page.waitForTimeout(120)
    }

    const view = page.viewportSize()!
    const middle = { x: view.width / 2, y: view.height * 0.4 }
    expect(await aim()).toEqual({ x: 50, y: 50 })

    // Landing is not aiming. An absolute mapping would snap the reticle onto
    // the thumb here, which is how it used to end up parked on a fire button.
    await page.touchscreen.tap(view.width * 0.8, view.height * 0.2)
    await page.waitForTimeout(120)
    expect(await aim()).toEqual({ x: 50, y: 50 })

    await drag(middle, { x: middle.x + view.width * 0.22, y: middle.y - view.height * 0.14 })
    const dragged = await aim()
    expect(dragged.x).toBeGreaterThan(60)
    expect(dragged.y).toBeLessThan(40)

    // The finger is gone and the reticle stays: aim with one thumb, fire with
    // the other.
    await page.waitForTimeout(400)
    expect(await aim()).toEqual(dragged)

    const stick = (await page.locator('.joystick').boundingBox())!
    const knob = { x: stick.x + stick.width / 2, y: stick.y + stick.height / 2 }
    await drag(knob, { x: knob.x + 38, y: knob.y - 38 })
    expect(await aim()).toEqual(dragged)

    await page.locator('.laser-button').tap()
    await page.waitForTimeout(120)
    expect(await aim()).toEqual(dragged)
  })
})
