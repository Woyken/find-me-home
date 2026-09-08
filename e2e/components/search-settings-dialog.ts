import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

export class SearchSettingsDialog {
  readonly dialog
  readonly name

  constructor(page: Page) {
    this.dialog = page.getByRole('dialog', { name: 'Our search' })
    this.name = this.dialog.getByRole('textbox', { name: 'Search name' })
  }

  async rename(name: string) {
    await this.name.fill(name)
    await this.dialog.getByRole('button', { name: 'Save' }).click()
    await expect(this.dialog).toBeHidden()
  }

  async closeWithButton() {
    await this.dialog.getByRole('button', { name: 'Close' }).click()
    await expect(this.dialog).toBeHidden()
  }
}
