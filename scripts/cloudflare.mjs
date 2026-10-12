import {spawn} from 'node:child_process';
const args=process.argv.slice(2);
const child=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js',...args],{stdio:'inherit',env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
child.on('error',e=>{console.error(e.message);process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});
