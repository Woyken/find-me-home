import { renderAruodasScenario, scenarioPath } from '../../data/aruodas/scenarios.ts'
import type { AruodasScenario } from '../../data/aruodas/scenarios.ts'

export const aruodasDesktopOrigin = 'https://www.aruodas.lt'
export const aruodasMobileOrigin = 'https://m.aruodas.lt'
// A dedicated HTTPS origin lets browser tests execute the loader on an HTTPS
// advert without disabling mixed-content protection for the browser.
export const findMeHomeHttpsFixtureOrigin = 'https://find-me-home.e2e.test'

export type SourcePageFixture = {
  scenario: AruodasScenario
  url: string
  html: string
}

/** A complete synthetic source document. No fixture requests reach Aruodas. */
export const createAruodasSourcePage = (scenario: AruodasScenario): SourcePageFixture => ({
  scenario,
  url: new URL(
    scenarioPath(scenario),
    scenario.viewport === 'mobile' ? aruodasMobileOrigin : aruodasDesktopOrigin,
  ).href,
  html: renderAruodasScenario(scenario),
})
