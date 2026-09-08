import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

export class ImportInboxPage {
  constructor(private readonly page: Page) {}

  async expectClippings(count: number) {
    await expect(this.page.getByRole('heading', { name: 'Clippings from Aruodas' })).toBeVisible()
    if (count === 1) await expect(this.page.getByText('Last one.')).toBeVisible()
    else await expect(this.page.getByText(`${count} to go`)).toBeVisible()
  }

  async openAdvert() {
    await this.page.getByRole('link', { name: 'Open advert & save it' }).click()
  }
}
