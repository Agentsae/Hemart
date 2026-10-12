CREATE TABLE seller_sessions (token_hash TEXT PRIMARY KEY, credential_version TEXT NOT NULL, expires_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE INDEX seller_sessions_expiry ON seller_sessions(expires_at);
