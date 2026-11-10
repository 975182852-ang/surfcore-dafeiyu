#!/usr/bin/env node
// Local configuration and DSH registration. Never logs in to QQ or calls a model.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';

const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'..');
const fail=(code,message,hint)=>Object.assign(new Error(message),{code,hint});
const json=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
function atomic(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.deploy-'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});fs.renameSync(tmp,file)}
function backup(file){if(!fs.existsSync(file))return null;const dest=file+'.bak-'+Date.now();fs.copyFileSync(file,dest);return dest}
function copyMissing(source,dest){let copied=0;fs.mkdirSync(dest,{recursive:true});for(const entry of fs.readdirSync(source,{withFileTypes:true})){const a=path.join(source,entry.name),b=path.join(dest,entry.name);if(entry.isSymbolicLink())throw fail('TEMPLATE_SYMLINK','Template contains a symbolic link','Use a verified source archive.');if(entry.isDirectory())copied+=copyMissing(a,b);else if(!fs.existsSync(b)){fs.copyFileSync(a,b);copied++}}return copied}
const account=(s,label)=>{const v=String(s??'').trim();if(!/^[1-9]\d{4,11}$/.test(v))throw fail('INVALID_ACCOUNT',label+' must contain 5 to 12 digits.','Enter your own QQ account or authorized group number.');return Number(v)};

export async function deploy(options={}){
 const root=path.resolve(options.root||ROOT),home=path.resolve(options.dshHome||process.env.DSH_HOME||path.join(os.homedir(),'.dsh'));
 if(home===path.parse(home).root)throw fail('INVALID_DSH_HOME','DSH home cannot be a filesystem root.','Choose the DSH user-data directory.');
 const profile=String(options.profile||process.env.DSH_PROFILE||'').trim();
 if(profile&&!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(profile))throw fail('INVALID_PROFILE','Invalid DSH profile name.','Use a profile directory name, for example desktop or web.');
 const [major,minor]=process.versions.node.split('.').map(Number);if(major<22||(major===22&&minor<13))throw fail('NODE_TOO_OLD','Node.js 22.13+ is required.','Install a supported Node.js version and reopen the terminal.');
 const configFile=path.join(root,'config.json'),example=path.join(root,'config.example.json');
 const profileRoot=path.join(home,'profiles');const profiles=fs.existsSync(profileRoot)?fs.readdirSync(profileRoot).filter(n=>fs.existsSync(path.join(profileRoot,n,'package.json'))):[];
 if(options.check)return{ok:true,checkOnly:true,node:process.versions.node,root,dshHome:home,profiles,dependenciesInstalled:fs.existsSync(path.join(root,'node_modules/js-yaml')),localConfig:fs.existsSync(configFile),next:profiles.length?'Run the installer to configure and register the project.':'Open DSH once to initialize a profile, then install.'};
 if(!options.skipRegister&&!profiles.length)throw fail('DSH_PROFILE_MISSING','No initialized DSH profile was found.','Install and open DeepSeek Harness once, then retry.');
 let cfg;try{cfg=fs.existsSync(configFile)?json(configFile):json(example)}catch{throw fail('CONFIG_INVALID','Existing configuration is not valid JSON; it was not overwritten.','Back up and repair config.json, then retry.');}
 const owner=account(options.ownerQQ??cfg.ownerQQ,'Owner QQ');
 const groups=options.groups===undefined?(cfg.allow?.groups||[]):String(options.groups).split(/[,;，\s]+/).filter(Boolean).map(v=>account(v,'Group'));
 const budget=Number(options.dailyBudget??3);if(!Number.isFinite(budget)||budget<=0||budget>10000)throw fail('INVALID_BUDGET','Daily budget must be positive and at most 10000 CNY.','Use --daily-budget 3, or choose an explicit amount.');
 const currentFile=path.join(home,'surfcore/characters/current.json');
 if(fs.existsSync(currentFile)){try{const current=json(currentFile);if(!current.id||!Number.isFinite(Number(current.epoch)))throw Error()}catch{throw fail('CURRENT_CHARACTER_INVALID','Existing character selection is invalid; it was kept.','Back up and repair characters/current.json before installing a template.');}}
 process.env.DSH_HOME=home;
 const store=await import(pathToFileURL(path.join(root,'src/character-persona.js')).href);
 const budgetModule=await import(pathToFileURL(path.join(root,'src/token-budget.js')).href);
 const current=store.readCurrentCharacter(),id='char-dafeiyu-public',paths=store.characterPaths(id);
 if(fs.existsSync(paths.manifest)){try{if(json(paths.manifest).id!==id)throw Error()}catch{throw fail('CHARACTER_INVALID','Existing public character manifest is invalid; it was kept.','Repair the existing manifest or choose another character in DSH.');}}
 const configBackup=backup(configFile);
 cfg.ownerQQ=owner;cfg.allow??={};cfg.allow.private=[...new Set([...(cfg.allow.private||[]),owner])];cfg.allow.groups=[...new Set(groups)];
 cfg.agentPreset='qq-chat-v2';cfg.socialV2??={};cfg.socialV2.personaModes={...(cfg.socialV2.personaModes||{}),enabled:true};
 cfg.socialV2.progressiveGroupId=groups.length?String(options.progressiveGroup||groups[0]):null;
 if(cfg.socialV2.progressiveGroupId&&!groups.includes(account(cfg.socialV2.progressiveGroupId,'Progressive group')))throw fail('GROUP_NOT_ALLOWED','Progressive group is not on the allowlist.','Include it in --groups.');
 if(options.enableDiary)cfg.qzoneDiary={...(cfg.qzoneDiary||{}),enabled:true};
 atomic(configFile,cfg);
 const template=path.join(root,'examples/dafeiyu');let created=false;
 if(!fs.existsSync(paths.manifest)){store.createCharacter({name:'大肥鱼',id,personaText:fs.readFileSync(path.join(template,'persona.md'),'utf8'),source:'public-template'});created=true}
 const copied=copyMissing(template,paths.dir);
 // Existing characters and memory are never switched or overwritten on upgrade.
 if(!current)store.switchCharacter(id);
 const state=path.join(home,'surfcore');let budgetCreated=false;
 if(!fs.existsSync(budgetModule.budgetFileOf(state))){budgetModule.writeBudget(state,{qq:{cny:budget,tokens:null},bili:{cny:1,tokens:null},other:{cny:1,tokens:null},total:{cny:budget,tokens:null}});budgetCreated=true}
 const modeFile=path.join(root,'state/mode.json');if(!fs.existsSync(modeFile))atomic(modeFile,{mode:'reserved2',closedAgentPreset:''});
 let registered=false;
 if(!options.skipRegister){const args=[path.join(root,'scripts/setup-dsh.mjs'),...(profile?[profile]:[])];const r=spawnSync(process.execPath,args,{cwd:root,env:{...process.env,DSH_HOME:home},stdio:options.quiet?'pipe':'inherit',encoding:'utf8',timeout:300000,windowsHide:true});if(r.status!==0||r.error)throw fail('DSH_REGISTER_FAILED','Project files were initialized but DSH registration failed.','Keep the generated backups and run node scripts/setup-dsh.mjs with the intended profile.');registered=true}
 return{ok:true,root,dshHome:home,registered,characterCreated:created,characterActive:!current||current.id===id,templateFilesAdded:copied,existingFilesPreserved:true,budgetCreated,initialDailyBudget:budgetCreated?budget:null,configBackup,next:'Restart DSH, configure its model and SurfCore QQ gateway, then test one message. No real model or QQ call was made by this installer.'};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let machine=false;
 try{const {values}=parseArgs({options:{check:{type:'boolean'},json:{type:'boolean'},'owner-qq':{type:'string'},groups:{type:'string'},profile:{type:'string'},'dsh-home':{type:'string'},'daily-budget':{type:'string'},'progressive-group':{type:'string'},'skip-register':{type:'boolean'},'enable-diary':{type:'boolean'}}});machine=!!values.json;const result=await deploy({check:values.check,ownerQQ:values['owner-qq'],groups:values.groups,profile:values.profile,dshHome:values['dsh-home'],dailyBudget:values['daily-budget'],progressiveGroup:values['progressive-group'],skipRegister:values['skip-register'],enableDiary:values['enable-diary'],quiet:machine});console.log(machine?JSON.stringify(result):JSON.stringify(result,null,2));}
 catch(error){const result={ok:false,code:error.code||'DEPLOY_FAILED',error:String(error.message||'Deployment failed').slice(0,300),hint:error.hint||'Keep backups, inspect the failing step, and retry. Do not replace existing data with empty files.'};console.error(JSON.stringify(result));process.exitCode=1}
}
