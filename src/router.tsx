import { createRouter, defineRoute } from '@solidjs/router'
import Home, { preloadHome } from './routes/index'
import SourceListingPage, {
  preloadSourceListing,
} from './routes/source-listings.$sourceListingId'
import VisitPlanPage, { preloadVisitPlan } from './routes/visit-plan'
import ImportInboxPage, { preloadImportInbox } from './routes/import-inbox'

export const Router = createRouter({
  base: import.meta.env.BASE_URL,
  routes: [
    { path: '/', component: Home, preload: preloadHome },
    {
      path: '/visit-plan',
      component: VisitPlanPage,
      preload: preloadVisitPlan,
    },
    {
      path: '/import-inbox',
      component: ImportInboxPage,
      preload: preloadImportInbox,
    },
    defineRoute({
      path: '/source-listings/:sourceListingId',
      component: SourceListingPage,
      preload: preloadSourceListing,
    }),
    { path: '*404', component: NotFound },
  ],
  scrollRestoration: true,
})

function NotFound() {
  return (
    <main class="flex min-h-screen items-center justify-center bg-[#f6f4ec]">
      <div class="text-center">
        <h1 class="mb-2 text-4xl font-bold">404</h1>
        <p class="text-gray-500">Page not found</p>
      </div>
    </main>
  )
}
