import { bookmarkletSource } from 'virtual:aruodas-bookmarklet'

export const createAruodasBookmarklet = (appUrl: string) => {
  const url = new URL(appUrl)
  url.hash = ''
  url.search = ''
  return `javascript:${bookmarkletSource.replace('__FMH_APP_URL__', JSON.stringify(url.toString()).slice(1, -1))}`
}
