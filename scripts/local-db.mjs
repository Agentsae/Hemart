import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
export function createDB(filename=':memory:'){
 const sqlite=new DatabaseSync(filename);
 sqlite.exec('PRAGMA journal_mode=WAL;');
 sqlite.exec('CREATE TABLE IF NOT EXISTS local_migrations(name TEXT PRIMARY KEY)');
 if(!sqlite.prepare('SELECT name FROM local_migrations WHERE name=?').get('0000_orders')){sqlite.exec(readFileSync(new URL('../drizzle/0000_orders.sql',import.meta.url),'utf8'));sqlite.prepare('INSERT INTO local_migrations(name) VALUES(?)').run('0000_orders');}
 return {sqlite,prepare(sql){let values=[];const stmt=sqlite.prepare(sql);const result={bind(...v){values=v;return result;},async first(){return stmt.get(...values)||null;},async all(){return {results:stmt.all(...values)};},async run(){const r=stmt.run(...values);return {meta:{changes:Number(r.changes)}};}};return result;}};
}
