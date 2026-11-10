// One long-poll replaces early-close failure -> model retry -> wait -> model retry.
export async function waitForClose({state,baseline,deadline,valid=()=>true,aborted=()=>false,now=Date.now,pause=ms=>new Promise(r=>setTimeout(r,ms))}) {
  while(true){
    if(aborted())return 'aborted';
    if(!valid())return 'invalid';
    if(Number(state.lastUnreadSeq||0)>baseline)return 'arrived';
    const remaining=deadline-now();if(remaining<=0)return 'quiet';
    await pause(Math.min(200,remaining));
  }
}
