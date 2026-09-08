import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

export class HouseholdStartPage {
  readonly startSearch
  readonly invitationLink
  readonly join
  readonly alert

  constructor(readonly page: Page) {
    this.startSearch = page.getByRole('button', { name: 'Start a search' })
    this.invitationLink = page.getByRole('textbox', { name: 'Invitation link' })
    this.join = page.getByRole('button', { name: 'Join' })
    this.alert = page.getByRole('alert')
  }

  async expectVisible() {
    await expect(this.startSearch).toBeVisible()
  }

  async create() {
    await this.startSearch.click()
    await expect(
      this.page.getByRole('heading', { name: 'Our home search' }),
    ).toBeVisible()
  }

  async joinWith(value: string) {
    await this.invitationLink.fill(value)
    await this.join.click()
  }
}
