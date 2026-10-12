import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
const config = JSON.parse(await readFile('wrangler.json', 'utf8'));
if (config.d1_databases[0].database_id === '00000000-0000-0000-0000-000000000000') {
  console.error('Create your Cloudflare database first. See DEPLOYMENT.md.');
  process.exit(1);
}
function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      stdio: 'inherit',
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error('Deployment stopped: command exited ' + code)),
    );
  });
}
await run(['scripts/build.mjs']);
await run(['scripts/cloudflare.mjs', 'd1', 'migrations', 'apply', 'DB', '--remote']);
await run(['scripts/cloudflare.mjs', 'deploy']);
