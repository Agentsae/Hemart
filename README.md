# Hemart

An Indonesian neighborhood-grocery PWA for Perum Megaregency. Cloudflare Worker backend with persistent D1 storage; responsive vanilla-JavaScript storefront. No runtime package dependencies.

## Run and verify

Node 22.13+ is required for the local SQLite adapter.

```
npm run dev
npm test
npm run build
```

Local preview: http://localhost:3000. The local database is `.local/hemart.sqlite`, excluded from Git and deployment. To test the seller locally in PowerShell, run `$env:DEV_SELLER='1'` before `npm run dev`. This affects the loopback-only local server; the deployed Worker never implements this bypass.

Edit `public/` for the UI, `worker/api.js` for the API, and `worker/catalog.js` for initial catalog entries. `scripts/build.mjs` embeds public assets into `dist/server/index.js`. `dist/` is generated output and the hosting manifest selects the Worker. Schema migrations are in `drizzle/`; applied migrations must not be modified. The Sites publisher provisions the `DB` binding and applies migrations.

## Access and launch

Customer storefront: `/`. Seller dashboard: `/seller` (no seller link on the storefront). The server redirects unauthenticated dashboard requests to sign-in and denies non-seller accounts. Legacy `/#seller` bookmarks redirect to `/seller`.

- Seller access uses verified Sites identity headers and the production `SELLER_EMAILS` allowlist configured through Sites runtime settings. A WhatsApp number is contact information, not an authentication credential.
- Customers can order without an account when the Site audience permits anonymous access. The current Site remains owner-private until its audience is explicitly changed.
- Guest receipts use a random 256-bit capability. Only its SHA-256 hash is stored in D1. The receipt link uses a URL fragment, then removes it from the address bar after importing. Anyone with the private link can view/approve/cancel that order; do not share publicly. Receipt keys are kept in browser storage for order history.
- Private API responses are never cached. Offline mode keeps the shell, last public catalog and cart; it does not silently queue orders. Failed checkout retries reuse the same idempotency token. A pending checkout remains on the device until its outcome is resolved.
- Default service area: **Perum Megaregency**. Delivery: **Rp0**. Cutoff: **21:00 Asia/Jakarta**; delivery starts **06:00** along the route. Default capacity: 20 orders per delivery date. These settings are editable.
- The WhatsApp field is intentionally blank. The customer contact button remains hidden until a valid number is entered. WhatsApp buttons only open a conversation; no automatic messages or notifications are sent.
- Ordering starts paused. In **Dashboard penjual → Produk & harga**, replace illustrative prices and check availability. Then open orders under **Pengaturan toko**. Pausing orders does not prevent processing existing orders.

## Order flow

Orders are priced server-side using current product data, with stale-price and date checks. Capacity is enforced by a conditional database insert, and retry tokens prevent duplicate orders. Seller status transitions and customer access are checked on the server, with optimistic revisions to prevent stale overwrites.

Normal flow: Diterima → Dikonfirmasi → Dikemas → Dalam perjalanan → Selesai. Changes to total, weight or substitutions enter Menunggu persetujuan, and the customer must approve before packing. Seller notes explain changes; packing lists retain original requested portions so the seller should review these notes. Customers can cancel before packing. Cash receipt is recorded after delivery. The dashboard supports product creation/editing, availability, combined shopping lists, printing, date filters and 30-second order refresh. It displays up to 500 most recent orders.

## Tests and scope

Tests exercise authorization, CSRF origin rejection, private receipt access, duplicate retry behavior, atomic capacity, cancellation, stale revisions, unavailable products, quote approval, fulfillment/payment and Jakarta cutoff boundaries. Local UI testing uses only a separate test database.

This release uses cash on delivery. It does not include WhatsApp OTP login, automated WhatsApp messages, online payments, live GPS, or push notifications. Product images use Unsplash and fonts use Google Fonts. Real customer data is not committed or bundled with the application.
