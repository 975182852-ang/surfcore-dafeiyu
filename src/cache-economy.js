// Cache policy and metadata only; never modify model input or keep message text.
import {createHash} from 'node:crypto';
const finite=x=>Number.isFinite(Number(x))?Math.max(0,Number(x)):0;
export function cacheSample(usage,{at=Date.now(),provider='',model=''}={}) {
  const miss=finite(usage?.inputTokens??usage?.uncachedInputTokens??usage?.cacheMiss);
  const hit=finite(usage?.cacheReadTokens??usage?.cacheHit),write=finite(usage?.cacheWriteTokens??usage?.cacheWrite);
  const input=miss+hit+write;
  return input>0?{at,provider,model,input,hit,hitRate:hit/input}:null;
}
export function cacheCompactionDecision(pressure,settings,samples=[],now=Date.now(),route={}) {
  if(pressure<settings.thresholdTokens)return{allow:false,reason:'under-threshold'};
  if(settings.cacheAware===false)return{allow:true,reason:'legacy-threshold'};
  if(pressure>=settings.hardThresholdTokens)return{allow:true,reason:'hard-threshold'};
  const recent=samples.filter(s=>s&&s.at<=now&&now-s.at<=3600000
    &&(!route.provider||s.provider===route.provider)&&(!route.model||s.model===route.model)).slice(-2);
  if(recent.some(s=>s.hitRate>=settings.cacheHitFloor))return{allow:false,reason:'protect-warm-prefix',samples:recent.length};
  if(recent.length<2)return{allow:false,reason:'wait-cache-samples',samples:recent.length};
  return{allow:true,reason:'sustained-low-cache',samples:recent.length};
}
export function ledgerCacheSamples(text) {
  const unique=new Map();
  for(const line of text.split('\n')){try{const r=JSON.parse(line);if(r.k==='turn'&&r.sid&&r.b)unique.set([r.sid,r.turn,r.step,r.retry].join('|'),r)}catch{}}
  const out=new Map();
  for(const r of [...unique.values()].sort((a,b)=>a.t-b.t)){const sample=cacheSample(r.b,{at:r.t,provider:r.provider,model:r.model});if(sample){const list=out.get(r.sid)||[];list.push(sample);out.set(r.sid,list.slice(-4))}}
  return out;
}
const digest=value=>{const text=JSON.stringify(value??null);return{hash:createHash('sha256').update(text).digest('hex'),bytes:Buffer.byteLength(text)}};
export function requestFingerprint(options) {
  return{provider:String(options.provider||''),model:String(options.model||''),system:digest(options.system),tools:digest(options.tools||[]),messages:(options.messages||[]).map(digest)};
}
export function compareFingerprints(previous,current) {
  const headerStable=!!previous&&previous.provider===current.provider&&previous.model===current.model&&previous.system.hash===current.system.hash&&previous.tools.hash===current.tools.hash;
  let commonMessages=0,commonMessageBytes=0;
  if(headerStable)for(let i=0;i<Math.min(previous.messages.length,current.messages.length);i++){if(previous.messages[i].hash!==current.messages[i].hash)break;commonMessages++;commonMessageBytes+=current.messages[i].bytes}
  return{headerStable,commonMessages,commonMessageBytes,previousMessageCount:previous?.messages.length??0,messageCount:current.messages.length,systemHash:current.system.hash,toolsHash:current.tools.hash};
}
