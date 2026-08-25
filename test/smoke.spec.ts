import { expect, test } from '@playwright/test'

test('loads first frame and validates combat and high-altitude flight', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  const started = Date.now()
  const readMetrics = async () =>
    JSON.parse(await page.locator('canvas[data-render-metrics]').getAttribute('data-render-metrics') ?? '{}')
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

  // Nothing has started: the run clock, the traffic and every spawner wait on
  // the one-cat tutorial, and the briefing has handed over no controls yet.
  await page.keyboard.down('q')
  await page.waitForTimeout(500)
  await page.keyboard.up('q')
  await page.waitForTimeout(300)
  const openingMetrics = await readMetrics()
  expect(openingMetrics.laserShotsFired).toBe(0)
  expect(openingMetrics.activeTraffic).toBe(0)
  expect(openingMetrics.tutorialCats).toBe(1)
  expect(openingMetrics.remainingTime).toBe(300)

  // The briefing teaches the laser and turbo by hand before it asks for the
  // cat, and only a real key press clears a hands-on step - which is the one
  // part of it a browser has to prove. Steps are told apart by the panel's own
  // text changing rather than by what it says, so the walk holds in any
  // language.
  const panel = page.locator('.briefing-panel')
  const briefingStep = async () => (await panel.innerText()).trim()
  const advanceBriefing = async (act: () => Promise<void>) => {
    const before = await briefingStep()
    await act()
    await expect.poll(briefingStep).not.toBe(before)
  }
  await advanceBriefing(() => page.locator('.briefing-touch').click())
  await advanceBriefing(() => page.locator('.briefing-touch').click())
  // Both hands-on steps hold their key rather than tapping it: the runtime
  // samples the keyboard once a frame, and a tap can fall between two of them.
  // D used to be an unprinted laser alias; it must no longer clear the step.
  const laserStep = await briefingStep()
  await page.keyboard.down('d')
  await page.waitForTimeout(300)
  await page.keyboard.up('d')
  expect(await briefingStep()).toBe(laserStep)
  await advanceBriefing(async () => {
    await page.keyboard.down('q')
    await page.waitForTimeout(600)
    await page.keyboard.up('q')
  })
  await advanceBriefing(async () => {
    await page.keyboard.down('Space')
    await page.waitForTimeout(600)
    await page.keyboard.up('Space')
  })
  await advanceBriefing(() => page.locator('.briefing-touch').click())
  // The cat step: the tutorial's own gate, which the run waits behind.
  await expect(page.locator('.tutorial-beam-prompt')).toBeVisible()

  // Held, not tapped: the beam latches on the first press and the cat has to
  // come all the way up the cone before the gate opens. How long that takes is
  // a matter of frame rate, so this waits on the gate rather than on a clock.
  // E and F used to be unprinted beam aliases; neither may start the rescue.
  for (const key of ['e', 'f']) {
    await page.keyboard.down(key)
    await page.waitForTimeout(300)
    await page.keyboard.up(key)
    expect((await readMetrics()).missionStage).toBe(0)
  }
  await page.keyboard.down('w')
  await expect.poll(async () => (await readMetrics()).missionStage, { timeout: 60000 }).toBe(1)
  await page.keyboard.up('w')
  await page.waitForTimeout(900)
  const missionMetrics = await readMetrics()
  expect(missionMetrics.missionStage).toBe(1)
  expect(missionMetrics.remainingTime).toBeLessThan(300)
  expect(missionMetrics.activeTraffic).toBeGreaterThan(0)
  await expect(page.locator('.mission-panel')).toContainText('미션 1')

  // With the tutorial cleared every control answers, the laser included.
  await page.keyboard.down('q')
  await page.waitForTimeout(700)
  await page.keyboard.up('q')
  await page.waitForTimeout(550)
  const heldShotMetrics = await readMetrics()
  expect(heldShotMetrics.laserShotsFired).toBeGreaterThan(0)

  await page.keyboard.press('q')
  await page.waitForTimeout(550)
  const secondShotMetrics = await readMetrics()
  expect(secondShotMetrics.laserShotsFired).toBeGreaterThan(heldShotMetrics.laserShotsFired)

  // Nose up and nothing else. There is no throttle key any more - the craft
  // is always going, so pointing it at the sky is the whole of climbing.
  const viewport = page.viewportSize()!
  await page.mouse.move(viewport.width / 2, 4)
  await page.waitForTimeout(7500)
  await page.waitForTimeout(550)
  const altitudeMetrics = await readMetrics()
  expect(altitudeMetrics.height).toBeGreaterThan(125)
  expect(altitudeMetrics.activeBuildings).toBeGreaterThan(20)
  await page.mouse.move(viewport.width / 2, viewport.height - 4)
  await page.waitForTimeout(900)
  await page.screenshot({ path: testInfo.outputPath('high-altitude.png') })
  expect(errors).toEqual([])
})

