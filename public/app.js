const $ = (s) => document.querySelector(s);
const sellerPage = location.pathname === '/seller';
if (sellerPage) {
  document.body.classList.add('seller-mode');
  document.title = 'Hemart — Dashboard Penjual';
  $('nav').hidden = true;
  $('.header-actions').hidden = true;
  $('#shop-page').hidden = true;
  $('#seller-page').hidden = false;
  const back = document.createElement('a');
  back.href = '/';
  back.className = 'secondary';
  back.textContent = 'Lihat toko ↗';
  $('header').append(back);
  const logout = document.createElement('button');
  logout.className = 'secondary';
  logout.id = 'seller-logout';
  logout.textContent = 'Keluar';
  $('header').append(logout);
}

const esc = (v) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const money = (v) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(v);
const day = (v) =>
  new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(v + 'T05:00:00Z'));
function read(k, f) {
  try {
    return JSON.parse(localStorage.getItem(k)) ?? f;
  } catch {
    return f;
  }
}
function save(k, v) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
    return true;
  } catch {
    toast('Penyimpanan perangkat tidak tersedia. Simpan tautan pesanan Anda.');
    return false;
  }
}
let products = [],
  config = {},
  delivery = '',
  remaining = 0,
  seller = false,
  cart = read('hemart-cart', {}),
  receipts = read('hemart-receipts', []),
  orders = [],
  sellerOrders = [],
  category = 'Semua',
  query = '',
  page = 'shop',
  sellerMode = 'orders',
  filterDate = '',
  pending = read('hemart-pending', null),
  busy = false;
if (!cart || typeof cart !== 'object' || Array.isArray(cart)) cart = {};
if (!Array.isArray(receipts)) receipts = [];
const subtotal = () =>
  Object.entries(cart).reduce(
    (sum, [id, q]) => sum + (products.find((p) => p.id === id)?.price || 0) * q,
    0,
  );
