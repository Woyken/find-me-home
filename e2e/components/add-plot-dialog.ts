import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

export class AddPlotDialog {
  constructor(private readonly page: Page) {}

  async bookmarkletHref() {
    await this.page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('button', { name: 'Add a plot' })
      .click()
    const dialog = this.page.getByRole('dialog', {
      name: 'Add a plot from Aruodas',
    })
    await expect(dialog).toBeVisible()
    return dialog
      .getByRole('link', { name: 'Save to Find Me Home' })
      .getAttribute('href')
  }
}
