import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { SearchSettingsDialog } from './search-settings-dialog'

export class HouseholdHeader {
  readonly navigation
  readonly settings

  constructor(readonly page: Page) {
    this.navigation = page.getByRole('navigation', { name: 'Main' })
    this.settings = page.getByRole('button', { name: 'Our search settings' })
  }

  async openSettings() {
    await this.settings.click()
    const dialog = new SearchSettingsDialog(this.page)
    await expect(dialog.dialog).toBeVisible()
    return dialog
  }
}
