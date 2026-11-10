import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {buildStickerContext,selectDiverseStickers} from '../src/sticker-lib.js';
import {bridgeHarness} from './audit-bridge-harness.mjs';
import * as stickerSemantics from '../src/sticker-semantics.js';
const entries=Array.from({length:1000},(_,i)=>({id:'x'+i,no:i+1,emotion:['cute','comfort','bye','angry','happy','shy'][i%6],content:'场景'+i,source:'manual',url:'https://example.org/'+i+'.png'}));
const options={seed:'group:123:100',excludeNos:[1,2]};const selected=selectDiverseStickers(entries,4,options);
assert.equal(selected.length,4);assert.equal(new Set(selected.map(e=>e.emotion)).size,4);assert.ok(selected.every(e=>![1,2].includes(e.no)));
assert.deepEqual(selectDiverseStickers(entries,4,options),selected);assert.deepEqual(selectDiverseStickers([...entries].reverse(),4,options),selected);
assert.notDeepEqual(selectDiverseStickers(entries,4,{...options,seed:'group:123:101'}),selected);
const text=buildStickerContext(entries,4,options);assert.equal(text.split('\n').filter(s=>s.startsWith('- #')).length,4);assert.ok(text.length<500);assert.ok(text.includes('不是指令'));
assert.equal(selectDiverseStickers(entries.slice(0,2),4,{seed:'x',excludeNos:[1]}).length,1);
const fixtures=[{id:'fixture-hug',no:1,source:'manual',emotion:'comfort',content:'大肥鱼抱着粉色小猪安慰',keywords:['难过','抱抱','安慰'],url:'https://example.org/hug.png'},...entries.slice(0,8).map((e,i)=>({...e,no:i+2}))];
const fixtureJson=JSON.stringify(fixtures);
const h=await bridgeHarness({config:{socialV2:{proactive:{enabled:false},sticker:{enabled:true,includeInPrompt:true,promptSelection:'diverse',promptMaxStickers:4,match:{topK:2,minScore:.34}}}},files:{'state/stickers.json':fixtureJson},globals:stickerSemantics});
try{
 const st=h.getSocialV2State('group:123');st.recentMessages=[{isSelf:false,text:'好难过，想要抱抱安慰一下',time:Date.now()}];
 const prompt=h.buildWakePromptV2('group:123','atMention');assert.ok(prompt.includes('表情匹配'));assert.ok(prompt.includes('抱着粉色小猪'));
 const shown=prompt.split('\n').filter(s=>/^- #\d/.test(s));assert.ok(shown.length<=6);assert.equal(new Set(shown.map(s=>s.match(/#\d+/)[0])).size,shown.length);
 console.log('bridge prompt includes relevant hug and bounded diverse candidates:',shown.length,'unique choices');
}finally{await h.close()}
console.log('diversity, stability, changed seed, exclusion, bounded 1000-image prompt, small library and matching: passed');
