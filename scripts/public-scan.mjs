#!/usr/bin/env node
// Scan publishable Git files. Reports filenames and rule names, never values.
import fs from'node:fs';import path from'node:path';import{spawnSync}from'node:child_process';import{fileURLToPath}from'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const listed=spawnSync('git',['-C',root,'ls-files','-z'],{encoding:'utf8',windowsHide:true});
if(listed.status!==0){console.error('Initialize and stage the reviewed files before running the public scan.');process.exit(2)}
const files=listed.stdout.split('\0').filter(Boolean),findings=[];
const denied=/^(?:state|node_modules|audio|backups|_backups|\.dsh)\/|(?:^|\/)(?:config\.json|\.env(?:\..*)?|credentials\.json|cookies?\.json|id_rsa|id_ed25519)$|\.(?:log|pem|key|bak)$/i;
const rules=[['github-token',/gh(?:p|o|u|s|r)_[A-Za-z0-9]{20,}/g],['api-key',/\bsk-[A-Za-z0-9_-]{20,}/g],['private-key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],['credential-url',/https?:\/\/[^\s/:]+:[^\s/@]+@/g]];
const synthetic=new Set(['sk-'+'1234567890abcdef'.repeat(2),'ghp_'+'abcdefghijklmnopqrstuvwxyz0123456789','sk-proj-'+'abcdefghijklmnopqrstuvwxyz','sk-from-'+'dsh-credentials']);
function exampleOnly(file,value,fixture){
 if(fixture&&(synthetic.has(value)||/test|fake|dummy|example|fixture/i.test(value)))return true;
 return ['https://','http://'].some(s=>s+'user:pass@'===value)&&(fixture||file==='docs/guides/PRIVACY.md'||file==='scripts/privacy-scan.mjs');
}
for(const rel of files){if(denied.test(rel)){findings.push({file:rel,rule:'runtime-or-secret-file'});continue}const file=path.join(root,rel);if(!fs.existsSync(file))continue;const b=fs.readFileSync(file);if(b.includes(0))continue;const text=b.toString('utf8'),fixture=/(?:^|\/)(?:test-|fixtures\/)/.test(rel);for(const[name,re]of rules){re.lastIndex=0;let match;while((match=re.exec(text))){if(exampleOnly(rel,match[0],fixture))continue;findings.push({file:rel,line:text.slice(0,match.index).split('\n').length,rule:name})}}}
const report={ok:findings.length===0,files:files.length,findings};console.log(JSON.stringify(report,null,2));if(findings.length)process.exitCode=1;
