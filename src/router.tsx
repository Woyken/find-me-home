import { createRouter, defineRoute } from '@solidjs/router'
import Home, { preloadHome } from './routes/index'
import SourceListingPage, {
  preloadSourceListing,
} from './routes/source-listings.$sourceListingId'
import VisitPlanPage, { preloadVisitPlan } from './routes/visit-plan'
import ImportInboxPage, { preloadImportInbox } from './routes/import-inbox'
import { paths } from './paths'

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
    <main class="start-screen">
      <div class="panel empty">
        <h2>There's nothing at this address</h2>
        <p>The page you opened doesn't exist in Find Me Home.</p>
        <a class="btn" href={paths.home}>
          Back to plots
        </a>
      </div>
    </main>
  )
}
