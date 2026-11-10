import assert from 'node:assert/strict';
import {waitForClose}from '../src/deferred-close.js';
import {bridgeHarness}from './audit-bridge-harness.mjs';
let at=0,state={lastUnreadSeq:1};const base={state,baseline:1,deadline:500,now:()=>at,pause:async ms=>{at+=ms}};
assert.equal(await waitForClose(base),'quiet');at=0;assert.equal(await waitForClose({...base,pause:async()=>{state.lastUnreadSeq=2}}),'arrived');
assert.equal(await waitForClose({...base,aborted:()=>true}),'aborted');assert.equal(await waitForClose({...base,valid:()=>false}),'invalid');
 const h=await bridgeHarness({config:{socialV2:{closure:{enabled:true,minIdleBeforeCloseMs:40},economy:{deferredClose:true},proactive:{enabled:false}}}});
let server;
try{
 h.setMode('reserved2');const key='private:123',st=h.getSocialV2State(key);
 const seed=()=>{st.closure=null;st.modelSeenSeqs=new Set();st.unread=[];st.lastUnreadSeq=1;st.lastIncomingAt=Date.now();st.lastAiReplyAt=Date.now();st.recentMessages=[{isSelf:false,plain:'今天天气真不错',text:'今天天气真不错',time:Date.now()},{isSelf:true,text:'嗯嗯',plain:'嗯嗯',time:Date.now()}]};
 seed();let result=await h.deferredCloseV2(key,{summary:'天气'});assert.equal(result.closed,true);assert.equal(st.closure.summary,'天气');assert.equal(h.calls.sent.length,0);
 seed();const pending=h.deferredCloseV2(key,{});setTimeout(()=>{st.lastUnreadSeq=2;st.unread.push({seq:2,isSelf:false,text:'等等，还有个事',plain:'等等，还有个事',time:Date.now()})},5);result=await pending;assert.equal(result.closed,false);assert.equal(result.arrived,true);assert.equal(result.newMessages.length,1);assert.equal(st.unread.length,1,'new messages must not be auto-acknowledged');
 seed();await assert.rejects(h.deferredCloseV2(key,{}, {valid:()=>false}),e=>e.code==='CLOSE_PERMISSION_CHANGED');
 seed();h.cfg.socialV2.closure.minIdleBeforeCloseMs=150;
 server=h.startConsoleServer();if(!server.listening)await new Promise(r=>server.once('listening',r));
 const res=await fetch('http://127.0.0.1:'+server.address().port+'/api/socialV2/close',{method:'POST',headers:{'content-type':'application/json','x-console-token':'fixture-console-token','x-agent-call':'1','x-agent-token':st.agentToken},body:JSON.stringify({key,summary:'后台等待'})});
 const data=await res.json();assert.equal(res.status,200);assert.equal(data.scheduled,true,JSON.stringify(data));assert.equal(data.closed,false);
 st.lastUnreadSeq=3;st.unread.push({seq:3,isSelf:false,text:'新消息',plain:'新消息',time:Date.now()});await new Promise(r=>setTimeout(r,200));
 assert.ok(!st.modelSeenSeqs?.has(3),'a background waiter cannot mark messages as shown to the model');assert.equal(st.unread.length,1);
 console.log('PASS: deferred close waits once, closes only on quiet, returns new messages without losing unread, validates permissions, preserves wake/reply behavior and sends no messages');
}finally{if(server)await new Promise(r=>server.close(r));await h.close()}
