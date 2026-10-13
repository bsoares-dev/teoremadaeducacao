import { formats, shotsFor, normalizeMode, clampTime, type Mode } from '../timeline/config';
import { createTimeline } from '../timeline/master';
import type { Assets } from '../assets';
import { background } from '../animations/draw';
import { drawScene } from '../scenes';
export function createRenderer(canvas: HTMLCanvasElement, assets: Assets) {
  const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw new Error('Canvas 2D indisponível.');
  let mode:Mode='institutional';let master=createTimeline(mode);
  const render=(requestedTime:number,requestedMode:string=mode)=>{
    const next=normalizeMode(requestedMode);const time=clampTime(requestedTime,formats[next].duration);
    if(next!==mode){master.timeline.kill();mode=next;master=createTimeline(mode);}
    const {width,height,duration}=formats[mode];
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    // Seeking a paused GSAP timeline is the sole source of animated property state.
    master.timeline.totalTime(time,true);
    ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;
    background(ctx,width,height,time);
    master.shots.forEach((state,i)=>drawScene({ctx,width,height,mode,time,assets},state,i));
    const shot=shotsFor(mode).find(s=>time>=s.start&&time<s.end)??shotsFor(mode).at(-1)!;
    canvas.dataset.scene=shot.id;canvas.dataset.time=time.toFixed(4);
    return {time,duration,mode,scene:shot.id};
  };
  return {render,destroy:()=>master.timeline.kill()};
}
