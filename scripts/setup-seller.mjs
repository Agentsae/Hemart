import {createInterface,emitKeypressEvents} from 'node:readline';
import {stdin,stdout} from 'node:process';
import {writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {passwordHash} from '../worker/auth.js';
const production=process.argv.includes('--production');
if(!stdin.isTTY){console.error('Run this yourself in an interactive terminal. Do not pass passwords in command arguments.');process.exit(1);}
const rl=createInterface({input:stdin,output:stdout});
const username=await new Promise(resolve=>rl.question('Seller username (e.g. bapak): ',resolve));rl.close();
if(!/^[a-zA-Z0-9._-]{3,40}$/.test(username)){console.error('Use 3–40 letters, numbers, dots, underscores or hyphens.');process.exit(1);}
emitKeypressEvents(stdin);
function hidden(prompt){return new Promise(resolve=>{stdout.write(prompt);stdin.setRawMode(true);stdin.resume();let value='';function onKey(text,key={}){if(key.ctrl&&key.name==='c'){stdin.setRawMode(false);stdout.write('\n');process.exit(130);}if(key.name==='return'){stdin.off('keypress',onKey);stdin.setRawMode(false);stdin.pause();stdout.write('\n');resolve(value);return;}if(key.name==='backspace'){value=value.slice(0,-1);return;}if(!key.ctrl&&!key.meta&&text&&text>=' '&&value.length<256)value+=text;}stdin.on('keypress',onKey);});}
const password=await hidden('Password (at least 16 characters; input hidden): ');
if(password.length<16||password.length>256){console.error('Choose a long passphrase of 16–256 characters.');process.exit(1);}
const confirm=await hidden('Confirm password: ');if(password!==confirm){console.error('Passwords do not match.');process.exit(1);}
const values={SELLER_USERNAME:username,SELLER_PASSWORD_HASH:await passwordHash(password)};
if(production){
 const child=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','secret','bulk'],{stdio:['pipe','inherit','inherit'],env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
 child.stdin.end(JSON.stringify(values));child.on('error',e=>{console.error(e.message);process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;if(code===0)console.log('Seller credentials updated. Previous sessions will be invalidated.');});
}else{await writeFile('.dev.vars',Object.entries(values).map(([k,v])=>`${k}=${JSON.stringify(v)}`).join('\n')+'\n',{mode:0o600});console.log('Local seller configured. Restart npm run dev. Production credentials are configured separately.');}
