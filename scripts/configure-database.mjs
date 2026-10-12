import {readFile,writeFile} from 'node:fs/promises';
const id=process.argv[2];
if(!id||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)||/^0{8}-/.test(id)){console.error('Usage: npm run database:configure -- <database_id returned by Cloudflare>');process.exit(1);}
const config=JSON.parse(await readFile('wrangler.json','utf8'));config.d1_databases[0].database_id=id;await writeFile('wrangler.json',JSON.stringify(config,null,2)+'\n');console.log('Cloudflare D1 binding configured.');
