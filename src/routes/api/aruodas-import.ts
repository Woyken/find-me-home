import { createFileRoute } from '@tanstack/solid-router'
import { createImportDraft } from '../../server/aruodas-import'

export const Route = createFileRoute('/api/aruodas-import')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const contentLength = Number(request.headers.get('content-length'))
        if (Number.isFinite(contentLength) && contentLength > 150_000) {
          return new Response('Import payload is too large', { status: 413 })
        }
        const form = await request.formData()
        const token = createImportDraft(form.get('payload'), form.get('key'))
        return new Response(null, {
          status: 303,
          headers: {
            Location: `/imports/${token}`,
            'Cache-Control': 'no-store',
            'Referrer-Policy': 'no-referrer',
          },
        })
      },
    },
  },
})
