import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

export class ImportReviewPage {
  constructor(private readonly page: Page) {}

  async expectListing(sourceId: string) {
    await expect(
      this.page.getByRole('heading', {
        name: 'Check what we found, then save',
      }),
    ).toBeVisible()
    await expect(this.page.getByText(`Aruodas ${sourceId}`, { exact: true })).toBeVisible()
  }

  async save() {
    await this.page.getByRole('button', { name: 'Save plot' }).click()
  }

  async expectUnreadable() {
    await expect(
      this.page.getByRole('heading', { name: "We couldn't read that advert" }),
    ).toBeVisible()
  }
}
