import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
export function createDB(filename = ':memory:') {
  const sqlite = new DatabaseSync(filename);
  sqlite.exec('PRAGMA journal_mode=WAL;');
  sqlite.exec('CREATE TABLE IF NOT EXISTS local_migrations(name TEXT PRIMARY KEY)');
  for (const filename of readdirSync(new URL('../drizzle/', import.meta.url))
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    const name = filename.replace(/\.sql$/, '');
    if (sqlite.prepare('SELECT name FROM local_migrations WHERE name=?').get(name)) continue;
    sqlite.exec('BEGIN');
    try {
      sqlite.exec(readFileSync(new URL('../drizzle/' + filename, import.meta.url), 'utf8'));
      sqlite.prepare('INSERT INTO local_migrations(name) VALUES(?)').run(name);
      sqlite.exec('COMMIT');
    } catch (e) {
      sqlite.exec('ROLLBACK');
      throw e;
    }
  }
  return {
    sqlite,
    prepare(sql) {
      let values = [];
      const stmt = sqlite.prepare(sql);
      const result = {
        bind(...v) {
          values = v;
          return result;
        },
        async first() {
          return stmt.get(...values) || null;
        },
        async all() {
          return { results: stmt.all(...values) };
        },
        async run() {
          const r = stmt.run(...values);
          return { meta: { changes: Number(r.changes) } };
        },
      };
      return result;
    },
  };
}
