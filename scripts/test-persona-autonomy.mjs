import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createPersonaModeStore} from '../src/persona-modes.js';
import {bridgeHarness} from './audit-bridge-harness.mjs';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'auto-persona-'));
try{
 const file=path.join(temp,'modes.json');let store=createPersonaModeStore(file);const t=Date.now();
 assert.equal(store.chooseAutomatic('group:456','brat',{at:t}).changed,true);
 assert.equal(store.current('private:123'),'normal');
 assert.equal(store.chooseAutomatic('group:456','normal',{at:t+1000}).reason,'auto-cooldown');
 store.set('group:456','brat',{at:t+2000});
 assert.equal(store.chooseAutomatic('group:456','normal',{at:t+1000000}).reason,'manual-hold');
 store=createPersonaModeStore(file);assert.equal(store.chooseAutomatic('group:456','normal',{at:t+2000000}).changed,true);
 store.set('private:123','normal',{global:true,at:t+2100000});assert.equal(store.chooseAutomatic('group:789','brat',{at:t+2101000}).reason,'manual-hold');
 const persona=path.join(temp,'persona.md');fs.writeFileSync(persona,'原人格');fs.mkdirSync(path.join(temp,'persona.modes/brat'),{recursive:true});fs.writeFileSync(path.join(temp,'persona.modes/brat/tone.md'),'高贵傲娇，杂鱼~');
 const h=await bridgeHarness({config:{allow:{private:['123'],groups:['456','789']},qzoneDiary:{enabled:true},socialV2:{personaModes:{enabled:true,autoSelect:true},autonomy:{enabled:true},tools:{choosePersona:true},proactive:{enabled:false}}},globals:{activePersonaFile:()=>persona,readPersonaLayerText:()=> '原语气'}});
 let server;
 try{
  h.setMode('reserved2');const key='group:456',st=h.getSocialV2State(key);st.memory='shared';st.unread=[{seq:1,text:'still here'}];h.state.sessions[key]='unchanged';
  const guard=h.captureSendGuard(key),oldToken=st.agentToken,cancelled=h.calls.cancelled.length;
  server=h.startConsoleServer();if(!server.listening)await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
  const request=async(url,{body,token=st.agentToken,agent=true}={})=>{const r=await fetch(base+url,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-console-token':'fixture-console-token',...(agent?{'x-agent-call':'1','x-agent-token':token}:{})},body:body?JSON.stringify(body):undefined});return{status:r.status,json:await r.json()}};
  let r=await request('/api/socialV2/persona-choice',{body:{key,mode:'brat'}});assert.equal(r.status,200,JSON.stringify(r.json));assert.equal(r.json.changed,true);assert.equal(r.json.token,st.agentToken);assert.notEqual(st.agentToken,oldToken);assert.throws(guard);
  assert.equal(h.state.sessions[key],'unchanged');assert.equal(st.memory,'shared');assert.equal(st.unread.length,1);assert.equal(h.calls.cancelled.length,cancelled);assert.equal(h.personaModeFor('private:123'),'normal');
  r=await request('/api/socialV2/persona-choice',{body:{key,mode:'normal'},token:oldToken});assert.equal(r.status,403);assert.ok(r.json.code&&r.json.hint);
  r=await request('/api/socialV2/persona-choice',{body:{key:'group:789',mode:'brat'}});assert.equal(r.status,403);
  r=await request('/api/socialV2/persona-choice',{body:{key,mode:'normal'}});assert.equal(r.json.reason,'auto-cooldown');
  r=await request('/api/qzone-diary/status');assert.equal(r.status,403);assert.ok(['CONSOLE_ONLY','DIARY_OPERATOR_ONLY'].includes(r.json.code));
  h.observeQzoneDiary({id:'private',kind:'incoming',text:'私人学习计划13812345678',public:false});h.observeQzoneDiary({id:'public',kind:'reply',text:'游戏好耶',public:true});
  r=await request('/api/qzone-diary/status',{agent:false});assert.equal(r.status,200);assert.equal(r.json.facts.incoming,1,JSON.stringify({status:r.json,files:fs.readdirSync(path.join(h.temp,'state')),cfg:h.cfg.qzoneDiary}));assert.ok(!JSON.stringify(r.json).includes('13812345678'));assert.ok(!r.json.facts.topics.includes('学习'));assert.ok(r.json.facts.topics.includes('游戏'));
  assert.match(h.roleHintForMode('v2',key,'tone'),/自主选人格/);
  console.log('PASS: automatic persona choice, manual precedence/cooldown, renewed session token, retained memory/session/unread, context isolation, diary status and private-data exclusion');
 }finally{if(server)await new Promise(r=>server.close(r));await h.close()}
}finally{fs.rmSync(temp,{recursive:true,force:true})}
