// Local management helper. Preview performs no model call and never publishes.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {diaryClock,emptyDiaryFacts,publicDiaryFacts,diaryTemplate,formatDiary} from '../src/qzone-diary.js';
import {callBridge} from '../plugins/surfcore/lib/bridge.js';
const root=fileURLToPath(new URL('..',import.meta.url));
const [command,...args]=process.argv.slice(2);
if(command==='preview'){
 const day=diaryClock().day;let facts=emptyDiaryFacts(day);
 const f=path.join(root,'state/qzone-diary/state.json');
 if(fs.existsSync(f))facts=JSON.parse(fs.readFileSync(f,'utf8').replace(/^\uFEFF/,'')).days?.[day]?.facts||facts;
 console.log('【离线事实模板预览；不会发表，正式日记优先由模型重新写稿】\n'+formatDiary(day,diaryTemplate(publicDiaryFacts(facts),args[0]==='brat'?'brat':'normal')));
}else if(command==='status'||command==='retry'){
 if(command==='retry'&&!args.includes('--confirmed-not-published')){
  console.error('先在自己的QQ空间确认今天未发表，再运行 retry --confirmed-not-published。');process.exitCode=1;
 }else{
  const r=command==='status'?await callBridge('/api/qzone-diary/status'):await callBridge('/api/qzone-diary/retry',{method:'POST',body:{confirmedNotPublished:true},timeoutMs:180000});
  if(!r.ok||r.data?.ok===false){console.error(JSON.stringify({code:r.data?.code||'BRIDGE_UNAVAILABLE',error:r.data?.error||r.error||'桥接未连接',hint:r.data?.hint||'启动服务后再查看；离线可用 preview。'},null,2));process.exitCode=1;}
  else console.log(JSON.stringify(r.data,null,2));
 }
}else{console.log('Usage: node scripts/qzone-diary.mjs preview [normal|brat] | status | retry --confirmed-not-published');process.exitCode=1;}
