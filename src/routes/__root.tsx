import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/solid-router'

import styleCss from '../styles.css?url'

export const Route = createRootRouteWithContext()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Find Me Home' },
    ],
    links: [{ rel: 'stylesheet', href: styleCss }],
  }),
  shellComponent: RootDocument,
  notFoundComponent: () => (
    <div class="flex h-screen w-screen items-center justify-center">
      <div class="text-center">
        <h1 class="mb-2 text-4xl font-bold">404</h1>
        <p class="text-gray-500">Page not found</p>
      </div>
    </div>
  ),
})

function RootDocument(props: { children: any }) {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        {props.children}
        <Scripts />
      </body>
    </html>
  )
}
