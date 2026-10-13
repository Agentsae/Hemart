# Hemart

Independent grocery PWA for Perum Megaregency, with free delivery, evening preorders, a customer storefront, and a separate `/seller` dashboard. Deploy it to your own Cloudflare account; a custom domain is optional. Neither customers nor sellers need ChatGPT.

## Development

Use Node 22.13+ and run:

```
npm ci
npm run seller:setup
npm run dev
```

The setup command asks you for a local seller username and a long password using hidden input. Open http://localhost:3000 for shopping or http://localhost:3000/seller for seller login. Local SQLite data lives in `.local/hemart.sqlite`; local credentials live in `.dev.vars`. Both are ignored by Git. There is no automatic seller-login bypass.

```
npm test
npm run build
npm run deploy:check
```

`public/` contains the interface, `worker/` contains API/authentication code, `drizzle/` contains append-only schema migrations, and `wrangler.json` configures independent hosting. The build embeds the public files into `dist/server/index.js`. The old `.openai/hosting.json` records the legacy ChatGPT demo only; the independent build and deployment do not use it. The old hosted demo is not modified by these changes.

## Code formatting

Run `npm run format` to format the project, or `npm run format:check` to check formatting without changing files. JavaScript, HTML, CSS, and configuration files use Prettier with two-space indentation. Generated output, local data, and existing database migrations are excluded.

## Production deployment

See [DEPLOYMENT.md](DEPLOYMENT.md). First create your own Cloudflare account, create a D1 database, configure its returned ID, deploy, and set the production seller credentials. Until the seller credentials are configured, seller login fails closed. Until the seller opens the store, checkout is paused. No customer data, settings, or credentials from the ChatGPT demo are automatically transferred to the new database.

## Features

- Product categories/search, persistent cart, account-free checkout, private receipt links, reorder, and pre-packing cancellation.
- Server-side pricing, availability checks, Jakarta cutoff handling, atomic daily order capacity, and idempotent checkout retries.
- Seller orders, packing/preparation lists, delivery stages, cash payment tracking, product editing, availability and delivery settings.
- Changed totals and weight/substitution notes require customer approval before packing.
- Separate seller login with salted password derivation, random database-backed sessions, HttpOnly/Secure/SameSite cookies, logout revocation, credential-rotation invalidation and login throttling. Production credentials are Cloudflare secrets; passwords are never stored in plaintext. This is a single seller account, not a multi-staff role system.
- PWA manifest and offline app shell/catalog/cart. Creating or changing orders requires an internet connection. Private API responses and seller pages are not cached by the service worker.

Default settings: Perum Megaregency, Rp0 delivery, 21:00 WIB cutoff, delivery from 06:00, 20 orders per delivery date, blank WhatsApp number, and checkout paused pending real product/price review. Settings are editable from the seller dashboard. WhatsApp buttons open a conversation; they do not send automatic messages. Cash on delivery is supported; online payments, WhatsApp OTP, push notifications, and live GPS are not included.

Private receipt links grant access to that order, including approval/cancellation. Customers should save them securely and avoid sharing them publicly. Completed and canceled orders are deleted after 30 days; active orders remain until resolved. The seller list pages through retained history.
