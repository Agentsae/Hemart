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
