import { palette } from '../timeline/config';
export const clamp = (value: number) => Math.max(0, Math.min(1, value));
export function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color = palette.gold, alpha = 1) {
  ctx.save(); ctx.globalAlpha *= alpha; ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); ctx.restore();
}
export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string, stroke?: string) {
  ctx.beginPath(); ctx.roundRect(x,y,w,h,r); ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
}
export function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, options: { color?: string; font?: string; weight?: number; align?: CanvasTextAlign; maxWidth?: number; reveal?: number } = {}) {
  const p = options.reveal ?? 1;
  if (p <= 0) return;
  ctx.save(); ctx.globalAlpha *= p; ctx.textAlign = options.align ?? 'left'; ctx.textBaseline = 'alphabetic';
  ctx.font = `${options.weight ?? 600} ${size}px "${options.font ?? 'DM Sans'}"`;
  ctx.fillStyle = options.color ?? palette.white;
  const shift = (1-p) * size * 0.95;
  const measured = ctx.measureText(value).width;
  if (options.maxWidth && measured > options.maxWidth) { size *= options.maxWidth / measured; ctx.font = `${options.weight ?? 600} ${size}px "${options.font ?? 'DM Sans'}"`; }
  ctx.beginPath(); ctx.rect(0, y - size*1.3, ctx.canvas.width, size*1.65); ctx.clip();
  ctx.fillText(value, x, y + shift); ctx.restore();
}
export function background(ctx: CanvasRenderingContext2D, width: number, height: number, time: number) {
  ctx.fillStyle = palette.navy; ctx.fillRect(0,0,width,height);
  const glow = ctx.createRadialGradient(width*.7,height*.42,0,width*.5,height*.5,width*.9);
  glow.addColorStop(0,'#12334a'); glow.addColorStop(.6,palette.navy); glow.addColorStop(1,'#04111f'); ctx.fillStyle=glow; ctx.fillRect(0,0,width,height);
  ctx.save(); ctx.translate(width*.5,height*.49); ctx.rotate(-.3 + time*.006);
  for (let i=0;i<3;i++) { ctx.beginPath(); ctx.ellipse(0,0,width*(.37+i*.09),height*(.24+i*.04),0,0,Math.PI*2); ctx.strokeStyle=`rgba(240,188,103,${.08-i*.018})`; ctx.lineWidth=1; ctx.stroke(); }
  ctx.restore();
  for(let i=0;i<52;i++) { const x=((i*193.41+Math.sin(i)*49)%width+width)%width; const y=((i*273.17-time*(4+i%5))%height+height)%height; ctx.fillStyle=`rgba(240,188,103,${.1+(i%4)*.035})`; ctx.beginPath(); ctx.arc(x,y,i%5===0?2:1,0,Math.PI*2); ctx.fill(); }
}
export function mesh(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, progress: number, time: number) {
  ctx.save(); ctx.translate(x,y); ctx.rotate(time*.018-.2);
  const nodes = Array.from({length:12},(_,i)=>({x:Math.cos(i*Math.PI/6)*size*(i%2?.65:1),y:Math.sin(i*Math.PI/6)*size*(i%2?.65:1)}));
  nodes.forEach((a,i)=>{ const p=clamp(progress*1.5-i*.045); for (const step of [1,4]) { const b=nodes[(i+step)%12]; line(ctx,a.x,a.y,a.x+(b.x-a.x)*p,a.y+(b.y-a.y)*p,palette.gold,.22); } ctx.fillStyle=palette.gold; ctx.globalAlpha=.45*p;ctx.beginPath();ctx.arc(a.x,a.y,3,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1; });
  ctx.restore();
}
