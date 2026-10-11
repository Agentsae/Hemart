CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE products (id TEXT PRIMARY KEY, data TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE orders (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, request_hash TEXT NOT NULL, delivery TEXT NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1);
--> statement-breakpoint
CREATE INDEX orders_delivery_status ON orders(delivery,status);
--> statement-breakpoint
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, hits INTEGER NOT NULL, expires_at INTEGER NOT NULL);
