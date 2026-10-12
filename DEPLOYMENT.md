# Launch Hemart outside ChatGPT

You do not need to buy a domain before testing. Cloudflare assigns an HTTPS address such as `hemart.<your-account-subdomain>.workers.dev`; the actual address is returned by deployment. No independent site exists until you complete the account steps below.

## 1. Create your account and sign in

Create your own account at https://dash.cloudflare.com/sign-up and verify your email. Complete account agreements yourself. From a terminal in the Hemart folder:

```
npm ci
npm run cf -- login
```

Complete the browser authorization yourself. Do not paste your Cloudflare password or API token into chat. No hosting account, paid plan, or domain purchase is performed by the setup scripts.

## 2. Create the production database

```
npm run cf -- d1 create hemart-production
```

Copy the returned `database_id` into the next command:

```
npm run database:configure -- YOUR_DATABASE_ID
```

This updates `wrangler.json`. Keep the `DB` binding and `drizzle` migrations directory intact. If you already created this database, reuse its ID rather than creating another one. The initial all-zero ID is a placeholder and the deploy script refuses to publish with it.

## 3. Deploy and configure the seller

```
npm run deploy
npm run seller:setup -- --production
```

The deploy command builds the Worker, applies pending remote D1 migrations, and publishes it. The first publication is safe to inspect: ordering defaults to closed and the seller account has no usable credentials yet.

The seller setup command asks for a username (for example `bapak`) and a password/passphrase of at least 16 characters, entered twice with input hidden. It uploads the username and salted password hash directly to Cloudflare secrets through stdin. It does not write production credentials to source files or print the password/hash. Setting secrets publishes their updated runtime values. Keep the password in a password manager and share it with your father privately.

To reset the password later, rerun `npm run seller:setup -- --production`. Existing seller sessions stop working after credentials change. There is no email or WhatsApp recovery flow to configure.

## 4. Review before opening orders

1. Open the returned HTTPS address; verify the public catalog loads without a ChatGPT account.
2. Open `/seller`; sign in using the seller username and password.
3. Review **Produk & harga**. The initial catalog and prices are examples.
4. Review **Pengaturan toko**: Perum Megaregency, delivery Rp0, capacity, cutoff, and your future WhatsApp number. Leave WhatsApp blank until you buy it.
5. Enable ordering when your father is ready. Test an order from another device, verify it reaches the seller dashboard, test total approval, and cancel or complete that clearly labeled test order.
6. Check seller logout and confirm the seller page asks for login again.

The new database starts empty. The original ChatGPT demo and any orders/settings there stay separate; there is no automatic data migration.

## 5. Add a domain later

After buying a domain, connect it to Cloudflare and add it under the Worker's **Settings → Domains & Routes → Custom Domain**. Follow Cloudflare's instructions for your registrar and DNS. Update the saved customer/seller bookmarks. Browser-stored carts and receipt lists do not move between origins; keep individual receipt keys securely if moving an active store.

## Request protection and firewall

The application includes early Cloudflare rate-limit bindings, configured in [wrangler.json](./wrangler.json). They execute inside the Worker, before database queries, session lookup, and password hashing. They do not prevent Worker invocations or guarantee uninterrupted availability.

| Requests per client IP | Budget per minute |
| --- | ---: |
| All requests, including static files and unknown paths | 300 |
| All API requests | 120 |
| API writes | 30 |
| Checkout submissions | 5 |
| Seller login requests | 5 |

Limits stack. Excess requests receive HTTP 429 and `Retry-After: 60`; customers see an Indonesian retry message. Existing database-backed limits also restrict login to 10 attempts per 15-minute window and new checkout submissions to 40 per 10-minute window. Changing query strings, receipt keys, or forwarded headers does not create a new allowance. Login bodies are capped at 2,048 bytes and other parsed JSON at 20,000 bytes, including chunked uploads. Missing or failed rate-limit bindings return 503 rather than silently removing protection.

Cloudflare counters are approximate and local to each Cloudflare location, not a strict global quota. Shared Wi-Fi and mobile networks can share an IP allowance; review legitimate 429 responses and adjust budgets if needed. Namespace IDs 73100–73104 must be reserved for Hemart within your account; choose different IDs if already used. Local development uses an in-memory simulator, not production protection. See [Cloudflare rate-limit binding documentation](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

For the network/firewall layer when your account and custom domain are ready:

1. Connect the custom domain to the Worker through Cloudflare. Review the zone's DDoS protection and enable the managed WAF rules available on your plan.
2. Add a zone WAF rate-limiting rule matching your Hemart hostname and API paths. Start with 120 requests per IP per minute and a 60-second block where your plan supports those periods; otherwise use the supported equivalent. Rule availability and counting options depend on the plan. Use a block response for API traffic; an HTML browser challenge cannot be completed by a JSON fetch.
3. After verifying the custom domain, set `workers_dev` to `false` in [wrangler.json](./wrangler.json), keep `preview_urls` false, and redeploy. Verify the former workers.dev address is inaccessible so it cannot bypass the domain's WAF rules.
4. Verify a small, controlled burst against your own deployment returns 429, then recovers after the window. Verify catalog browsing, checkout, and seller login on two devices. Review Workers metrics and zone Security Events for abuse and false positives.

These account-level firewall settings have **not been activated** by the source changes. IP limits alone cannot stop a distributed attack from many addresses. Cloudflare DDoS/WAF filtering adds another layer; no firewall guarantees zero downtime or zero usage charges.

References: [WAF rate-limiting rules](https://developers.cloudflare.com/waf/rate-limiting-rules/), [DDoS protection](https://developers.cloudflare.com/ddos-protection/), [disable workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/).

## Updates and backups

Run `npm test` and `npm run deploy:check` before `npm run deploy`. Append new SQL migrations; never edit applied migrations. Do not deploy the `.local` database or `.dev.vars`.

Export a private backup before schema changes:

```
npm run cf -- d1 export DB --remote --output .local/hemart-backup.sql
```

The backup contains customer addresses and order data. Store it privately, outside public repositories. Cloudflare usage and plan limits are managed in your own account; review them before opening orders broadly.

Official references:
- https://developers.cloudflare.com/workers/wrangler/configuration/
- https://developers.cloudflare.com/d1/get-started/
- https://developers.cloudflare.com/workers/configuration/secrets/
