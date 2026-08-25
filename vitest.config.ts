import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts'],
    exclude: ['test/smoke.spec.ts'],
    environment: 'node',
    // Vitest stubs stylesheets to an empty string by default, which silently
    // turns a `styles.css?raw` guard into a test that asserts nothing. The
    // mission gauge is a CSS bug waiting to come back (see mission-icons),
    // so the text has to actually arrive.
    css: true,
  },
})
