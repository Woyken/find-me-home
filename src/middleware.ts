import {
  createAruodasBookmarkletScript,
  createImportDraft,
} from './server/aruodas-import'

export default async function middleware(
  request: Request,
  next: (request?: Request) => Promise<Response>,
) {
  const url = new URL(request.url)

  if (request.method === 'POST' && url.pathname === '/api/aruodas-import') {
    const contentLength = Number(request.headers.get('content-length'))
    if (Number.isFinite(contentLength) && contentLength > 150_000) {
      return new Response('Import payload is too large', { status: 413 })
    }
    try {
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
    } catch {
      return new Response('Invalid import payload or key', {
        status: 400,
        headers: {
          'Cache-Control': 'no-store',
          'Referrer-Policy': 'no-referrer',
        },
      })
    }
  }

  if (
    request.method === 'GET' &&
    url.pathname === '/api/aruodas-bookmarklet.js'
  ) {
    try {
      return new Response(
        createAruodasBookmarkletScript(
          new URL('/api/aruodas-import', url.origin).toString(),
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
  }

  return next()
}
