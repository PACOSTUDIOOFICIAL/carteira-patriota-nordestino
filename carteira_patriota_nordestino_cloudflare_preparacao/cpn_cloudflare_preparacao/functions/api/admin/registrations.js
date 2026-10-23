function json(data, status=200) { return new Response(JSON.stringify(data), {status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}}); }
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({error:'Banco não configurado.'},503);
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim().slice(0,100);
  const page = Math.max(1, Math.min(10000, Number(url.searchParams.get('page') || 1)));
  const limit = 25, offset = (page-1)*limit;
  let result;
  if (q) result = await env.DB.prepare("SELECT id, public_code, full_name, phone, state, drive_file_id, issued_at, status, created_at FROM registrations WHERE public_code LIKE ? OR full_name LIKE ? OR phone LIKE ? ORDER BY id DESC LIMIT ? OFFSET ?").bind(`%${q}%`,`%${q}%`,`%${q}%`,limit,offset).all();
  else result = await env.DB.prepare('SELECT id, public_code, full_name, phone, state, drive_file_id, issued_at, status, created_at FROM registrations ORDER BY id DESC LIMIT ? OFFSET ?').bind(limit,offset).all();
  return json({items:result.results || [], page, limit});
}
