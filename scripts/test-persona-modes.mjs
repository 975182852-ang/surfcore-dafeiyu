import assert from'node:assert/strict';import fs from'node:fs';import os from'node:os';import path from'node:path';
import{parsePersonaCommand,createPersonaModeStore,formatPersonaSpeech}from'../src/persona-modes.js';import{normalizeStickerEntry,mergeStickerLibrary}from'../src/sticker-lib.js';import{bridgeHarness}from'./audit-bridge-harness.mjs';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'persona-test-'));const persona=path.join(temp,'persona.md');fs.writeFileSync(persona,'original core');const layers=path.join(temp,'persona.modes/brat');fs.mkdirSync(layers,{recursive:true});for(const [file,text]of Object.entries({'tone.md':'第二人格：高贵傲娇，杂鱼~❤','core.md':'成年鲸鱼女仆','qq-group.md':'熟人群接梗','qq-private.md':'主人私聊'}))fs.writeFileSync(path.join(layers,file),text);
try{
 for(const s of ['切换雌小鬼人格','切换到小鬼模式','开启傲娇人格','全局切换雌小鬼人格','/persona brat all'])assert.equal(parsePersonaCommand(s)?.mode,'brat',s);
 for(const text of ['换个傲娇的来','你自己切成小鬼那面吧','能不能用雌小鬼人格陪我聊呀'])assert.equal(parsePersonaCommand(text)?.mode,'brat',text);assert.equal(parsePersonaCommand('你自己换一下人格吧')?.mode,'toggle');for(const text of ['不要换成小鬼人格','他说切换小鬼是什么意思','下次换个傲娇的来','来个傲娇表情'])assert.equal(parsePersonaCommand(text),null,text);assert.equal(parsePersonaCommand('恢复普通人格')?.mode,'normal');assert.equal(parsePersonaCommand('当前人格')?.query,true);assert.equal(parsePersonaCommand('他说“切换雌小鬼人格”是什么意思'),null);
 assert.equal(formatPersonaSpeech('杂鱼❤ 杂鱼～！杂鱼~','brat'),'杂鱼~❤ 杂鱼~！杂鱼~');assert.equal(formatPersonaSpeech('原本语气','normal'),'原本语气');assert.equal(formatPersonaSpeech('https://example.com/杂鱼 `杂鱼` 杂鱼','brat'),'https://example.com/杂鱼 `杂鱼` 杂鱼~');
 const storeFile=path.join(temp,'modes.json');let store=createPersonaModeStore(storeFile);store.set('group:456','brat');assert.equal(store.current('private:123'),'normal');const rev=store.revision('group:456');store=createPersonaModeStore(storeFile);assert.equal(store.current('group:456'),'brat');assert.equal(store.revision('group:456'),rev);store.set('private:123','normal',{global:true});assert.equal(store.current('group:456'),'normal');
 const entry=normalizeStickerEntry({id:'x',personaMode:'brat',source:'qq'});assert.equal(mergeStickerLibrary([entry],[{emoji_id:'x'}])[0].personaMode,'brat');
 const stickers=[{id:'normal-image',no:1,source:'manual',url:'https://example.com/normal.png',emotion:'happy',content:'普通开心',personaMode:'normal'},{id:'brat-image',no:2,source:'manual',url:'https://example.com/brat.png',emotion:'smug',content:'杂鱼~，得意拿捏',keywords:['杂鱼','拿捏'],personaMode:'brat'}];
 let releaseImage;
 const h=await bridgeHarness({config:{allow:{private:['123'],groups:['456','789']},socialV2:{personaModes:{enabled:true},proactive:{enabled:false},sticker:{enabled:true,includeInPrompt:true,promptMaxStickers:4,promptSelection:'diverse'}}},files:{'state/stickers.json':JSON.stringify(stickers)},globals:{safeFetchBuffer:async()=>new Promise(resolve=>{releaseImage=()=>resolve({buffer:Buffer.from('fake-image')})}),activePersonaFile:()=>persona,readPersonaLayerText:(kind)=>kind==='tone'?'原本软萌语气':kind==='scene'?'原本场景':''}});
 let server;
 try{
 h.setMode('reserved2');h.bot.request=async()=>({status:'ok',retcode:0,data:[]});const key='group:456',st=h.getSocialV2State(key);st.unread=[{seq:1,text:'真实经历'}];st.memory='shared-memory';h.state.sessions[key]='session-kept';
 const oldToken=st.agentToken;const guard=h.captureSendGuard(key);const oldHint=h.roleHintForMode('v2',key,'tone');assert.ok(oldHint.includes('原本软萌语气'));assert.ok(!oldHint.includes('杂鱼~'));
 await h.handlePersonaModeCommand(key,'999','切换雌小鬼人格');assert.equal(h.personaModeFor(key),'normal');
 await h.handlePersonaModeCommand(key,'123','切换雌小鬼人格');assert.equal(h.personaModeFor(key),'brat');assert.equal(h.personaModeFor('private:123'),'normal');assert.throws(guard);assert.notEqual(st.agentToken,oldToken);assert.equal(h.state.sessions[key],'session-kept');assert.equal(st.memory,'shared-memory');assert.equal(st.unread[0].text,'真实经历');assert.ok(h.roleHintForMode('v2',key,'tone').includes('杂鱼~'));
 assert.deepEqual(Array.from(h.personaEntries(key),x=>x.id),['brat-image']);assert.throws(()=>h.requirePersonaSticker(key,stickers[0]));
 await assert.rejects(h.sendStickerV2(key,'#01'),/当前人格不能/);
 const inFlight=h.sendStickerV2(key,'#02');while(!releaseImage)await new Promise(r=>setImmediate(r));await h.switchPersonaMode(key,'normal');releaseImage();await assert.rejects(inFlight,/发送已取消/);await h.switchPersonaMode(key,'brat');
 server=h.startConsoleServer();if(!server.listening)await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const request=async(url,{agent=true,body}={})=>{const r=await fetch(base+url,{method:body?'POST':'GET',headers:{'x-console-token':'fixture-console-token',...(agent?{'x-agent-call':'1','x-agent-token':st.agentToken}:{}),'content-type':'application/json'},body:body?JSON.stringify(body):undefined});return{status:r.status,json:await r.json()}};
 let r=await request('/api/socialV2/sticker-list?key='+key);assert.equal(r.status,200);assert.equal(r.json.total,1);assert.equal(r.json.stickers[0].id,'brat-image');
 r=await request('/api/socialV2/sticker-image?key='+key+'&stickerId=%2301');assert.notEqual(r.status,200);assert.match(r.json.error,/当前人格不能/);
 r=await request('/api/socialV2/sticker-note',{body:{key,stickerId:'#01',note:'wrong persona'}});assert.notEqual(r.status,200);
 r=await request('/api/persona-modes',{body:{key,mode:'normal'}});assert.equal(r.status,403);assert.equal(h.personaModeFor(key),'brat');
 r=await request('/api/persona-modes',{agent:false});assert.equal(r.status,200);assert.equal(r.json.conversations[key].mode,'brat');
 await h.switchPersonaMode(key,'normal');assert.equal(h.personaModeFor(key),'normal');assert.ok(!h.roleHintForMode('v2',key,'tone').includes('杂鱼~'));assert.equal(st.memory,'shared-memory');assert.equal(h.state.sessions[key],'session-kept');
 await h.switchPersonaMode(key,'brat',{global:true});assert.equal(h.personaModeFor('private:123'),'brat');assert.equal(h.personaModeFor('group:789'),'brat');await h.switchPersonaMode(key,'normal',{global:true});
 await h.handleIncoming('group','456',{post_type:'message',message_type:'group',self_id:555,user_id:123,group_id:456,message_id:111,sender:{nickname:'owner'},message:[{type:'at',data:{qq:'555'}},{type:'text',data:{text:'切换雌小鬼人格'}}]},h.cfg);assert.equal(h.personaModeFor(key),'brat');await h.switchPersonaMode(key,'normal');
 console.log('PASS: natural commands, manager auth, local/global persistence, normal persona preservation, shared session/memory/unread, stale token and send cancellation, sticker list/image/send separation, operator-only controls');
 }finally{if(server)await new Promise(r=>server.close(r));await h.close()}
}finally{fs.rmSync(temp,{recursive:true,force:true})}
