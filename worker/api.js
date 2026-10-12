import { protectRequest, boundedText } from './security.js';
import { initialProducts } from './catalog.js';
import { sellerSession, authEndpoint } from './auth.js';
export const defaults = {
  areas: ['Perum Megaregency'],
  deliveryFee: 0,
  capacity: 20,
  cutoff: 21,
  open: false,
  whatsapp: '',
  announcement: 'Pesanan segera dibuka. Kami sedang menyiapkan katalog dan harga terbaru.',
};
const statuses = [
  'Diterima',
  'Menunggu persetujuan',
  'Dikonfirmasi',
  'Dikemas',
  'Dalam perjalanan',
  'Selesai',
  'Dibatalkan',
];
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}
export async function hash(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
export function schedule(now = new Date(), cutoff = 21) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const d = new Date(`${p.year}-${p.month}-${p.day}T05:00:00Z`);
  const cutoffHour = cutoff === 0 ? 24 : cutoff;
  const daysUntilDelivery = Number(p.hour) >= cutoffHour ? 2 : 1;

  d.setUTCDate(d.getUTCDate() + daysUntilDelivery);
  return d.toISOString().slice(0, 10);
}
export async function isSeller(request, env) {
  return sellerSession(request, env);
}
async function settings(db) {
  const row = await db.prepare('SELECT data FROM settings WHERE id=1').first();
  return row ? { ...defaults, ...JSON.parse(row.data) } : { ...defaults };
}
async function catalog(db) {
  const rows = (await db.prepare('SELECT data FROM products').all()).results;
  const overrides = new Map(
    rows.map((r) => {
      const p = JSON.parse(r.data);
      return [p.id, p];
    }),
  );
  return [
    ...initialProducts.map((p) => overrides.get(p.id) || { ...p, available: true }),
    ...[...overrides.values()].filter((p) => !initialProducts.some((a) => a.id === p.id)),
  ];
}
function textField(v, label, max, min = 1) {
  if (typeof v !== 'string' || v.trim().length < min || v.trim().length > max)
    fail(`${label} tidak valid.`);
  return v.trim();
}
function integer(v, label, min, max) {
  if (!Number.isSafeInteger(v) || v < min || v > max) fail(`${label} tidak valid.`);
  return v;
}
async function body(request) {
  const raw = await boundedText(request, 20000);
  try {
    return JSON.parse(raw);
  } catch {
    fail('Format permintaan tidak valid.');
  }
}
function token(request) {
  const t = request.headers.get('X-Receipt-Token');
  if (!t || !/^[-_A-Za-z0-9]{43}$/.test(t)) fail('Tautan pesanan tidak valid.', 401);
  return t;
}
function unpack(row) {
  return {
    ...JSON.parse(row.data),
    id: row.id,
    delivery: row.delivery,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revision: row.revision,
  };
}
async function orderRow(db, id) {
  const row = await db.prepare('SELECT * FROM orders WHERE id=?').bind(id).first();
  if (!row) fail('Pesanan tidak ditemukan.', 404);
  return row;
}
async function rateLimit(request, db) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const now = Date.now();
  const key = await hash(ip + ':' + Math.floor(now / 600000));
  const row = await db
    .prepare(
      'INSERT INTO rate_limits(key,hits,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 RETURNING hits',
    )
    .bind(key, now + 600000)
    .first();
  if (row.hits > 40) fail('Terlalu banyak permintaan. Coba lagi dalam 10 menit.', 429);
  await db.prepare('DELETE FROM rate_limits WHERE expires_at<?').bind(now).run();
}
export function validateSettings(input) {
  const areas = (Array.isArray(input.areas) ? input.areas : []).map((a) =>
    textField(a, 'Area', 80),
  );
  if (!areas.length || areas.length > 20 || new Set(areas).size !== areas.length)
    fail('Isi 1–20 area unik.');
  const whatsapp = String(input.whatsapp || '').replace(/[^0-9]/g, '');
  if (whatsapp && !/^62[0-9]{8,13}$/.test(whatsapp)) fail('Gunakan nomor WhatsApp dengan kode 62.');
  return {
    areas,
    deliveryFee: integer(input.deliveryFee, 'Ongkir', 0, 100000),
    capacity: integer(input.capacity, 'Kapasitas', 1, 100),
    cutoff: input.cutoff === 0 ? 0 : integer(input.cutoff, 'Jam tutup', 12, 23),
    open: input.open === true,
    whatsapp,
    announcement: textField(input.announcement || ' ', 'Pengumuman', 300, 0),
  };
}
export function validateProduct(input, id) {
  if (!/^[a-z0-9-]{1,50}$/.test(id)) fail('ID produk tidak valid.');
  const category = textField(input.category, 'Kategori', 20);
  if (!['Sayuran', 'Buah', 'Lauk', 'Dapur'].includes(category)) fail('Kategori tidak valid.');
  const image = textField(input.image || '/icon.svg', 'Foto', 600);
  if (image !== '/icon.svg' && !/^https:\/\/images\.unsplash\.com\/[\w/?=&%.+-]+$/.test(image))
    fail('Gunakan URL foto images.unsplash.com atau ikon bawaan.');
  return {
    id,
    name: textField(input.name, 'Nama produk', 80),
    unit: textField(input.unit, 'Satuan', 80),
    price: integer(input.price, 'Harga', 1, 10000000),
    category,
    image,
    tag: textField(input.tag || '', 'Label', 40, 0),
    available: input.available === true,
  };
}
export async function handle(request, env, assets = {}) {
  const url = new URL(request.url);
  let path = url.pathname;
  try {
    const rejected = await protectRequest(request, env);
    if (rejected) return rejected;
    if (path === '/seller' || path === '/seller/') {
      if (!['GET', 'HEAD'].includes(request.method))
        return json({ error: 'Metode tidak didukung.' }, 405);
      if (!(await isSeller(request, env)))
        return new Response(null, {
          status: 302,
          headers: { Location: '/seller/login', 'Cache-Control': 'no-store' },
        });
      if (path === '/seller/')
        return new Response(null, {
          status: 302,
          headers: { Location: '/seller', 'Cache-Control': 'no-store' },
        });
      path = '/';
    }
    if (path === '/seller/login') path = '/seller-login.html';
    if (path === '/api/auth/login' || path === '/api/auth/logout')
      return await authEndpoint(request, env, path);
    if (!path.startsWith('/api/')) {
      if (!['GET', 'HEAD'].includes(request.method))
        return json({ error: 'Metode tidak didukung.' }, 405);
      const asset = assets[path];
      if (!asset) return json({ error: 'Tidak ditemukan.' }, 404);
      return new Response(
        request.method === 'HEAD'
          ? null
          : Uint8Array.from(atob(asset.data), (c) => c.charCodeAt(0)),
        {
          headers: {
            'Content-Type': asset.type,
            'Cache-Control': 'no-cache',
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'no-referrer',
            'Content-Security-Policy':
              "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https://images.unsplash.com data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'",
          },
        },
      );
    }
    if (!env.DB) fail('Penyimpanan belum siap. Silakan coba lagi.', 503);
    if (!['GET', 'HEAD'].includes(request.method)) {
      if (request.headers.get('Origin') !== url.origin)
        fail('Asal permintaan tidak diizinkan.', 403);
      if (!request.headers.get('Content-Type')?.includes('application/json'))
        fail('Gunakan JSON.', 415);
    }
    const db = env.DB;
    const seller = await isSeller(request, env);
    if (path.startsWith('/api/seller/') && !seller)
      fail('Masuk dengan akun penjual untuk melanjutkan.', 403);
    if (path === '/api/bootstrap' && request.method === 'GET') {
      const s = await settings(db);
      const delivery = schedule(new Date(), s.cutoff);
      const count = await db
        .prepare("SELECT COUNT(*) AS n FROM orders WHERE delivery=? AND status!='Dibatalkan'")
        .bind(delivery)
        .first();
      return json({
        settings: s,
        products: await catalog(db),
        delivery,
        remaining: Math.max(0, s.capacity - count.n),
        seller,
        authenticated: seller,
      });
    }
    if (path === '/api/orders' && request.method === 'POST') {
      const t = token(request);
      const tokenHash = await hash(t);
      const input = await body(request);
      const requestHash = await hash(JSON.stringify(input));
      const existing = await db
        .prepare('SELECT * FROM orders WHERE token_hash=?')
        .bind(tokenHash)
        .first();
      if (existing) {
        if (existing.request_hash !== requestHash)
          fail('Permintaan ulang berbeda. Muat ulang pesanan sebelumnya.', 409);
        return json(unpack(existing));
      }
      await rateLimit(request, db);
      const s = await settings(db);
      if (!s.open) fail('Pemesanan sedang ditutup.', 409);
      const delivery = schedule(new Date(), s.cutoff);
      if (input.delivery !== delivery)
        fail('Jadwal pengantaran berubah. Periksa kembali tanggal pengantaran.', 409);
      const area = textField(input.area, 'Area', 80);
      if (!s.areas.includes(area)) fail('Alamat berada di luar area layanan.');
      const name = textField(input.name, 'Nama', 80, 2),
        phone = textField(input.phone, 'Nomor WhatsApp', 18).replace(/[ ()+-]/g, '');
      if (!/^(08\d{7,12}|628\d{7,12})$/.test(phone))
        fail('Isi nomor WhatsApp Indonesia yang valid.');
      const address = textField(input.address, 'Alamat', 400, 8),
        notes = textField(input.notes || '', 'Catatan', 300, 0);
      const substitution = textField(input.substitution, 'Pilihan pengganti', 100);
      if (
        ![
          'Hubungi saya terlebih dahulu',
          'Lewati barang tersebut',
          'Tawarkan pengganti dengan harga sama atau lebih murah',
        ].includes(substitution)
      )
        fail('Pilihan pengganti tidak valid.');
      if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 30)
        fail('Keranjang tidak valid.');
      const seen = new Set(),
        all = await catalog(db);
      const items = input.items.map((i) => {
        const p = all.find((p) => p.id === i.id);
        if (!p || !p.available || seen.has(i.id))
          fail('Produk tidak tersedia atau tercantum dua kali.');
        seen.add(i.id);
        if (i.price !== p.price)
          fail('Harga produk berubah. Muat ulang keranjang sebelum memesan.', 409);
        return { ...p, qty: integer(i.qty, 'Jumlah', 1, 20) };
      });
      const subtotal = items.reduce((n, i) => n + i.price * i.qty, 0);
      if (input.deliveryFee !== s.deliveryFee) fail('Ongkir berubah. Muat ulang keranjang.', 409);
      const data = {
        name,
        phone,
        address,
        area,
        notes,
        substitution,
        items,
        subtotal,
        deliveryFee: s.deliveryFee,
        total: subtotal + s.deliveryFee,
        finalTotal: null,
        quoteNote: '',
        paid: false,
        approved: false,
      };
      const id = 'HM-' + crypto.randomUUID().toUpperCase();
      const now = new Date().toISOString();
      const inserted = await db
        .prepare(
          "INSERT INTO orders(id,token_hash,request_hash,delivery,status,data,created_at,updated_at) SELECT ?,?,?,?,'Diterima',?,?,? WHERE (SELECT COUNT(*) FROM orders WHERE delivery=? AND status!='Dibatalkan') < ? ON CONFLICT(token_hash) DO NOTHING",
        )
        .bind(
          id,
          tokenHash,
          requestHash,
          delivery,
          JSON.stringify(data),
          now,
          now,
          delivery,
          s.capacity,
        )
        .run();
      if (!inserted.meta.changes) {
        const duplicate = await db
          .prepare('SELECT * FROM orders WHERE token_hash=?')
          .bind(tokenHash)
          .first();
        if (duplicate) {
          if (duplicate.request_hash !== requestHash) fail('Permintaan ulang berbeda.', 409);
          return json(unpack(duplicate));
        }
        fail('Pengantaran untuk tanggal ini sudah penuh.', 409);
      }
      return json(unpack(await orderRow(db, id)), 201);
    }
    if (path === '/api/seller/orders' && request.method === 'GET') {
      const rows = (
        await db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 500').all()
      ).results;
      return json({ orders: rows.map(unpack) });
    }
    if (path === '/api/seller/settings' && request.method === 'PUT') {
      const s = validateSettings(await body(request));
      await db
        .prepare(
          'INSERT INTO settings(id,data) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
        )
        .bind(JSON.stringify(s))
        .run();
      return json(s);
    }
    const productMatch = path.match(/^\/api\/seller\/products\/([a-z0-9-]+)$/);
    if (productMatch && request.method === 'PUT') {
      const p = validateProduct(await body(request), productMatch[1]);
      await db
        .prepare(
          'INSERT INTO products(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
        )
        .bind(p.id, JSON.stringify(p))
        .run();
      return json(p);
    }
    const match = path.match(/^\/api\/(seller\/)?orders\/(HM-[A-F0-9-]+)$/);
    if (match) {
      const row = await orderRow(db, match[2]);
      if (!match[1] && (await hash(token(request))) !== row.token_hash)
        fail('Tautan pesanan tidak valid.', 403);
      const order = unpack(row);
      if (request.method === 'GET') return json(order);
      if (request.method !== 'PATCH') fail('Metode tidak didukung.', 405);
      const input = await body(request);
      if (input.revision !== row.revision)
        fail('Pesanan telah berubah. Muat ulang sebelum melanjutkan.', 409);
      let status = row.status;
      const data = JSON.parse(row.data);
      if (match[1]) {
        if (input.action === 'quote') {
          if (!['Diterima', 'Menunggu persetujuan', 'Dikonfirmasi'].includes(status))
            fail('Pesanan ini tidak dapat diubah.', 409);
          data.finalTotal = integer(input.total, 'Total akhir', 0, 100000000);
          data.quoteNote = textField(input.note, 'Rincian berat / perubahan', 1000, 3);
          data.approved = false;
          status = 'Menunggu persetujuan';
        } else if (input.action === 'paid') {
          if (status !== 'Selesai')
            fail('Selesaikan pengantaran sebelum menandai pembayaran.', 409);
          data.paid = input.paid === true;
        } else if (input.action === 'status') {
          const next = input.status;
          const transitions = {
            Diterima: ['Dikonfirmasi', 'Dibatalkan'],
            'Menunggu persetujuan': ['Dibatalkan'],
            Dikonfirmasi: ['Dikemas', 'Dibatalkan'],
            Dikemas: ['Dalam perjalanan'],
            'Dalam perjalanan': ['Selesai'],
          };
          if (!transitions[status]?.includes(next)) fail('Perubahan status tidak diizinkan.', 409);
          status = next;
          if (next === 'Dikonfirmasi') {
            data.finalTotal = data.total;
            data.approved = true;
          }
        } else fail('Tindakan tidak dikenal.');
      } else {
        if (input.action === 'approve') {
          if (status !== 'Menunggu persetujuan')
            fail('Tidak ada perubahan yang perlu disetujui.', 409);
          data.approved = true;
          status = 'Dikonfirmasi';
        } else if (input.action === 'cancel') {
          if (!['Diterima', 'Menunggu persetujuan', 'Dikonfirmasi'].includes(status))
            fail('Pesanan sudah dikemas dan tidak dapat dibatalkan.', 409);
          status = 'Dibatalkan';
        } else fail('Tindakan tidak diizinkan.', 403);
      }
      const result = await db
        .prepare(
          'UPDATE orders SET data=?,status=?,updated_at=?,revision=revision+1 WHERE id=? AND revision=?',
        )
        .bind(JSON.stringify(data), status, new Date().toISOString(), row.id, row.revision)
        .run();
      if (!result.meta.changes) fail('Pesanan telah berubah. Muat ulang.', 409);
      return json(unpack(await orderRow(db, row.id)));
    }
    return json({ error: 'Tidak ditemukan.' }, 404);
  } catch (error) {
    if (!error.status) console.error('Request failed', path, error.message);
    return json(
      {
        error: error.status
          ? error.message
          : 'Layanan sedang bermasalah. Coba lagi; keranjang Anda tetap tersimpan.',
      },
      error.status || 500,
    );
  }
}
