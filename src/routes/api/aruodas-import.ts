import { createFileRoute } from '@tanstack/solid-router'
import { importAruodasListing } from '../../server/aruodas-import'

export const Route = createFileRoute('/api/aruodas-import')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const form = await request.formData()
        const result = await importAruodasListing(
          form.get('payload'),
          form.get('key'),
        )
        const heading =
          result.outcome === 'inserted'
            ? 'Aruodas listing imported'
            : 'Aruodas listing updated'
        return new Response(
          `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${heading}</title></head><body><main><h1>${heading}</h1><p>The listing is ready in Find Me Home. Its evaluations may still be running.</p><p><a href="/">Return to Find Me Home</a></p></main></body></html>`,
          {
            status: 201,
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'no-store',
              'Referrer-Policy': 'no-referrer',
            },
          },
        )
      },
    },
  },
})
