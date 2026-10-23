const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const ALLOWED_STATES = new Set(['Acre','Alagoas','Amapá','Amazonas','Bahia','Ceará','Distrito Federal','Espírito Santo','Goiás','Maranhão','Mato Grosso','Mato Grosso do Sul','Minas Gerais','Pará','Paraíba','Paraná','Pernambuco','Piauí','Rio de Janeiro','Rio Grande do Norte','Rio Grande do Sul','Rondônia','Roraima','Santa Catarina','São Paulo','Sergipe','Tocantins']);

function json(data, status=200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' } });
}

async function googleAccessToken(env) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REFRESH_TOKEN) throw new Error('Integração Google Drive não configurada.');
  const body = new URLSearchParams({ client_id:env.GOOGLE_CLIENT_ID, client_secret:env.GOOGLE_CLIENT_SECRET, refresh_token:env.GOOGLE_REFRESH_TOKEN, grant_type:'refresh_token' });
  const r = await fetch('https://oauth2.googleapis.com/token', { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body });
  const data = await r.json();
  if (!r.ok || !data.access_token) throw new Error('Não foi possível autorizar o Google Drive.');
  return data.access_token;
}

async function uploadPrivatePhoto(env, file, code) {
  const token = await googleAccessToken(env);
  const metadata = { name:`${code}-${Date.now()}.${file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'}`, parents:[env.GOOGLE_DRIVE_FOLDER_ID] };
  const boundary = 'cpn_boundary_' + crypto.randomUUID().replaceAll('-', '');
  const fileBytes = new Uint8Array(await file.arrayBuffer());
  const encoder = new TextEncoder();
  const head = encoder.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${file.type}\r\n\r\n`);
  const tail = encoder.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(head.length + fileBytes.length + tail.length);
  body.set(head); body.set(fileBytes, head.length); body.set(tail, head.length + fileBytes.length);
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', { method:'POST', headers:{Authorization:`Bearer ${token}`, 'Content-Type':`multipart/related; boundary=${boundary}`}, body });
  const data = await r.json();
  if (!r.ok || !data.id) throw new Error('O Google Drive não confirmou o envio da foto.');
  // Não concedemos permissão anyone/reader: o arquivo permanece privado por padrão.
  return data;
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({error:'Banco D1 não configurado.'}, 503);
  const origin = request.headers.get('Origin');
  const host = new URL(request.url).host;
  if (origin && new URL(origin).host !== host) return json({error:'Origem não permitida.'}, 403);
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > MAX_PHOTO_BYTES + 100_000) return json({error:'Envie uma foto de até 8 MB.'}, 413);
  let form;
  try { form = await request.formData(); } catch { return json({error:'Formulário inválido.'}, 400); }
  const fullName = String(form.get('name') || '').trim().replace(/\s+/g, ' ');
  const phone = String(form.get('phone') || '').trim();
  const state = String(form.get('state') || '').trim();
  const photo = form.get('photo');
  if (fullName.length < 2 || fullName.length > 100) return json({error:'Informe um nome entre 2 e 100 caracteres.'}, 400);
  if (phone.replace(/\D/g,'').length < 10 || phone.replace(/\D/g,'').length > 13) return json({error:'Informe um telefone válido com DDD.'}, 400);
  if (!ALLOWED_STATES.has(state)) return json({error:'Selecione um estado válido.'}, 400);
  if (!(photo instanceof File) || !photo.size || photo.size > MAX_PHOTO_BYTES || !['image/jpeg','image/png','image/webp'].includes(photo.type)) return json({error:'Envie uma foto JPG, PNG ou WEBP de até 8 MB.'}, 400);
  try {
    // Reserva ID primeiro. UNIQUE no código e o ID AUTOINCREMENT garantem exclusividade no banco.
    const issuedAt = new Date().toISOString();
    const reservation = await env.DB.prepare('INSERT INTO registrations (public_code, full_name, phone, state, drive_file_id, drive_file_name, issued_at) VALUES (NULL, ?, ?, ?, ?, ?, ?)')
      .bind(fullName, phone, state, 'PENDING_UPLOAD', 'pending', issuedAt).run();
    const id = reservation.meta.last_row_id;
    const code = `CPN-${String(id).padStart(6,'0')}`;
    const uploaded = await uploadPrivatePhoto(env, photo, code);
    await env.DB.prepare("UPDATE registrations SET public_code = ?, drive_file_id = ?, drive_file_name = ? WHERE id = ?")
      .bind(code, uploaded.id, uploaded.name, id).run();
    return json({ ok:true, registration:code, issuedAt, issuedDate:new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Recife',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(issuedAt)) });
  } catch (error) {
    // Mensagem genérica ao visitante; detalhes técnicos ficam apenas nos logs do servidor.
    console.error('Erro no cadastro CPN:', error?.message || 'erro desconhecido');
    return json({error:'Não foi possível concluir o cadastro agora. Tente novamente mais tarde.'}, 500);
  }
}
