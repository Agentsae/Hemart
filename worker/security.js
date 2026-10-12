// Cloudflare supplies CF-Connecting-IP. Never key limits on client-provided
// forwarding headers, receipt tokens, query strings, or arbitrary resource IDs.
function protectionResponse(status, message, retry) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...(retry ? { 'Retry-After': String(retry) } : {}),
    },
  });
}
export async function protectRequest(request, env) {
  const path = new URL(request.url).pathname;
  const buckets = ['REQUEST_LIMIT'];
  if (path.startsWith('/api/')) {
    buckets.push('API_LIMIT');
    if (!['GET', 'HEAD'].includes(request.method)) buckets.push('WRITE_LIMIT');
    if (path === '/api/orders' && request.method === 'POST') buckets.push('ORDER_LIMIT');
    if (path === '/api/auth/login') buckets.push('LOGIN_LIMIT');
  }
  const key = 'hemart:' + (request.headers.get('CF-Connecting-IP') || 'unknown');
  try {
    for (const name of buckets) {
      const result = await env[name].limit({ key });
      if (result.success === false)
        return protectionResponse(
          429,
          'Terlalu banyak permintaan. Tunggu satu menit lalu coba lagi.',
          60,
        );
      if (result.success !== true) throw new Error('Invalid limiter response');
    }
  } catch {
    return protectionResponse(503, 'Layanan sementara tidak tersedia. Coba lagi sebentar.', 60);
  }
  if (request.url.length > 4096)
    return protectionResponse(414, 'Alamat permintaan terlalu panjang.');
  if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH'].includes(request.method))
    return protectionResponse(405, 'Metode tidak didukung.');
  const maximum = path === '/api/auth/login' ? 2048 : 20000;
  if (Number(request.headers.get('Content-Length') || 0) > maximum)
    return protectionResponse(413, 'Permintaan terlalu besar.');
  return null;
}

export async function boundedText(request, maximum) {
  const oversized = () => Object.assign(new Error('Permintaan terlalu besar.'), { status: 413 });
  if (Number(request.headers.get('Content-Length') || 0) > maximum) throw oversized();
  if (!request.body) return '';
  const reader = request.body.getReader(),
    chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw oversized();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
