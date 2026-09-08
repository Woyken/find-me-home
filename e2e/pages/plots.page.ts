import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { PlotRow } from '../components/plot-row'

export class PlotsPage {
  readonly savedPlots
  readonly view

  constructor(readonly page: Page) {
    this.savedPlots = page.getByRole('region', { name: 'Saved plots' })
    this.view = page.getByRole('group', { name: 'View' })
  }

  row(title: string) {
    return new PlotRow(
      this.savedPlots.getByRole('article').filter({ hasText: title }),
    )
  }

  async expectEmpty() {
    await expect(pageHeading(this.page, 'No plots yet')).toBeVisible()
  }

  async showMap() {
    await this.view.getByRole('button', { name: 'Map' }).click()
  }
}

const pageHeading = (page: Page, name: string) =>
  page.getByRole('heading', { name })