let timer;
function toast(msg) {
  $('#toast').textContent = msg;
  $('#toast').classList.add('visible');
  clearTimeout(timer);
  timer = setTimeout(() => $('#toast').classList.remove('visible'), 6000);
}
async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
      cache: 'no-store',
    });
  } catch {
    throw new Error('Tidak dapat terhubung. Periksa internet; keranjang Anda tetap tersimpan.');
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error('Sesi perlu diperbarui. Muat ulang halaman.');
  }
  if (!response.ok)
    throw Object.assign(new Error(result.error || 'Permintaan gagal.'), {
      status: response.status,
    });
  return result;
}
function receiptToken(id) {
  return receipts.find((r) => r.id === id)?.token;
}
function receiptURL(id) {
  return `${location.origin}/#receipt=${encodeURIComponent(id)}&key=${receiptToken(id)}`;
}
async function bootstrap() {
  const data = await api('/api/bootstrap');
  products = data.products;
  config = data.settings;
  delivery = data.delivery;
  remaining = data.remaining;
  seller = data.seller;
  cart = Object.fromEntries(
    Object.entries(cart).filter(
      ([id, q]) => products.some((p) => p.id === id) && Number.isInteger(q) && q > 0 && q <= 20,
    ),
  );
  renderProducts();
  renderCategories();
  $('#delivery-label').textContent = `Pengantaran ${day(delivery)}`;
  const cutoffLabel = `${String(config.cutoff).padStart(2, '0')}.00 WIB`;
  $('.cutoff b').textContent = cutoffLabel;
  $('#about-cutoff').textContent = `1. Pesan sebelum ${cutoffLabel}`;
  $('#service-notice').textContent = config.open
    ? remaining
      ? `${config.areas.join(' · ')} · ${config.deliveryFee ? money(config.deliveryFee) + ' ongkir' : 'Gratis ongkir'} · ${remaining} slot tersedia`
      : 'Rute berikutnya penuh. Silakan cek kembali nanti.'
    : config.announcement || 'Pemesanan sedang ditutup.';
  $('#shop-status').textContent = config.open ? 'Pemesanan dibuka' : 'Pemesanan belum dibuka';
  $('#contact-link').hidden = !config.whatsapp;
  if (config.whatsapp) $('#contact-link').href = `https://wa.me/${config.whatsapp}`;
  return data;
}
function qtyControl(id) {
  const p = products.find((p) => p.id === id);
  return /* HTML */ `<div class="quantity">
    <button data-change="${id}" data-delta="-1" aria-label="Kurangi ${esc(p.name)}">−</button
    ><span>${cart[id]}</span
    ><button
      data-change="${id}"
      data-delta="1"
      ${cart[id] >= 20 || !p.available ? 'disabled' : ''}
      aria-label="Tambah ${esc(p.name)}"
    >
      +
    </button>
  </div>`;
}
function renderCategories() {
  $('#categories').innerHTML = ['Semua', 'Sayuran', 'Buah', 'Lauk', 'Dapur']
    .map(
      (name) => /* HTML */ `<button
          class="category ${category === name ? 'active' : ''}"
          data-category="${name}"
          aria-pressed="${category === name}"
        >
          ${name === 'Semua' ? '✦ Semua produk' : name}
        </button>`,
    )
    .join('');
}
function renderProducts() {
  const list = products.filter(
    (p) =>
      (category === 'Semua' || p.category === category) && p.name.toLowerCase().includes(query),
  );
  $('#products').innerHTML = list
    .map(
      (p) => /* HTML */ `<article class="product-card">
          <div class="product-image">
            <img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" />${
              !p.available || p.tag
                ? /* HTML */ `<span class="product-tag"
                  >${p.available ? esc(p.tag) : 'Sedang kosong'}</span
                >`
                : ''
            }
          </div>
          <div class="product-body">
            <h3>${esc(p.name)}</h3>
            <span class="unit">${esc(p.unit)}</span>
            <div class="price-row">
              <strong>${money(p.price)}</strong>${
                cart[p.id]
                  ? qtyControl(p.id)
                  : /* HTML */ `<button
                    class="add"
                    data-change="${p.id}"
                    data-delta="1"
                    ${!p.available ? 'disabled' : ''}
                    aria-label="Tambah ${esc(p.name)} ke keranjang"
                  >
                    +
                  </button>`
              }
            </div>
          </div>
        </article>`,
    )
    .join('');
  $('#empty').hidden = list.length > 0;
  $('#result-count').textContent = `${list.length} produk`;
  $('#cart-count').textContent = Object.values(cart).reduce((a, b) => a + b, 0);
}
function renderCart() {
  $('#cart-items').innerHTML =
    Object.entries(cart)
      .map(([id, q]) => {
        const p = products.find((p) => p.id === id);
        return /* HTML */ `<div class="cart-item">
          <img src="${esc(p.image)}" alt="" />
          <div class="cart-item-info">
            <h3>${esc(p.name)}</h3>
            <small>${money(p.price * q)} · ${esc(p.unit)}${!p.available ? ' · Kosong' : ''}</small>
          </div>
          ${qtyControl(id)}
        </div>`;
      })
      .join('') || '<div class="empty">Keranjang masih kosong.</div>';
  const blocked =
    !config.open ||
    !remaining ||
    Object.keys(cart).some((id) => !products.find((p) => p.id === id)?.available);
  $('#cart-summary').innerHTML = Object.keys(cart).length
    ? /* HTML */ `<div class="summary-row"><span>Belanja</span><b>${money(subtotal())}</b></div>
        <div class="summary-row"><span>Ongkir</span><b>${money(config.deliveryFee || 0)}</b></div>
        <p class="muted">
          Perubahan berat, harga, atau barang harus Anda setujui sebelum pesanan dikemas.
        </p>
        ${
          blocked
            ? '<p class="notice">Checkout belum tersedia. Periksa status toko, slot pengantaran, dan barang kosong.</p>'
            : ''
        }<button class="primary full" id="checkout-start" ${blocked ? 'disabled' : ''}>
          Lanjut pengantaran →
        </button>`
    : '';
}
async function showPage(next) {
  if (next === 'seller' && !sellerPage) {
    location.assign('/seller');
    return;
  }
  if (sellerPage && next !== 'seller') {
    location.assign('/');
    return;
  }
  page = next;
  for (const name of ['shop', 'orders', 'about', 'seller'])
    $(`#${name}-page`).hidden = name !== next;
  document
    .querySelectorAll('.nav-button')
    .forEach((b) => b.classList.toggle('active', b.dataset.page === next));
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (next === 'orders') await loadOrders();
  if (next === 'seller') await loadSeller();
}
function actionButton(label, id, action, s = false, extra = '') {
  return /* HTML */ `<button
    class="secondary"
    data-order="${id}"
    data-action="${action}"
    ${s ? 'data-seller="true"' : ''}
    ${extra}
  >
    ${label}
  </button>`;
}
function orderCard(o, s = false) {
  let actions = '';
  if (s) {
    const next = {
      Diterima: 'Dikonfirmasi',
      Dikonfirmasi: 'Dikemas',
      Dikemas: 'Dalam perjalanan',
      'Dalam perjalanan': 'Selesai',
    }[o.status];
    if (next)
      actions += actionButton(`Tandai ${next}`, o.id, 'status', true, `data-status="${next}"`);
    if (['Diterima', 'Menunggu persetujuan', 'Dikonfirmasi'].includes(o.status)) {
      actions +=
        actionButton('Perbarui total / berat', o.id, 'quote', true) +
        actionButton('Batalkan', o.id, 'status', true, 'data-status="Dibatalkan"');
    }
    if (o.status === 'Selesai')
      actions += actionButton(
        o.paid ? 'Tandai belum dibayar' : 'Tandai sudah dibayar',
        o.id,
        'paid',
        true,
      );
    actions += /* HTML */ `<a
      class="secondary"
      href="https://wa.me/${o.phone.replace(/^0/, '62')}"
      target="_blank"
      rel="noopener noreferrer"
      >Hubungi pelanggan ↗</a
    >`;
  } else {
    if (o.status === 'Menunggu persetujuan')
      actions += actionButton('Setujui total & perubahan', o.id, 'approve');
    if (['Diterima', 'Menunggu persetujuan', 'Dikonfirmasi'].includes(o.status))
      actions += actionButton('Batalkan pesanan', o.id, 'cancel');
    actions += /* HTML */ `<button class="secondary" data-reorder="${o.id}">Belanja lagi</button
      ><button class="secondary" data-copy="${o.id}">Salin tautan privat</button>`;
  }
  return /* HTML */ `<article class="order-card">
    <div class="order-top">
      <div>
        <h3>${esc(o.id.slice(0, 11))}</h3>
        <span class="muted">${day(o.delivery)} · Mulai 06.00 WIB</span>
      </div>
      <span class="status">${esc(o.status)}</span>
    </div>
    <p>
      <b>${esc(o.name)}</b> · ${esc(o.area)}<br />${esc(o.address)}${
        s ? /* HTML */ `<br />${esc(o.phone)}<br />Barang kosong: ${esc(o.substitution)}` : ''
      }${o.notes ? /* HTML */ `<br />Catatan: ${esc(o.notes)}` : ''}
    </p>
    <ul>
      ${o.items
        .map(
          (i) => /* HTML */ `<li>
              ${i.qty} × ${esc(i.name)}
              <span class="muted">(${esc(i.unit)}) · ${money(i.price * i.qty)}</span>
            </li>`,
        )
        .join('')}
    </ul>
    <p>
      Ongkir: ${money(o.deliveryFee)}<br /><b
        >${o.finalTotal === null ? 'Perkiraan' : 'Total akhir'}:
        ${money(o.finalTotal ?? o.total)}</b
      >
      · ${o.paid ? 'Sudah dibayar' : 'Bayar tunai saat diterima'}
    </p>
    ${
      o.quoteNote
        ? /* HTML */ `<p class="notice">
          <b>Rincian penjual:</b> ${esc(o.quoteNote)}${
            o.status === 'Menunggu persetujuan'
              ? '<br>Periksa total dan rincian sebelum menyetujui.'
              : ''
          }
        </p>`
        : ''
    }
    <div class="order-actions">${actions}</div>
  </article>`;
}
async function loadOrders() {
  if (!receipts.length) {
    $('#orders-list').innerHTML =
      '<div class="empty">Belum ada pesanan di perangkat ini. Buka tautan privat pesanan untuk melacak dari perangkat lain.</div>';
    return;
  }
  const results = await Promise.allSettled(
    receipts.map((r) => api(`/api/orders/${r.id}`, { headers: { 'X-Receipt-Token': r.token } })),
  );
  orders = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  $('#orders-list').innerHTML =
    orders.map((o) => orderCard(o)).join('') +
    (results.some((r) => r.status === 'rejected')
      ? '<p class="notice">Sebagian pesanan tidak dapat dimuat. Periksa koneksi atau tautan privat Anda.</p>'
      : '');
}
async function loadSeller() {
  if (!seller) {
    $('#seller-content').innerHTML =
      '<div class="empty"><p>Dashboard ini khusus penjual.</p><a class="primary" href="/seller/login" target="_top">Masuk dengan akun penjual</a><p class="muted">Gunakan nama pengguna dan kata sandi penjual Hemart.</p></div>';
    $('.seller-tabs').hidden = true;
    return;
  }
  $('.seller-tabs').hidden = false;
  sellerOrders = (await api('/api/seller/orders')).orders;
  renderSeller();
}
function renderSeller() {
  if (sellerMode === 'settings') {
    renderSettings();
    return;
  }
  if (sellerMode === 'products') {
    renderProductAdmin();
    return;
  }
  const list = sellerOrders.filter((o) => !filterDate || o.delivery === filterDate);
  $('#seller-content').innerHTML = /* HTML */ `<div class="seller-summary">
      <div>
        <b>${list.filter((o) => !['Selesai', 'Dibatalkan'].includes(o.status)).length}</b> pesanan
        aktif
      </div>
      <div>
        <b
          >${money(
            list.filter((o) => o.paid).reduce((n, o) => n + (o.finalTotal ?? o.total), 0),
          )}</b
        >
        diterima
      </div>
      <div>${config.open ? 'Toko dibuka' : 'Toko ditutup'} · ${remaining} slot berikutnya</div>
    </div>
    <div class="seller-filters">
      <label>Tanggal pengantaran <input id="seller-date" type="date" value="${filterDate}" /></label
      ><button class="secondary" id="seller-all">Semua tanggal</button
      ><button class="secondary" id="seller-refresh">Perbarui</button
      ><button class="secondary" id="print-list">Cetak</button>
    </div>
    <p class="muted">Maksimal 500 pesanan terbaru. Pilih tanggal untuk persiapan rute.</p>
    <div id="seller-results"></div>`;
  if (sellerMode === 'prep') {
    const groups = {};
    for (const o of list.filter((o) => !['Selesai', 'Dibatalkan'].includes(o.status))) {
      groups[o.delivery] ??= {};
      for (const i of o.items) {
        groups[o.delivery][i.id] ??= { name: i.name, unit: i.unit, qty: 0 };
        groups[o.delivery][i.id].qty += i.qty;
      }
    }
    $('#seller-results').innerHTML =
      Object.entries(groups)
        .sort()
        .map(
          ([date, items]) => /* HTML */ `<article class="order-card">
              <h2>${day(date)}</h2>
              <table>
                <thead>
                  <tr>
                    <th>Bahan</th>
                    <th>Porsi</th>
                  </tr>
                </thead>
                <tbody>
                  ${Object.values(items)
                    .map(
                      (i) => /* HTML */ `<tr>
                          <td>${esc(i.name)}<br /><small>${esc(i.unit)}</small></td>
                          <td>${i.qty}</td>
                        </tr>`,
                    )
                    .join('')}
                </tbody>
              </table>
              <p class="muted">
                Periksa catatan tiap pelanggan sebelum membeli atau mengganti barang.
              </p>
            </article>`,
        )
        .join('') || '<div class="empty">Tidak ada bahan yang perlu dibeli.</div>';
  } else
    $('#seller-results').innerHTML =
      list.map((o) => orderCard(o, true)).join('') ||
      '<div class="empty">Belum ada pesanan. Pesanan baru akan muncul di sini.</div>';
}
function renderSettings() {
  $('#seller-content').innerHTML = /* HTML */ `<form id="settings-form" class="order-card">
    <h2>Pengaturan toko</h2>
    <label
      >Area layanan, satu per baris<textarea name="areas" required>${esc(config.areas.join('\n'))}</textarea
      >
    </label>
    <div class="form-grid">
      <label
        >Ongkir (Rp)<input
          name="deliveryFee"
          type="number"
          min="0"
          max="100000"
          required
          value="${config.deliveryFee}" /></label
      ><label
        >Maksimal pesanan per hari<input
          name="capacity"
          type="number"
          min="1"
          max="100"
          required
          value="${config.capacity}" /></label
      ><label
        >Batas pemesanan (jam WIB)
        <select name="cutoff" required>
          ${[12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0]
            .map(
              (hour) =>
                `<option value="${hour}" ${config.cutoff === hour ? 'selected' : ''}>${String(hour).padStart(2, '0')}.00 WIB${hour === 0 ? ' (tengah malam)' : ''}</option>`,
            )
            .join('')}
        </select>
        <small>Lewat batas waktu, pesanan masuk jadwal berikutnya. Batas 00.00 berarti pesanan sebelum pergantian hari diantar besok pagi.</small>
      </label
      ><label
        >WhatsApp toko (opsional)<input
          name="whatsapp"
          type="tel"
          placeholder="62xxxxxxxxxxx"
          value="${esc(config.whatsapp)}"
      /></label>
    </div>
    <label
      >Pengumuman toko<textarea name="announcement" maxlength="300">${esc(config.announcement)}</textarea
      ></label
    ><label class="check-label"
      ><input name="open" type="checkbox" ${config.open ? 'checked' : ''} /> Buka pemesanan — saya
      sudah memeriksa harga dan ketersediaan produk.</label
    >
    <p class="muted">
      Nomor kosong menyembunyikan tombol kontak. Perubahan ongkir berlaku untuk pesanan baru.
    </p>
    <button class="primary" type="submit">Simpan pengaturan</button>
  </form>`;
}
function renderProductAdmin() {
  $('#seller-content').innerHTML = /* HTML */ `<div class="seller-filters">
      <h2>Katalog & harga</h2>
      <button class="primary" id="new-product">Tambah produk</button>
    </div>
    <p class="notice">
      Periksa harga awal sebelum membuka pemesanan. Pesanan lama menyimpan harga saat checkout.
    </p>
    <div class="admin-products">
      ${products
        .map(
          (p) => /* HTML */ `<article class="order-card">
              <h3>${esc(p.name)}</h3>
              <p>
                ${esc(p.unit)}<br /><b>${money(p.price)}</b> ·
                ${p.available ? 'Tersedia' : 'Kosong'}
              </p>
              <button class="secondary" data-edit-product="${p.id}">Ubah produk</button>
            </article>`,
        )
        .join('')}
    </div>`;
}
function editProduct(id) {
  const p = products.find((p) => p.id === id) || {
    id: '',
    name: '',
    unit: '',
    price: 1000,
    category: 'Sayuran',
    image: '/icon.svg',
    tag: '',
    available: true,
  };
  $('#product-form').innerHTML = /* HTML */ `<input name="id" type="hidden" value="${p.id}" /><label
      >Nama produk<input name="name" required maxlength="80" value="${esc(p.name)}" /></label
    ><label
      >Satuan / berat<input
        name="unit"
        required
        maxlength="80"
        value="${esc(p.unit)}"
        placeholder="1 bungkus · 500 g" /></label
    ><label
      >Harga (Rp)<input
        name="price"
        type="number"
        required
        min="1"
        max="10000000"
        value="${p.price}" /></label
    ><label
      >Kategori<select name="category">
        ${['Sayuran', 'Buah', 'Lauk', 'Dapur']
          .map((c) => /* HTML */ `<option ${c === p.category ? 'selected' : ''}>${c}</option>`)
          .join('')}
      </select></label
    ><label
      >URL foto (opsional)<input
        name="image"
        value="${esc(p.image)}"
        placeholder="https://images.unsplash.com/…" /></label
    ><label>Label pendek<input name="tag" maxlength="40" value="${esc(p.tag)}" /></label
    ><label class="check-label"
      ><input name="available" type="checkbox" ${p.available ? 'checked' : ''} /> Tersedia untuk
      dipesan</label
    ><button class="primary full" type="submit">Simpan produk</button>`;
  $('#product-dialog').showModal();
}
async function startCheckout() {
  await bootstrap();
  renderCart();
  if (!config.open || !remaining) throw new Error('Pemesanan belum tersedia.');
  $('#cart-dialog').close();
  $('#checkout-area').innerHTML = config.areas
    .map((a) => /* HTML */ `<option>${esc(a)}</option>`)
    .join('');
  $('.checkout-delivery').textContent =
    `${day(delivery)} · mulai 06.00 WIB sesuai rute. Total perkiraan ${money(subtotal() + config.deliveryFee)}, termasuk ongkir ${money(config.deliveryFee)}.`;
  $('#checkout-dialog').dataset.delivery = delivery;
  $('#checkout-error').hidden = true;
  $('#checkout-dialog').showModal();
}
function randomToken() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
async function completeOrder(o, t) {
  receipts = [{ id: o.id, token: t }, ...receipts.filter((r) => r.id !== o.id)];
  save('hemart-receipts', receipts);
  pending = null;
  save('hemart-pending', null);
  $('#pending-notice').hidden = true;
  cart = {};
  save('hemart-cart', cart);
  renderProducts();
  await showPage('orders');
  toast('Pesanan diterima. Simpan tautan privat untuk melacak dari perangkat lain.');
}
async function submitOrder(form) {
  if (busy) return;
  busy = true;
  const submit = form.querySelector('[type=submit]');
  submit.disabled = true;
  try {
    if (!pending) {
      const fields = Object.fromEntries(new FormData(form));
      pending = {
        token: randomToken(),
        payload: {
          ...fields,
          delivery: $('#checkout-dialog').dataset.delivery,
          deliveryFee: config.deliveryFee,
          items: Object.entries(cart).map(([id, qty]) => ({
            id,
            qty,
            price: products.find((p) => p.id === id).price,
          })),
        },
      };
      if (!save('hemart-pending', pending)) {
        pending = null;
        throw new Error('Aktifkan penyimpanan browser agar pesanan tidak hilang.');
      }
    }
    const o = await api('/api/orders', {
      method: 'POST',
      headers: { 'X-Receipt-Token': pending.token },
      body: JSON.stringify(pending.payload),
    });
    const t = pending.token;
    form.reset();
    $('#checkout-dialog').close();
    await completeOrder(o, t);
    await bootstrap();
  } catch (error) {
    if (error.status && error.status < 500) {
      pending = null;
      save('hemart-pending', null);
    }
    $('#checkout-error').textContent = error.message;
    $('#checkout-error').hidden = false;
  } finally {
    busy = false;
    submit.disabled = false;
  }
}
async function handleOrder(b) {
  const id = b.dataset.order,
    s = b.dataset.seller === 'true',
    action = b.dataset.action,
    o = (s ? sellerOrders : orders).find((o) => o.id === id);
  if (action === 'quote') {
    $('#quote-form').dataset.id = id;
    $('#quote-total').value = o.finalTotal ?? o.total;
    $('#quote-note').value = o.quoteNote;
    $('#quote-dialog').showModal();
    return;
  }
  if (
    (action === 'cancel' || b.dataset.status === 'Dibatalkan') &&
    !confirm('Batalkan pesanan ini?')
  )
    return;
  if (
    action === 'approve' &&
    !confirm(`Setujui total ${money(o.finalTotal)} dan rincian perubahan penjual?`)
  )
    return;
  await api(`/api/${s ? 'seller/' : ''}orders/${id}`, {
    method: 'PATCH',
    headers: s ? {} : { 'X-Receipt-Token': receiptToken(id) },
    body: JSON.stringify({ action, revision: o.revision, status: b.dataset.status, paid: !o.paid }),
  });
  await (s ? loadSeller() : loadOrders());
  toast('Pesanan diperbarui.');
}
document.addEventListener('click', async (event) => {
  const b = event.target.closest('button');
  if (!b) return;
  try {
    if (b.id === 'seller-logout') {
      await api('/api/auth/logout', { method: 'POST', body: '{}' });
      location.replace('/seller/login');
      return;
    }
    if (b.dataset.change) {
      const id = b.dataset.change;
      cart[id] = Math.max(0, Math.min(20, (cart[id] || 0) + Number(b.dataset.delta)));
      if (!cart[id]) delete cart[id];
      save('hemart-cart', cart);
      renderProducts();
      renderCart();
    }
    if (b.dataset.category) {
      category = b.dataset.category;
      renderCategories();
      renderProducts();
    }
    if (b.dataset.page) await showPage(b.dataset.page);
    if (b.dataset.close) $(`#${b.dataset.close}`).close();
    if (b.id === 'cart-open') {
      renderCart();
      $('#cart-dialog').showModal();
    }
    if (b.id === 'checkout-start') await startCheckout();
    if (b.dataset.reorder) {
      const o = orders.find((o) => o.id === b.dataset.reorder);
      for (const i of o.items)
        if (products.some((p) => p.id === i.id && p.available))
          cart[i.id] = Math.min(20, (cart[i.id] || 0) + i.qty);
      save('hemart-cart', cart);
      renderProducts();
      renderCart();
      $('#cart-dialog').showModal();
    }
    if (b.dataset.copy) {
      try {
        await navigator.clipboard.writeText(receiptURL(b.dataset.copy));
        toast('Tautan privat disalin. Hanya bagikan kepada orang yang Anda percayai.');
      } catch {
        prompt('Salin tautan privat pesanan:', receiptURL(b.dataset.copy));
      }
    }
    if (b.dataset.order) {
      b.disabled = true;
      try {
        await handleOrder(b);
      } finally {
        b.disabled = false;
      }
    }
    if (b.dataset.sellerMode) {
      sellerMode = b.dataset.sellerMode;
      await loadSeller();
    }
    if (b.id === 'seller-refresh' || b.id === 'refresh-orders') {
      await bootstrap();
      await (b.id === 'refresh-orders' ? loadOrders() : loadSeller());
    }
    if (b.id === 'seller-all') {
      filterDate = '';
      renderSeller();
    }
    if (b.id === 'print-list') window.print();
    if (b.dataset.editProduct) editProduct(b.dataset.editProduct);
    if (b.id === 'new-product') editProduct();
    if (b.id === 'recover-pending' && pending) {
      b.disabled = true;
      try {
        const o = await api('/api/orders', {
          method: 'POST',
          headers: { 'X-Receipt-Token': pending.token },
          body: JSON.stringify(pending.payload),
        });
        await completeOrder(o, pending.token);
      } finally {
        b.disabled = false;
      }
    }
  } catch (error) {
    toast(error.message);
  }
});
document.addEventListener('submit', async (event) => {
  const form = event.target;
  if (!['checkout-form', 'settings-form', 'product-form', 'quote-form'].includes(form.id)) return;
  event.preventDefault();
  if (form.id === 'checkout-form') {
    await submitOrder(form);
    return;
  }
  const button = form.querySelector('[type=submit]');
  button.disabled = true;
  try {
    const v = Object.fromEntries(new FormData(form));
    if (form.id === 'settings-form') {
      await api('/api/seller/settings', {
        method: 'PUT',
        body: JSON.stringify({
          ...v,
          areas: v.areas
            .split('\n')
            .map((a) => a.trim())
            .filter(Boolean),
          deliveryFee: Number(v.deliveryFee),
          capacity: Number(v.capacity),
          cutoff: Number(v.cutoff),
          open: v.open === 'on',
        }),
      });
      await bootstrap();
      renderSettings();
    }
    if (form.id === 'product-form') {
      const id = v.id || 'produk-' + crypto.randomUUID().slice(0, 8);
      await api('/api/seller/products/' + id, {
        method: 'PUT',
        body: JSON.stringify({ ...v, price: Number(v.price), available: v.available === 'on' }),
      });
      $('#product-dialog').close();
      await bootstrap();
      renderProductAdmin();
    }
    if (form.id === 'quote-form') {
      const o = sellerOrders.find((o) => o.id === form.dataset.id);
      await api('/api/seller/orders/' + o.id, {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'quote',
          revision: o.revision,
          total: Number(v.total),
          note: v.note,
        }),
      });
      $('#quote-dialog').close();
      await loadSeller();
    }
    toast('Perubahan tersimpan.');
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
});
$('#search').addEventListener('input', (e) => {
  query = e.target.value.trim().toLowerCase();
  renderProducts();
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'seller-date') {
    filterDate = e.target.value;
    renderSeller();
  }
});
let installPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  $('#install').hidden = false;
});
$('#install').addEventListener('click', async () => {
  if (installPrompt) {
    await installPrompt.prompt();
    installPrompt = null;
    $('#install').hidden = true;
  }
});
window.addEventListener('offline', () =>
  toast('Anda offline. Keranjang tersimpan, tetapi pesanan membutuhkan internet.'),
);
async function openFragment() {
  if (sellerPage) {
    await showPage('seller');
    return;
  }
  if (location.hash === '#seller') {
    location.replace('/seller');
    return;
  }
  const params = new URLSearchParams(location.hash.slice(1)),
    id = params.get('receipt'),
    key = params.get('key');
  if (id && key && /^HM-[A-F0-9-]+$/.test(id) && /^[-_A-Za-z0-9]{43}$/.test(key)) {
    receipts = [{ id, token: key }, ...receipts.filter((r) => r.id !== id)];
    save('hemart-receipts', receipts);
    history.replaceState(null, '', location.pathname);
    await showPage('orders');
  }
}
window.addEventListener('hashchange', () => openFragment().catch((e) => toast(e.message)));
try {
  const data = await bootstrap();
  save('hemart-catalog-cache', {
    products: data.products,
    settings: data.settings,
    delivery: data.delivery,
  });
  await openFragment();
  $('#pending-notice').hidden = !pending;
} catch (e) {
  const cached = read('hemart-catalog-cache', null);
  if (cached?.products?.length) {
    products = cached.products;
    config = { ...cached.settings, open: false };
    delivery = cached.delivery;
    cart = Object.fromEntries(
      Object.entries(cart).filter(
        ([id, q]) => products.some((p) => p.id === id) && Number.isInteger(q) && q > 0 && q <= 20,
      ),
    );
    renderProducts();
    renderCategories();
    $('#shop-status').textContent = 'Offline · katalog terakhir';
  }
  $('#service-notice').textContent = e.message;
  toast(e.message);
}
setInterval(async () => {
  if (document.hidden || document.querySelector('dialog[open]')) return;
  try {
    if (page === 'orders') await loadOrders();
    if (
      page === 'seller' &&
      sellerMode === 'orders' &&
      seller &&
      !document.activeElement?.closest('.seller-filters')
    )
      await loadSeller();
  } catch {}
}, 30000);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
