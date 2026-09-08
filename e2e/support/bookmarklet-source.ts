import { findMeHomeHttpsFixtureOrigin } from '../fixtures/aruodas/source-page.ts'
import type { SourcePageFixture } from '../fixtures/aruodas/source-page.ts'
import type { Page, Route } from '@playwright/test'
import { expect } from '@playwright/test'
import { AddPlotDialog } from '../components/add-plot-dialog.ts'
import { appBaseUrl, appOrigin, appPath, appUrl } from './app-url.ts'

export type PlaywrightPage = Page
export type PlaywrightRoute = Route

export const bookmarkletAssetPath = appPath('aruodas-bookmarklet.js')
const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Executes the exact loader URL rendered in the application's Add a plot dialog. */
export const addPlotDialogBookmarkletHref = (appPage: PlaywrightPage) =>
  new AddPlotDialog(appPage).bookmarkletHref()

/** Reads the scraper asset the running application actually exposes. */
export const actualBookmarkletSource = (appPage: PlaywrightPage) =>
  appPage.request
    .get(appUrl('aruodas-bookmarklet.js'))
    .then(async (response) => {
      if (!response.ok())
        throw new Error(`Could not fetch scraper: ${response.status()}`)
      return response.text()
    })

const testLoaderHref = (href: string) => {
  const productionOrigin = JSON.stringify(appBaseUrl.href)
  const fixtureOrigin = JSON.stringify(
    new URL(appBaseUrl.pathname, `${findMeHomeHttpsFixtureOrigin}/`).href,
  )
  if (!href.includes(productionOrigin))
    throw new Error('Loader does not contain the rendered app base URL')
  // Only the embedded app base changes. The emitted loader itself is untouched.
  return href.replace(productionOrigin, fixtureOrigin)
}

export const runAddPlotDialogBookmarklet = async (
  sourcePage: PlaywrightPage,
  href: string | null,
  scraperSource: string,
  options?: {
    failScriptElement?: boolean
    failFallback?: boolean
    expectImport?: boolean
  },
) => {
  if (!href?.startsWith('javascript:'))
    throw new Error('Add a plot did not render a javascript: bookmarklet')
  const fixtureAsset = new RegExp(
    `^${escapeRegExp(findMeHomeHttpsFixtureOrigin)}${bookmarkletAssetPath.replace('.', '\\.')}(?:\\?.*)?$`,
  )
  await sourcePage.route(
    `${findMeHomeHttpsFixtureOrigin}/**/*`,
    async (route) => {
      if (route.request().isNavigationRequest()) {
        await route.fulfill({
          contentType: 'text/html',
          body: `<script>location.replace(${JSON.stringify(appOrigin)}+location.pathname+location.search+location.hash)</script>`,
        })
        return
      }
      const fixtureUrl = new URL(route.request().url())
      const response = await sourcePage.request.get(
        new URL(`${fixtureUrl.pathname}${fixtureUrl.search}`, appOrigin).href,
      )
      await route.fulfill({
        status: response.status(),
        contentType: response.headers()['content-type'],
        body: await response.body(),
      })
    },
  )
  let requests = 0
  await sourcePage.route(fixtureAsset, async (route) => {
    requests += 1
    if (options?.failScriptElement && requests === 1) return route.abort()
    if (options?.failFallback) return route.abort()
    await route.fulfill({
      contentType: 'application/javascript',
      body: scraperSource,
    })
  })
  const request = sourcePage.waitForRequest((candidate) => {
    const url = new URL(candidate.url())
    return (
      url.origin === findMeHomeHttpsFixtureOrigin &&
      url.pathname === bookmarkletAssetPath &&
      url.searchParams.has('t')
    )
  })
  await sourcePage.evaluate(
    (code) => (0, eval)(code),
    testLoaderHref(href).slice('javascript:'.length),
  )
  await expect(request).resolves.toBeDefined()
  if (options?.failFallback) {
    await expect.poll(() => requests).toBe(2)
    return { requests }
  }
  if (options?.expectImport === false) return { requests }
  await expect(sourcePage).toHaveURL(
    new RegExp(
      `^${escapeRegExp(appOrigin)}${escapeRegExp(appBaseUrl.pathname)}.*#import=`,
    ),
  )
  const destination = await captureNavigation(sourcePage)
  return { requests, destination }
}

/** Hosts a fixture as its independent source origin, optionally enforcing CSP. */
export const openSourcePage = async (
  page: PlaywrightPage,
  fixture: SourcePageFixture,
  csp?: string,
) => {
  // Synthetic source documents contain real-looking third-party asset URLs.
  // Permit only the app and this fixture document; fail closed for everything else.
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin === appOrigin || url.origin === findMeHomeHttpsFixtureOrigin)
      return route.continue()
    await route.abort()
  })
  const sourceDocumentUrl = new URL(fixture.url)
  sourceDocumentUrl.hash = ''
  await page.route(sourceDocumentUrl.href, async (route) => {
    await route.fulfill({
      contentType: 'text/html',
      body: fixture.html,
      headers: csp ? { 'content-security-policy': csp } : undefined,
    })
  })
  await page.goto(fixture.url)
}

export type CapturedNavigation = {
  url: string
  fragment: string | undefined
}

/** Reads navigation state after source code assigns window.location.href. */
export const captureNavigation = async (
  page: PlaywrightPage,
): Promise<CapturedNavigation> =>
  page.evaluate(() => {
    const url = window.location.href
    const fragment = new URL(url).hash.match(/^#import=(.+)$/)?.[1]
    return { url, fragment }
  }, undefined)

export const decodeBookmarkletPayload = (fragment: string) => {
  if (!/^[A-Za-z0-9_-]+$/.test(fragment))
    throw new Error('Invalid import fragment')
  const binary = atob(fragment.replace(/-/g, '+').replace(/_/g, '/'))
  const text = new TextDecoder('utf-8', { fatal: true }).decode(
    Uint8Array.from(binary, (character) => character.charCodeAt(0)),
  )
  if (text.length > 100_000)
    throw new Error('Import payload exceeds 100,000 characters')
  return JSON.parse(text) as unknown
}
