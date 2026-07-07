import { curlFetch } from './common'
import type { ScrapeOptions, Scraper, ScraperResult } from './common'

/**
 * skelbiu.lt status (verified 2026-07-07):
 * - Search HTML pages return only promoted/ad items; real search results are
 *   loaded via /ajax/ endpoints which robots.txt disallows.
 * - Plain Node fetch is blocked by a Cloudflare managed challenge; curl
 *   passes for static pages but the result list is still JS-rendered.
 * We therefore only PROBE availability and report the source as blocked,
 * rather than silently returning zero results.
 */
export const skelbiuScraper: Scraper = {
  source: 'skelbiu',
  async scrape(_opts: ScrapeOptions): Promise<ScraperResult> {
    const errors: Array<string> = []
    try {
      const res = await curlFetch(
        'https://www.skelbiu.lt/skelbimai/nekilnojamasis-turtas/sklypai/vilniuje/',
      )
      if (res.status !== 200) {
        errors.push(`skelbiu blocked: HTTP ${res.status}`)
      } else if (/cf_chl|challenge-platform/.test(res.body)) {
        errors.push('skelbiu blocked: Cloudflare challenge')
      } else {
        errors.push(
          'skelbiu unavailable: search results are AJAX-only (robots.txt disallows /ajax/); listings not accessible without a browser',
        )
      }
    } catch (e) {
      errors.push(`skelbiu probe failed: ${e instanceof Error ? e.message : e}`)
    }
    return { source: 'skelbiu', listings: [], errors, examined: 0 }
  },
}
