import assert from'node:assert/strict';import fs from'node:fs';import os from'node:os';import path from'node:path';import{fileURLToPath,pathToFileURL}from'node:url';import{deploy}from'./deploy.mjs';
import{isTargetGroup}from'../src/group-progressive.js';
const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'dafeiyu-deploy-')),root=path.join(tmp,'source'),home=path.join(tmp,'dsh');
const prior=process.env.DSH_HOME;
try{
 fs.mkdirSync(root,{recursive:true});fs.mkdirSync(path.join(root,'src'));fs.copyFileSync(path.join(source,'config.example.json'),path.join(root,'config.example.json'));fs.writeFileSync(path.join(root,'package.json'),'{"type":"module"}');
 for(const name of['character-persona.js','token-budget.js'])fs.copyFileSync(path.join(source,'src',name),path.join(root,'src',name));
 fs.cpSync(path.join(source,'examples/dafeiyu'),path.join(root,'examples/dafeiyu'),{recursive:true});
 const checked=await deploy({root,dshHome:home,check:true});assert.equal(checked.checkOnly,true);assert.equal(fs.existsSync(home),false);assert.equal(fs.existsSync(path.join(root,'config.json')),false);
 await assert.rejects(()=>deploy({root,dshHome:home,ownerQQ:'bad',skipRegister:true}),e=>e.code==='INVALID_ACCOUNT');assert.equal(fs.existsSync(home),false);
 await assert.rejects(()=>deploy({root,dshHome:home,ownerQQ:'20001'}),e=>e.code==='DSH_PROFILE_MISSING');
 const installed=await deploy({root,dshHome:home,ownerQQ:'20001',groups:'10001,10002',skipRegister:true});assert.equal(installed.ok,true);assert.equal(installed.registered,false);assert.equal(installed.characterCreated,true);assert.equal(installed.budgetCreated,true);
 const cfg=JSON.parse(fs.readFileSync(path.join(root,'config.json')));assert.equal(cfg.ownerQQ,20001);assert.deepEqual(cfg.allow.groups,[10001,10002]);assert.equal(cfg.socialV2.progressiveGroupId,'10001');
 const character=path.join(home,'surfcore/characters/char-dafeiyu-public'),tone=path.join(character,'persona.tone.md'),memory=path.join(character,'memory/memory-card.json'),budget=path.join(home,'surfcore/token-budget.json');
 fs.writeFileSync(tone,'custom-persona-kept');fs.writeFileSync(memory,'{"version":1,"records":[{"id":"fixture-note","text":"keep-memory"}]}');
 const b=JSON.parse(fs.readFileSync(budget));b.limits.qq.cny=9;b.limits.total.cny=9;fs.writeFileSync(budget,JSON.stringify(b));
 const beforeBudget=fs.readFileSync(budget,'utf8'),beforeMemory=fs.readFileSync(memory,'utf8');const repeated=await deploy({root,dshHome:home,skipRegister:true});assert.equal(repeated.characterCreated,false);assert.equal(repeated.budgetCreated,false);assert.equal(fs.readFileSync(tone,'utf8'),'custom-persona-kept');assert.equal(fs.readFileSync(memory,'utf8'),beforeMemory);assert.equal(fs.readFileSync(budget,'utf8'),beforeBudget);
 const store=await import(pathToFileURL(path.join(root,'src/character-persona.js')).href);store.createCharacter({name:'Other fixture',id:'other-fixture'});store.switchCharacter('other-fixture');await deploy({root,dshHome:home,skipRegister:true});assert.equal(store.readCurrentCharacter().id,'other-fixture');
 assert.equal(isTargetGroup('group:10001','10001'),true);assert.equal(isTargetGroup('group:10002','10001'),false);assert.equal(isTargetGroup('group:10001'),false);assert.equal(isTargetGroup('group:10001','../10001'),false);
 console.log('PASS deployment: read-only check, validation, fresh install, shared character modes, allowlist, configurable target, idempotence, existing persona/memory/budget and current-character preservation');
}finally{if(prior===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=prior;fs.rmSync(tmp,{recursive:true,force:true})}
