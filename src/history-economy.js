// Choose a native compaction span without breaking tool-call/result pairs.
export function selectHistorySpan(session, measurement, {retainTokens=50000,minUserMessages=6}={}) {
  const seqs=session.surface.nodes,nodes=measurement.nodes;
  if(!Array.isArray(nodes)||nodes.length!==seqs.length||nodes.some((n,i)=>n.seq!==seqs[i]))throw Error('ECONOMY_SURFACE_MISMATCH');
  if(nodes.length<12)return null;
  const first=session.eventAt(seqs[0])?.type==='system/message'?1:0;
  let kept=0,users=0,cut=nodes.length;
  for(let i=nodes.length-1;i>=first;i--){kept+=Math.max(0,nodes[i].tokens||0);if(session.eventAt(seqs[i])?.type==='user/message')users++;cut=i;if(kept>=retainTokens&&users>=minUserMessages)break;}
  let balance=0;const balanced=[true];
  for(const seq of seqs){const e=session.eventAt(seq);if(e?.type==='assistant/message')balance+=(e.data?.message?.content||[]).filter(b=>b.type==='tool-call').length;else if(e?.type==='tool/result')balance--;if(balance<0)throw Error('ECONOMY_TOOL_PAIR_INVALID');balanced.push(balance===0);}
  while(cut>first&&!balanced[cut])cut--;
  if(cut<=first||cut-first<4)return null;
  return {start:seqs[first],end:seqs[cut-1],removedNodes:cut-first,retainedNodes:seqs.length-cut};
}

export function economySettings(raw={}) {
  const number=(k,d,min,max)=>Number.isFinite(Number(raw[k]))?Math.max(min,Math.min(max,Number(raw[k]))):d;
  const thresholdTokens=number('thresholdTokens',280000,100000,800000);
  return {enabled:raw.enabled===true,thresholdTokens,cacheAware:raw.cacheAware!==false,cacheHitFloor:number('cacheHitFloor',0.95,0.5,0.9999),hardThresholdTokens:Math.max(thresholdTokens,number('hardThresholdTokens',600000,100000,900000)),retainTokens:number('retainTokens',50000,10000,150000),minUserMessages:number('minUserMessages',6,3,20),cooldownMs:number('cooldownMs',21600000,600000,86400000),failureCooldownMs:number('failureCooldownMs',3600000,300000,86400000)};
}
