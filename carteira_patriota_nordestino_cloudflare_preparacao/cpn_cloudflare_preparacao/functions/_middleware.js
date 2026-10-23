import { createRemoteJWKSet, jwtVerify } from 'jose';

// Protege as rotas administrativas validando o JWT emitido pelo Cloudflare Access.
// Configure ACCESS_TEAM_DOMAIN (ex.: sua-equipe.cloudflareaccess.com) e ACCESS_AUD.
let jwks;
export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  const isAdmin = url.pathname.startsWith('/admin') || url.pathname.startsWith('/api/admin');
  if (!isAdmin) return next();

  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
    return new Response('Área administrativa ainda não configurada.', { status: 503 });
  }
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return new Response('Acesso restrito.', { status: 401 });
  try {
    const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
    jwks ||= createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    const { payload } = await jwtVerify(token, jwks, { issuer, audience: env.ACCESS_AUD });
    if (!payload.email) return new Response('Identidade não confirmada.', { status: 403 });
    const response = await next();
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-store');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  } catch {
    return new Response('Acesso não autorizado.', { status: 403 });
  }
}
