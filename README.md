# Hemart

Mobile-first Indonesian neighborhood grocery PWA. Run `npm run dev`, then open http://localhost:3000. Run `npm test` for preorder cutoff, totals, and preparation-list checks. No dependencies or build step required; deploy `dist/` over HTTPS.

Includes product search/categories, persistent cart, guest demo checkout, substitution preferences, order history/reorder, seller order statuses, preparation lists grouped by delivery date, install manifest and offline shell. The cutoff is 21:00 Asia/Jakarta. Before cutoff delivery is next day; at or after cutoff it is the day after next. Delivery begins at 06:00 along the seller's route.

## Current limits

This is an interactive prototype, not a live ordering service. Orders and customer details are stored only in this browser's localStorage. The seller demo is intentionally accessible and does not receive orders from other devices. Prices, products and photos are illustrative. Product photos are served by Unsplash, fonts by Google Fonts; they require connectivity and are not part of the offline shell.

Before real customer use: connect a shared database and server-validated order endpoints; add authenticated seller access; configure the service area, delivery fees/capacity and seller contact; implement actual-weight and substitution confirmation; add privacy/data-retention controls and real notification delivery. Payment is currently described as cash on delivery, with no online payment processing.

PWA installation requires HTTPS (or localhost) and a supported browser. iOS users can use Safari's Add to Home Screen. Offline browsing and demo orders are device-local, never silently sent to a seller.