/**
 * SKIP is the whole tutorial, not the next line of it. The briefing's own state
 * is React and its gates are in the runtime, so only a browser can show that
 * one press of the button takes a player from the parked opening to a running
 * game: no briefing, no locked controls, and no cat to catch first.
 */
test('SKIP ends the tutorial outright and starts the run', async ({ page }) => {
  await page.goto('/')
  const startButton = page.locator('.intro-actions .primary-button')
  await expect(startButton).toBeVisible({ timeout: 30000 })
  await startButton.click()
  await expect(page.locator('.tutorial-mission')).toBeVisible()
  const readMetrics = async () =>
    JSON.parse(await page.locator('canvas[data-render-metrics]').getAttribute('data-render-metrics') ?? '{}')
  expect((await readMetrics()).missionStage).toBe(0)

  // Pressed on the opening line, before a single control has been handed over.
  await page.locator('.briefing-skip').click()

  // The briefing is gone, and so is everything that only exists while the
  // tutorial holds the run: its mission card and beam prompt.
  await expect(page.locator('.briefing-box')).toHaveCount(0)
  await expect(page.locator('.tutorial-mission')).toHaveCount(0)
  await expect(page.locator('.tutorial-beam-prompt')).toHaveCount(0)
  await expect(page.locator('.mission-panel')).toContainText('미션 1')

  await page.waitForTimeout(1500)
  const running = await readMetrics()
  expect(running.missionStage).toBe(1)
  // The clock only moves once the tutorial is over.
  expect(running.remainingTime).toBeLessThan(300)

  // Laser and flight both answer, though the briefing never reached the lines
  // that hand them over. The laser key is held rather than tapped: the runtime
  // samples the keyboard once a frame.
  await page.keyboard.down('q')
  await page.waitForTimeout(600)
  await page.keyboard.up('q')
  await page.waitForTimeout(500)
  expect((await readMetrics()).laserShotsFired).toBeGreaterThan(0)

  // Flight answers by needing no answer. The tutorial is the one thing that
  // parks the craft; the moment it is over the saucer is already going, with
  // nothing held down and nothing to teach a first-time player first.
  const pose = () => page.evaluate(() => window.__BEAM_BANDIT_POSE__!)
  // Deliberately a low bar, as the held-W version of this check was: the
  // simulation advances in real time and a software-rendered browser gets
  // through a fraction of the frames a real one does. "It left the spot on its
  // own" is the claim; how far it got is the flight model's business, and unit
  // tested there.
  const before = await pose()
  await page.waitForTimeout(4000)
  const flown = await pose()
  expect(Math.hypot(flown.x - before.x, flown.z - before.z)).toBeGreaterThan(3)
})

/**
 * The language switch is duplicated onto the lobby itself because the options
 * panel that also holds it is behind a button nobody can read yet. What only a
 * browser can show is that the lobby copy actually follows the press.
 */
