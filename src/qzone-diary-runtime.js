import fs from 'node:fs';
import path from 'node:path';
import { createQzoneDiary } from './qzone-diary-store.js';
import { diaryPrompt, diaryImages, normalizeDiaryConfig } from './qzone-diary.js';

export function createDiaryRuntime({ stateDir, config, bot, fetchImage, mode, tone, entries, aliases, ready, generateModel, notify, log }) {
  const settings = () => normalizeDiaryConfig(config());
  const candidates = day => diaryImages(entries(),mode(),day);
  return createQzoneDiary({
    file: path.join(stateDir,'qzone-diary/state.json'), config: settings, ready, log,
    context: day => ({ mode: mode(), tone: tone(), images: candidates(day), aliases: aliases() }),
    generate: data => generateModel(diaryPrompt(data),settings()),
    listPosts: async () => {
      const r = await bot.request('get_qzone_msg_list',{pos:0,num:30});
      if(r?.status!=='ok'||r.retcode!==0||!Array.isArray(r.data?.msglist))throw Error('自己的空间列表暂不可读');
      return r.data.msglist;
    },
    publish: async ({text,imageId,visibility,day}) => {
      const params = { content:text, ugc_right:visibility };
      // Never send arbitrary URLs or user-provided file paths to the gateway.
      const image = candidates(day).find(e=>e.id===imageId);
      if(image)try{const fetched=await fetchImage(image.url,2*1024*1024);params.images=['base64://'+fetched.buffer.toString('base64')];}catch{log('[空间日记] 配图暂不可用，本次只发文字');}
      const r=await bot.request('send_qzone_msg',params);
      if(r?.status!=='ok'||r.retcode!==0)throw Object.assign(new Error('QQ空间未确认发表，请检查空间登录或账号限制'),{code:'QZONE_PUBLISH_REJECTED',hint:'先查看自己的空间是否已发表；确认未发表后再在日记管理端明确重试。'});
      const tid=r.data?.tid;
      return {postId:typeof tid==='string'||typeof tid==='number'?String(tid):null};
    },
    onError: notify,
  });
}

export async function writeDiaryWithDsh({ prompt, settings, api, stateDir, preset, ensureModel, waitTurn, learnerSessions, diarySessions, budgetAllowed }) {
  if(!budgetAllowed())throw Error('日记写稿额度不足或模型未连接');
  if(!preset)throw Error('日记缺少可用的安全QQ预设');
  const dir=path.join(stateDir,'qzone-diary-writer');fs.mkdirSync(dir,{recursive:true});
  const ws=await api.workspace.create({path:dir});
  if(!ws.result?.ok)throw Error('日记写稿工作区创建失败');
  const workspace=ws.result.value;
  if(workspace.created)try{await api.workspace.rename({workspaceId:workspace.workspace.workspaceId,title:'QQ 空间日记写稿'});}catch{}
  const created=await api.sessions.create({workspaceId:workspace.workspace.workspaceId,agentPreset:preset});
  if(!created.result?.ok)throw Error('日记写稿会话创建失败');
  const sessionId=created.result.value.sessionId;learnerSessions.add(sessionId);diarySessions.add(sessionId);
  let waiter,completed=false;
  try{
    api.events.follow(sessionId);await ensureModel(sessionId);
    waiter=waitTurn(sessionId,settings.writerTimeoutMs);waiter.catch(()=>{});
    const accepted=await api.sessions.prompt({sessionId,mode:'queue',content:[{type:'text',text:prompt}]});
    if(!accepted.result?.ok)throw Error('日记模型任务未接受');
    const output=await waiter;completed=true;return output;
  }finally{
    waiter?.cancel?.();
    if(!completed)try{await api.stopSessionWork(sessionId,{timeoutMs:8000});}catch{}
    api.events.forget?.(sessionId);learnerSessions.delete(sessionId);diarySessions.delete(sessionId);
    try{await api.workspace.archiveSession({sessionId});}catch{}
  }
}
