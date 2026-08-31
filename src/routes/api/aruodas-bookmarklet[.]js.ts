import { createFileRoute } from '@tanstack/solid-router'
import { createAruodasBookmarkletScript } from '../../server/aruodas-import'

export const Route = createFileRoute('/api/aruodas-bookmarklet.js')({
  server: {
    handlers: {
      GET: ({ request }) => {
        const url = new URL(request.url)
        const endpoint = new URL('/api/aruodas-import', url.origin).toString()
        try {
          return new Response(
            createAruodasBookmarkletScript(
              endpoint,
              url.searchParams.get('key'),
            ),
            {
              headers: {
                'Content-Type': 'text/javascript; charset=utf-8',
                'Cache-Control': 'no-store',
                'Referrer-Policy': 'no-referrer',
              },
            },
          )
        } catch {
          return new Response('Invalid import key', { status: 403 })
        }
      },
    },
  },
})