test('switches language from the lobby without opening options', async ({ page }) => {
  await page.goto('/')
  // The loading screen holds the lobby back while the cell pools build, so
  // wait for the menu itself before reaching for anything on it.
  await expect(page.locator('.intro-actions .primary-button')).toBeVisible({ timeout: 30000 })
  const choices = page.locator('.lobby-language button')
  await expect(choices).toHaveCount(3)
  // Korean is the default, so it starts as the pressed one.
  await expect(page.locator('.lobby-language button[lang="ko"]')).toHaveAttribute('aria-pressed', 'true')

  const title = page.locator('.intro-overlay h1')
  const korean = await title.textContent()
  await page.locator('.lobby-language button[lang="ja"]').click()
  await expect(page.locator('.lobby-language button[lang="ja"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.lobby-language button[lang="ko"]')).toHaveAttribute('aria-pressed', 'false')
  await expect(title).not.toHaveText(korean ?? '')
  // The lobby marks the whole overlay with the language so the CSS can size a
  // title that is far longer in one script than another.
  await expect(page.locator('.intro-overlay')).toHaveAttribute('data-language', 'ja')

  await page.locator('.lobby-language button[lang="en"]').click()
  await expect(page.locator('.intro-overlay')).toHaveAttribute('data-language', 'en')
  await expect(page.locator('.intro-actions .primary-button')).toBeVisible()
})

test('keeps the reticle at its last position when the mouse leaves the page', async ({ page }) => {
  await page.goto('/')
  await page.locator('.intro-actions .primary-button').click()
  await expect(page.locator('canvas').first()).toBeVisible()

  const view = page.viewportSize()!
  await page.mouse.move(view.width * 0.77, view.height * 0.28)
  const reticle = page.locator('.reticle')
  await expect(reticle).toHaveAttribute('style', /left:\s*77(?:\.\d+)?%;\s*top:\s*28(?:\.\d+)?%/)
  const lastPosition = await reticle.getAttribute('style')

  // Browsers report this when the pointer crosses out through their content
  // edge. The custom cursor should park where its last pointermove left it.
  await page.evaluate(() => document.documentElement.dispatchEvent(new MouseEvent('mouseleave')))
  await page.waitForTimeout(120)
  await expect(reticle).toHaveAttribute('style', lastPosition ?? '')
})

/**
 * Mobile flight now lives entirely on the two-axis direction stick. The maths
 * is unit tested; what only a browser can show is the wiring and layout: open
 * city swipes do not aim, the old altitude buttons are gone, and the right-hand
 * actions sit at their raised phone offset.
 */
test.describe('mobile direction stick', () => {
  // A phone-sized viewport with a real touchscreen, which is what reveals the
  // mobile control layer.
  test.use({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })

  test('owns yaw and pitch without the old altitude or screen-drag controls', async ({ context, page }) => {
    await page.goto('/')
    await page.locator('.intro-actions .primary-button').tap()
    await expect(page.locator('canvas').first()).toBeVisible()
    await expect(page.locator('.joystick')).toBeVisible()
    await expect(page.locator('.mobile-altitude')).toHaveCount(0)
    await expect(page.locator('.alt-button')).toHaveCount(0)
    await expect(page.locator('.mobile-actions')).toHaveCSS('bottom', '76px')

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
    // mouse pointer and exercise the desktop reticle instead.
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

    // Neither a tap nor the old open-city swipe is an aiming surface now.
    await page.touchscreen.tap(view.width * 0.8, view.height * 0.2)
    await page.waitForTimeout(120)
    expect(await aim()).toEqual({ x: 50, y: 50 })
    await drag(middle, { x: middle.x + view.width * 0.22, y: middle.y - view.height * 0.14 })
    expect(await aim()).toEqual({ x: 50, y: 50 })

    const restingPose = await page.evaluate(() => ({ ...window.__BEAM_BANDIT_POSE__! }))
    const stick = (await page.locator('.joystick').boundingBox())!
    const knob = { x: stick.x + stick.width / 2, y: stick.y + stick.height / 2 }
    await drag(knob, { x: knob.x + 38, y: knob.y - 38 })
    const pointed = await page.evaluate(() => ({ ...window.__BEAM_BANDIT_POSE__! }))
    expect(pointed.pitch).toBeGreaterThan(0.05)
    expect(pointed.heading).not.toBeCloseTo(restingPose.heading, 3)
    await expect(page.locator('.joystick-knob')).toHaveAttribute('style', 'transform: translate(0px, 0px);')
    expect(await aim()).toEqual({ x: 50, y: 50 })

    await page.locator('.laser-button').tap()
    await page.waitForTimeout(120)
    expect(await aim()).toEqual({ x: 50, y: 50 })
  })
})
