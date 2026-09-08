import { expect } from '@playwright/test'
import type { Locator } from '@playwright/test'

export class PlotRow {
  constructor(readonly row: Locator) {}

  async expectVisible() {
    await expect(this.row).toBeVisible()
  }

  async toggleGoSee() {
    await this.row
      .getByRole('button', { name: /Go see it|Going to see/ })
      .click()
  }
}
