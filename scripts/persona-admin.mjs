// Local operator helper. Credentials stay inside the existing bridge client.
import { callBridge } from '../plugins/surfcore/lib/bridge.js';
const [command,...args]=process.argv.slice(2);
let response;
if(command==='status')response=await callBridge('/api/persona-modes');
else if(command==='list'){
 response=await callBridge('/api/stickers?count=500');
 if(response.ok)response.data={total:response.data.total,stickers:(response.data.stickers||[]).filter(e=>!args[0]||e.personaMode===args[0]).map(e=>({ref:e.ref,mode:e.personaMode,emotion:e.emotion,content:e.content}))};
}else if(command==='mode'&&['normal','brat'].includes(args[0])&&args[1])response=await callBridge('/api/persona-modes',{method:'POST',body:{mode:args[0],key:args[1],global:args[2]==='all'},timeoutMs:60000});
else if(command==='assign'&&args[0]&&['normal','brat'].includes(args[1]))response=await callBridge('/api/persona-modes/sticker',{method:'POST',body:{stickerId:args[0],mode:args[1]}});
else if(command==='note'&&args.length>=3)response=await callBridge('/api/stickers/note',{method:'POST',body:{stickerId:args[0],emotion:args[1],content:args[2],...(args[3]?{keywords:args[3].split(/[,，]/).map(x=>x.trim()).filter(Boolean)}:{})}});
else if(command==='prompt-count'&&Number.isInteger(Number(args[0]))&&Number(args[0])>=1&&Number(args[0])<=8)response=await callBridge('/api/socialV2/config',{method:'POST',body:{sticker:{promptMaxStickers:Number(args[0])}}});
else{console.log('Usage: node scripts/persona-admin.mjs status | list [normal|brat] | mode normal|brat group:QQ [all] | assign "#编号" normal|brat | note "#编号" 情绪 "描述" "关键词,关键词" | prompt-count 1..8');process.exitCode=1;}
if(response){if(!response.ok){console.error(response.data?.error||response.error||'Request failed');process.exitCode=1;}else console.log(JSON.stringify(response.data,null,2));}
