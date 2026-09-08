import { chromium } from '@playwright/test'

const [pagesArgument] = process.argv.slice(2)

if (!pagesArgument) {
  throw new Error('Usage: pnpm smoke:pages:e2e <pages-url>')
}

const pagesUrl = new URL(pagesArgument)
if (!pagesUrl.pathname.endsWith('/')) pagesUrl.pathname += '/'
pagesUrl.search = 'e2e=remote-smoke'

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
})
try {
  const page = await browser.newPage()
  await page.goto(pagesUrl.href, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => Boolean(window.__FMH_E2E__))
  await page.evaluate(async () => {
    const api = window.__FMH_E2E__
    if (!api) throw new Error('E2E runtime is unavailable')
    await api.ready()
    await api.reset()
  })
  console.log(`Verified live E2E Pages readiness at ${pagesUrl}`)
} finally {
  await browser.close()
}
