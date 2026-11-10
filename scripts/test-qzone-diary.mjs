// Offline contract and failure tests. No QQ, DSH or model network calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as d from '../src/qzone-diary.js';
import {createQzoneDiary} from '../src/qzone-diary-store.js';
import {createDiaryRuntime,writeDiaryWithDsh} from '../src/qzone-diary-runtime.js';

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'diary-test-'));
const stamp=s=>Date.parse('2026-11-09T'+s+'+08:00');
const settings={enabled:true,time:'22:05',jitterMinutes:0};
const text=d.diaryTemplate({date:'2026-11-09',replies:3,stickers:1,topics:['技术'],mood:'开心'});
const draft=JSON.stringify(text);
const image={id:'curated-dafeiyu-1',personaMode:'normal',url:'https://example.com/fish.png',emotion:'happy',content:'不应传入模型的昵称和私密备注'};
try{
 assert.equal(d.diaryClock(stamp('00:01')).day,'2026-11-09');
 assert.equal(d.diaryDue(stamp('22:04'),d.normalizeDiaryConfig(settings)).due,false);
 assert.equal(d.diaryDue(stamp('22:05'),d.normalizeDiaryConfig(settings)).due,true);
 assert.equal(d.normalizeDiaryConfig({time:'08:00'}).time,'22:05');
 assert.equal(d.normalizeDiaryConfig(settings).jitterMinutes,0);
 assert.equal(d.normalizeDiaryConfig({visibility:16}).visibility,4);
 assert.ok(text.body.includes('\n\n'));
 const facts=d.emptyDiaryFacts('2026-11-09');
 d.observeDiaryFacts(facts,{kind:'incoming',public:false,text:'秘密学习计划，手机号13812345678'});
 d.observeDiaryFacts(facts,{kind:'reply',public:true,text:'今天游戏聊得开心，哈哈'});
 assert.deepEqual(d.publicDiaryFacts(facts).topics,['游戏','趣事']);
 assert.ok(!JSON.stringify(facts).includes('13812345678'));
 for(const s of ['QQ号：123456','群号10001','邮箱a@example.com','https://example.com','@小王','余额一元','我刷了B站','主人失恋了','小王今天来了'])assert.ok(d.diaryPrivacyIssue(s,['小王']),s);
 assert.equal(d.diaryPrivacyIssue('今天聊到了游戏，觉得很开心。'), '');
 for(const body of [{},'好','群号10001'.repeat(10)])assert.throws(()=>d.formatDiary('2026-11-09',{body}));
 assert.ok(d.formatDiary('2026-11-09',text).startsWith('大肥鱼小日记\n日期：'));
 const images=d.diaryImages([image,{...image,id:'brat-dafeiyu-1',personaMode:'brat'},{...image,id:'unreviewed-photo'}],'normal','2026-11-09');assert.equal(images.length,1);
 const prompt=d.diaryPrompt({facts:d.publicDiaryFacts(facts),mode:'normal',images});assert.ok(!prompt.includes(image.content));

 let seq=0;
 function fixture(options={}){
  const file=options.file||path.join(temp,String(++seq),'state.json');let at=stamp('22:05'),sent=0,generated=0,listed=0,notices=0;
  const engine=createQzoneDiary({file,config:()=>settings,now:()=>at,generate:async()=>{generated++;return draft},publish:async()=>{sent++;return{postId:'tid-1'}},listPosts:async()=>{listed++;return[]},onError:async()=>{notices++},...options});
  return{engine,file,setTime:t=>at=t,counts:()=>({sent,generated,listed,notices})};
 }
 const once=fixture();once.setTime(stamp('21:00'));assert.equal((await once.engine.tick()).skipped,'before-time');assert.equal(once.counts().generated,0);
 once.setTime(stamp('22:05'));once.engine.observe({id:'same',at:stamp('20:00'),kind:'reply',public:true,text:'游戏哈哈'});once.engine.observe({id:'same',at:stamp('20:00'),kind:'reply',text:'游戏哈哈'});
 assert.equal(once.engine.status().facts.replies,1);
 await once.engine.tick();assert.equal(once.counts().sent,1);await once.engine.tick();assert.equal(once.counts().sent,1);
 const restarted=fixture({file:once.file});assert.equal((await restarted.engine.tick()).skipped,'already-published');assert.equal(restarted.counts().sent,0);
 assert.equal(once.engine.retry().code,'DIARY_ALREADY_PUBLISHED');

 const offline=fixture({ready:()=>false});assert.equal((await offline.engine.tick()).skipped,'qq-offline');assert.equal(offline.counts().generated,0);
 const fallback=fixture({generate:async()=>{throw Error('budget')}});await fallback.engine.tick();assert.equal(fallback.engine.status().method,'facts-template');
 const privacy=fixture({context:()=>({aliases:['小王']}),generate:async()=>JSON.stringify({body:'小王告诉我他今天失恋了。'.repeat(10)})});await privacy.engine.tick();assert.equal(privacy.engine.status().method,'facts-template');assert.ok(!privacy.engine.status().draft.includes('小王'));

 let publishedText='',attempts=0;
 const reconciled=fixture({publish:async data=>{attempts++;publishedText=data.text;throw Error('timeout')},listPosts:async()=>[{tid:'found',time:stamp('22:05')/1000,content:publishedText}]});
 assert.equal((await reconciled.engine.tick()).postId,'found');assert.equal(attempts,1);await reconciled.engine.tick();assert.equal(attempts,1);
 const uncertain=fixture({publish:async()=>{throw Error('timeout')}});const failed=await uncertain.engine.tick();assert.ok(failed.code&&failed.hint);assert.equal(uncertain.engine.status().status,'uncertain');await uncertain.engine.tick();assert.equal(uncertain.counts().notices,1);assert.equal(uncertain.engine.retry().code,'DIARY_CONFIRM_REQUIRED');
 const again=fixture({file:uncertain.file});await again.engine.tick();assert.equal(again.counts().sent,0);assert.equal(again.engine.retry({confirmedNotPublished:true}).ok,true);await again.engine.tick();assert.equal(again.counts().sent,1);
 const missing=fixture({publish:async()=>({})});assert.equal((await missing.engine.tick()).code,'DIARY_ACK_MISSING');

 let release,entered=false;
 const concurrent=fixture({generate:()=>new Promise(r=>{entered=true;release=()=>r(draft)})});const pending=concurrent.engine.tick();while(!entered)await new Promise(r=>setImmediate(r));
 assert.equal((await concurrent.engine.tick()).skipped,'busy');const second=fixture({file:concurrent.file});assert.equal((await second.engine.tick()).skipped,'locked');release();await pending;assert.equal((await second.engine.tick()).skipped,'already-published');
 const midnight=fixture({generate:async()=>{midnight.setTime(Date.parse('2026-11-10T00:01+08:00'));return draft}});assert.equal((await midnight.engine.tick()).skipped,'day-changed');assert.equal(midnight.counts().sent,0);
 const corrupt=fixture();corrupt.engine.observe({kind:'reply',id:'one'});const original=fs.readFileSync(corrupt.file,'utf8');fs.writeFileSync(corrupt.file,'{broken');
 assert.equal((await corrupt.engine.tick()).code,'DIARY_STATE_UNREADABLE');assert.equal(fs.readFileSync(corrupt.file,'utf8'),'{broken');assert.equal(corrupt.engine.retry().ok,false);assert.throws(()=>corrupt.engine.observe({kind:'reply'}));
 fs.writeFileSync(corrupt.file,original);assert.equal((await corrupt.engine.tick()).posted,true);

 const requests=[];
 // Runtime uses real time; invoke with a fixture Date only around its tick.
 const oldNow=Date.now;Date.now=()=>stamp('22:05');
 // The engine captures Date.now at construction; build a second adapter under the clock override.
 const adapter=createDiaryRuntime({stateDir:path.join(temp,'adapter'),config:()=>settings,bot:{request:async(name,params)=>{requests.push({name,params});return{status:'ok',retcode:0,data:{tid:'native-tid'}}}},fetchImage:async()=>({buffer:Buffer.from('png')}),mode:()=> 'normal',tone:()=>'',entries:()=>[image],aliases:()=>[],ready:()=>true,generateModel:async()=>{throw Error('budget')},notify:async()=>{},log:()=>{}});
 try{await adapter.tick()}finally{Date.now=oldNow}
 assert.equal(requests.length,1);assert.equal(requests[0].name,'send_qzone_msg');assert.equal(requests[0].params.ugc_right,4);assert.equal(requests[0].params.images.length,1);assert.ok(requests[0].params.images[0].startsWith('base64://'));
 Date.now=()=>stamp('22:05');
 try{
  let published;
  const noImage=createDiaryRuntime({stateDir:path.join(temp,'no-image'),config:()=>settings,bot:{request:async(name,params)=>{published=params;return{status:'ok',retcode:0,data:{tid:'text-only'}}}},fetchImage:async()=>{throw Error('image unavailable')},mode:()=> 'normal',tone:()=>'',entries:()=>[image],aliases:()=>[],ready:()=>true,generateModel:async()=>{throw Error('budget')},notify:async()=>{},log:()=>{}});
  assert.equal((await noImage.tick()).postId,'text-only');assert.equal(published.images,undefined);
  const native=[];
  const reconcile=createDiaryRuntime({stateDir:path.join(temp,'native-reconcile'),config:()=>settings,bot:{request:async(name,params)=>{native.push({name,params});return name==='get_qzone_msg_list'?{status:'ok',retcode:0,data:{msglist:[]}}:{status:'ok',retcode:0,data:{}}}},fetchImage:async()=>{throw Error('image unavailable')},mode:()=> 'normal',tone:()=>'',entries:()=>[],aliases:()=>[],ready:()=>true,generateModel:async()=>{throw Error('budget')},notify:async()=>{},log:()=>{}});
  assert.equal((await reconcile.tick()).code,'DIARY_ACK_MISSING');await reconcile.tick();assert.equal(native.filter(x=>x.name==='send_qzone_msg').length,1);assert.deepEqual(native.find(x=>x.name==='get_qzone_msg_list').params,{pos:0,num:30});
 }finally{Date.now=oldNow}

 const calls=[],learnerSessions=new Set(),diarySessions=new Set();
 const api={workspace:{create:async()=>{calls.push('workspace');return{result:{ok:true,value:{created:true,workspace:{workspaceId:'ws'}}}}},rename:async()=>{},archiveSession:async()=>calls.push('archive')},sessions:{create:async p=>{assert.equal(p.agentPreset,'qq-chat');return{result:{ok:true,value:{sessionId:'fresh'}}}},prompt:async p=>{assert.equal(p.content[0].text,'deidentified');assert.ok(diarySessions.has('fresh'));calls.push('prompt');return{result:{ok:true}}}},events:{follow:()=>calls.push('follow'),forget:()=>calls.push('forget')},stopSessionWork:async()=>calls.push('stop')};
 const writer={prompt:'deidentified',settings:{writerTimeoutMs:1000},api,stateDir:temp,preset:'qq-chat',ensureModel:async()=>{},waitTurn:()=>Promise.resolve(draft),learnerSessions,diarySessions,budgetAllowed:()=>true};
 await assert.rejects(writeDiaryWithDsh({...writer,budgetAllowed:()=>false}));assert.equal(calls.length,0);
 assert.equal(await writeDiaryWithDsh(writer),draft);assert.equal(learnerSessions.size,0);assert.equal(diarySessions.size,0);assert.deepEqual(calls,['workspace','follow','prompt','forget','archive']);
 await assert.rejects(writeDiaryWithDsh({...writer,ensureModel:async()=>{throw Error('disconnected')}}));assert.ok(calls.includes('stop'));assert.equal(diarySessions.size,0);
 console.log('PASS: diary clock, privacy, isolated images, once/day, persistence, offline/budget fallback, ambiguous receipts, concurrency, midnight and native Qzone/DSH lifecycle');
}finally{fs.rmSync(temp,{recursive:true,force:true})}
