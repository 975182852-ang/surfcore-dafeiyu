// QQ-only automatic history maintenance using the installed DSH compaction seam.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
// Explicit URL loads the updated policy in an already-running DSH process.
import {selectHistorySpan,economySettings} from '../../src/history-economy.js';
import {readBudget,readDailyUsage,evaluateBudget} from '../../src/token-budget.js';
import {createGateEventStore} from '../../src/gate-events.js';
import {cacheSample,cacheCompactionDecision,ledgerCacheSamples,requestFingerprint,compareFingerprints} from '../../src/cache-economy.js';
export const name='surfcore-economy';
// Existing Agents retain their preset revision. Use the registry's public
// accessor for that exact Agent instead of the newest composition inventory.
export const inject=['agentPresets','tokenMeter'];
const root=fileURLToPath(new URL('../..',import.meta.url));
export function apply(ctx,config={}) {
  const home=process.env.DSH_HOME||path.join(os.homedir(),'.dsh'),dir=path.join(home,'surfcore');
  const statusFile=config.statusFile||path.join(dir,'history-economy.json');
  const configFile=config.configFile||path.join(root,'config.json');
  const sessionsFile=config.sessionsFile||path.join(root,'state/sessions.json');
  const read=f=>{try{return JSON.parse(fs.readFileSync(f,'utf8').replace(/^\uFEFF/,''))}catch{return null}};
  const previousStats=read(statusFile)||{};
  const gates=createGateEventStore({dir:config.statusFile?path.dirname(statusFile):dir});
  const showFailure=(code,message)=>{try{gates.record({gate:'history-economy',kind:'fault',event:'compaction-failed',action:'paused',reason:{code,message},impact:'保留原历史继续聊天，暂停一小时内重复压缩。',recommendation:'查看history-economy.json与DSH原生compaction事件；检查网络后等待下次重试。',confidence:'confirmed',dedupeKey:'history-economy:'+code})}catch{}};
  const stats={ready:true,startedAt:Date.now(),attempts:previousStats.attempts||0,completed:previousStats.completed||0,last:previousStats.last||null};
  const lastBilled=new Map(),lastRun=new Map(Object.entries(previousStats.sessions||{})),busy=new Set();
  const ledgerFile=config.ledgerFile||path.join(root,'state/token-usage.jsonl');
  let samples=new Map();try{const size=fs.statSync(ledgerFile).size,fd=fs.openSync(ledgerFile,'r');try{const start=Math.max(0,size-262144),b=Buffer.alloc(size-start);fs.readSync(fd,b,0,b.length,start);const text=b.toString('utf8');samples=ledgerCacheSamples(start?text.slice(text.indexOf('\n')+1):text)}finally{fs.closeSync(fd)}}catch{}
  const fingerprints=new Map(),diagnosticFile=config.diagnosticFile||path.join(path.dirname(statusFile),'cache-prefix.jsonl');
  let savedAttempts=stats.attempts,savedCompleted=stats.completed;
  function save(){
    // Multiple QQ agents share this status file; synchronous read/merge/write
    // preserves their separate cooldowns and increments on the single host loop.
    const disk=read(statusFile)||{};
    const sessions={...(disk.sessions||{})};
    for(const [sid,value]of lastRun)if(!sessions[sid]||value.at>=sessions[sid].at)sessions[sid]=value;
    const attempts=(disk.attempts||0)+stats.attempts-savedAttempts,completed=(disk.completed||0)+stats.completed-savedCompleted;
    stats.attempts=attempts;stats.completed=completed;savedAttempts=attempts;savedCompleted=completed;
    if((disk.last?.at||0)>(stats.last?.at||0))stats.last=disk.last;
    stats.sessions=sessions;
    fs.mkdirSync(path.dirname(statusFile),{recursive:true});const tmp=statusFile+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(stats,null,2)+'\n',{mode:0o600});fs.renameSync(tmp,statusFile);
  }
  stats.nativeReady=null;
  stats.scope='host/agentPresets.serviceFor';
  stats.cacheAware=economySettings(read(configFile)?.socialV2?.historyEconomy).cacheAware;
  save();
  ctx.on('llm/stream',(options,next)=>{
    const sid=String(options.sessionId||''),primary=!options.purpose&&!!sid;
    const mapped=read(sessionsFile)?.sessions;
    const qq=primary&&(mapped?Object.values(mapped).includes(sid):config.skipBudgetCheck===true);
    let fingerprint,comparison;
    const diagnosticFailure=()=>{stats.diagnostics={ok:false,code:'CACHE_DIAGNOSTIC_WRITE_FAILED',hint:'检查cache-prefix.jsonl目录权限；不影响聊天和额度保护。'};try{save();gates.record({gate:'cache-diagnostics',kind:'fault',event:'diagnostic-write-failed',action:'degraded',reason:stats.diagnostics,recommendation:stats.diagnostics.hint,dedupeKey:'cache-diagnostic-write'})}catch{}};
    if(qq)try{fingerprint=requestFingerprint(options);comparison=compareFingerprints(fingerprints.get(sid),fingerprint);fingerprints.set(sid,fingerprint)}catch{diagnosticFailure()}
    const stream=next();
    return(async function*(){let usage;try{for await(const chunk of stream){if(chunk?.type==='usage')usage=chunk.usage;yield chunk}}finally{
      if(qq&&usage){const sample=cacheSample(usage,{provider:options.provider,model:options.model});if(sample){lastBilled.set(sid,sample.input);samples.set(sid,[...(samples.get(sid)||[]),sample].slice(-4));
        if(comparison)try{fs.mkdirSync(path.dirname(diagnosticFile),{recursive:true});try{if(fs.statSync(diagnosticFile).size>524288)fs.renameSync(diagnosticFile,diagnosticFile+'.previous')}catch(e){if(e.code!=='ENOENT')throw e}fs.appendFileSync(diagnosticFile,JSON.stringify({at:sample.at,sessionId:sid,...sample,...comparison})+'\n',{mode:0o600})}catch{diagnosticFailure()}
      }}
    }})();
  });
  ctx.on('agent/pre-step',async(payload,next)=>{
    const {agent,signal,modelSelection}=payload,sid=String(agent?.session?.header?.id||'');
    const settings=economySettings(read(configFile)?.socialV2?.historyEconomy);
    const qqSessions=read(sessionsFile)?.sessions;
    const isQq=qqSessions?Object.values(qqSessions).includes(sid):agent?.session?.header?.agentPreset==='qq-chat-v2';
    if(!settings.enabled||!isQq||!sid||signal?.aborted||busy.has(sid))return next();
    const previous=(read(statusFile)?.sessions||{})[sid]||lastRun.get(sid);
    if(previous&&Date.now()-previous.at<(previous.ok?settings.cooldownMs:settings.failureCooldownMs))return next();
    let compactor,meter;
    try {
      const registry=ctx.get('agentPresets');
      if(typeof registry?.serviceFor==='function'){
        compactor=registry.serviceFor(agent,'compaction');
        meter=registry.serviceFor(agent,'tokenMeter');
      }
      meter??=ctx.get('tokenMeter');
    }catch{ /* An unsupported host continues without automatic compaction. */ }
    const available=typeof compactor?.compactRegion==='function'&&typeof meter?.measure==='function';
    if(!available){stats.nativeReady=false;lastRun.set(sid,{at:Date.now(),ok:false});stats.last={ok:false,at:Date.now(),code:'ECONOMY_NATIVE_UNAVAILABLE',hint:'当前QQ会话缺少原生摘要服务，保留原聊天并检查该预设的composition。'};save();showFailure(stats.last.code,stats.last.hint);return next();}
    if(stats.nativeReady!==true){stats.nativeReady=true;save()}
    try{
      const measured=meter.measure(agent.session);
      // Cached official pressure seeds the first step after a plugin restart.
      const cached=read(path.join(home,'storages/session_projcache/sessions',sid+'.json'));
      const pressure=lastBilled.get(sid)||cached?.record?.rows?.contextPressure?.val?.pressureTokens||measured.totalTokens;
      stats.lastCheck={at:Date.now(),sessionId:sid,inputTokens:pressure,thresholdTokens:settings.thresholdTokens};
      const cacheDecision=cacheCompactionDecision(pressure,settings,samples.get(sid),Date.now(),modelSelection||agent.session.requestHeader?.()?.config||{});
      stats.lastCheck.cacheDecision=cacheDecision;stats.lastCheck.outcome=cacheDecision.reason;
      if(!cacheDecision.allow){save();return next();}
      if(!config.skipBudgetCheck&&evaluateBudget(readDailyUsage(dir),readBudget(dir),{scopes:['qq','total']}).blocked)return next();
      const span=selectHistorySpan(agent.session,measured,settings);
      if(!span)return next();
      busy.add(sid);lastRun.set(sid,{at:Date.now(),ok:false});stats.attempts++;save();
      // DSH owns durable markers, summary generation and atomic surface replacement.
      const result=await compactor.compactRegion(span.start,span.end,agent,signal);
      if(!result)throw Error('ECONOMY_NATIVE_NO_RECEIPT');
      lastBilled.delete(sid);lastRun.set(sid,{at:Date.now(),ok:true});stats.completed++;
      stats.last={ok:true,at:Date.now(),sessionId:sid,beforeInputTokens:pressure,afterEstimatedTokens:meter.measure(agent.session).totalTokens,...span,summarySeq:result.summarySeq??null};
      save();ctx.logger?.info?.('QQ长历史已生成摘要，原始日志与近期消息保留。');
    }catch(e){
      lastRun.set(sid,{at:Date.now(),ok:false});
      stats.last={ok:false,at:Date.now(),sessionId:sid,code:'ECONOMY_COMPACTION_FAILED',hint:'已保留聊天并暂停一小时内重复尝试；检查原生compaction事件和网络。'};
      showFailure(stats.last.code,stats.last.hint);
      try{save()}catch{}ctx.logger?.warn?.('QQ历史摘要未完成，继续原聊天；详情见history-economy.json。');
    }finally{busy.delete(sid)}
    return next();
  });
}

export default {name,inject,apply};
