export const config = {
  matcher: ['/', '/index.html', '/meetings', '/meetings.html'],
};

export default function middleware(request) {
  const url = new URL(request.url);
  const page = url.pathname.startsWith('/meetings') ? 'meetings' : 'index';
  const destination = new URL(`/api/render-page?page=${page}`, request.url);
  return new Response(null, {
    headers: {
      'x-middleware-rewrite': destination.toString(),
    },
  });
}
