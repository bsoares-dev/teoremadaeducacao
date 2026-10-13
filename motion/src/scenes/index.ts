import { palette, type Mode } from '../timeline/config';
import type { ShotState } from '../timeline/master';
import type { Assets } from '../assets';
import { clamp, line, mesh, roundRect, text } from '../animations/draw';
export interface SceneContext { ctx: CanvasRenderingContext2D; width: number; height: number; mode: Mode; time: number; assets: Assets }
function reveal(s: ShotState, i: number) { return s.words[i]?.reveal ?? 1; }
function heading(c: SceneContext, label: string, number: string) {
  const {ctx,width,height}=c; const horizontal=width>height; const margin=horizontal?130:88;
  text(ctx,'TEOREMA DA EDUCAÇÃO',margin,horizontal?95:155,22,{weight:600,color:palette.muted});
  text(ctx,number,width-margin,horizontal?95:155,22,{align:'right',color:palette.gold});
  line(ctx,margin,horizontal?120:185,width-margin,horizontal?120:185,palette.muted,.2);
  text(ctx,label.toUpperCase(),margin,horizontal?980:1710,20,{color:palette.muted,weight:500});
  text(ctx,'PROF. ANDERSON',width-margin,horizontal?980:1710,20,{color:palette.muted,align:'right',weight:500});
}
function opening(c: SceneContext,s: ShotState) {
  const {ctx,width,height,time,mode}=c; const h=width>height; const commercial=mode==='commercial'; const x=h?155:90;
  mesh(ctx,h?1460:550,h?470:850,h?330:485,clamp(time*.55+.2),time);
  text(ctx,'DIREÇÃO PARA IR ALÉM',x,h?270:475,25,{color:palette.gold,reveal:Math.max(.6,reveal(s,0))});
  text(ctx,'SEU FUTURO',x,h?405:700,h?102:100,{reveal:Math.max(.15,reveal(s,0)),weight:700});
  text(ctx,'NA EDUCAÇÃO',x,h?515:810,h?102:100,{reveal:reveal(s,1),weight:700});
  text(ctx,'merece',x,h?640:995,h?88:100,{font:'Playfair Display',color:palette.white,reveal:reveal(s,2)});
  text(ctx,'MÉTODO.',x,h?805:1160,h?150:160,{color:palette.gold,weight:700,reveal:reveal(s,commercial?2:3)});
  line(ctx,x,h?866:1248,x+310*s.wipe,h?866:1248,palette.gold,.8);
  text(ctx,'Conhecimento. Direção. Prática.',x,h?913:1330,30,{weight:500,color:palette.muted,reveal:reveal(s,4)});
}
function preparation(c: SceneContext,s: ShotState) {
  const {ctx,width,height,time}=c; const h=width>height;
  text(ctx,'Prepare o',h?130:90,h?320:380,h?76:84,{font:'Playfair Display',reveal:reveal(s,0)});
  text(ctx,'próximo passo.',h?130:90,h?410:480,h?76:84,{font:'Playfair Display',color:palette.gold,reveal:reveal(s,1)});
  const labels=['CONCURSOS','PEDAGOGIA','LEGISLAÇÃO','QUESTÕES'];
  labels.forEach((label,i)=>{
    const p=reveal(s,i+1); const x=h?920+(i%2)*425:90+(i%2)*18; const y=h?285+Math.floor(i/2)*225:635+i*175;
    const w=h?390:870; const hh=h?195:145;
    ctx.save();ctx.globalAlpha*=p;ctx.translate(0,(1-p)*100+Math.sin(time*.55+i)*4);
    roundRect(ctx,x,y,w,hh,12,'rgba(11,43,67,.94)','rgba(240,188,103,.35)');
    text(ctx,`0${i+1}`,x+25,y+40,20,{color:palette.gold});
    text(ctx,label,x+25,y+(h?124:102),h?36:48,{weight:700,maxWidth:w-55});
    line(ctx,x+25,y+hh-20,x+25+(w-50)*s.wipe,y+hh-20,palette.gold,.25);ctx.restore();
  });
  ['PREPARAÇÃO.','ESTRATÉGIA.','CONSTÂNCIA.'].forEach((label,i)=>text(ctx,label,h?135:90,h?570+i*62:1470+i*55,h?38:36,{color:i===2?palette.gold:palette.muted,reveal:reveal(s,i+3)}));
}
function formula(c: SceneContext,s: ShotState) {
  const {ctx,width,height,time}=c;const h=width>height; const local=time-s.shot.start; const transformed=clamp((local-1.7)/.55);
  mesh(ctx,width*.5,height*.48,h?365:425,s.wipe,time);
  text(ctx,'A FÓRMULA DO TEOREMA',h?130:90,h?245:365,27,{color:palette.gold,reveal:reveal(s,0)});
  const parts=['CONHECIMENTO','DIREÇÃO','PRÁTICA'];
  parts.forEach((label,i)=>{
    const x=h?width/2:width/2;const y=(h?365:620)+i*(h?125:220)-transformed*30;
    text(ctx,label,x,y,h?68:74,{align:'center',weight:700,reveal:reveal(s,i)});
    if(i<2)text(ctx,'+',x,y+(h?53:105),h?39:49,{align:'center',color:palette.gold,reveal:reveal(s,i+1)});
  });
  text(ctx,'=',width/2,h?677:1160,h?38:45,{align:'center',color:palette.gold,reveal:reveal(s,3)});
  text(ctx,'EVOLUÇÃO',width/2,h?775:1295,h?106:122,{align:'center',color:palette.gold,font:'Playfair Display',reveal:reveal(s,4)});
  line(ctx,width*.28,h?832:1410,width*.28+width*.44*transformed,h?832:1410,palette.gold,.6);
  text(ctx,'TEOREMA DA EDUCAÇÃO',width/2,h?895:1500,h?32:39,{align:'center',reveal:transformed});
}
function professor(c: SceneContext,s: ShotState) {
  const {ctx,width,height,assets,time}=c;const h=width>height;
  const cx=h?1420:550; const cy=h?540:1040; const radius=h?340:420;
  const glow=ctx.createRadialGradient(cx,cy,10,cx,cy,radius);glow.addColorStop(0,'rgba(240,188,103,.16)');glow.addColorStop(1,'rgba(240,188,103,0)');ctx.fillStyle=glow;ctx.fillRect(cx-radius,cy-radius,radius*2,radius*2);
  mesh(ctx,cx,cy,radius*.92,s.wipe,time);
  text(ctx,'COM O',h?155:90,h?310:340,30,{color:palette.gold,reveal:reveal(s,0)});
  text(ctx,'Professor',h?155:90,h?430:458,h?94:98,{font:'Playfair Display',reveal:reveal(s,1)});
  text(ctx,'Anderson',h?155:90,h?545:572,h?110:116,{font:'Playfair Display',color:palette.gold,reveal:reveal(s,2)});
  const p=reveal(s,0);const imageH=h?650:660;const imageW=imageH*assets.mascot.naturalWidth/assets.mascot.naturalHeight;
  ctx.save();ctx.globalAlpha*=p;ctx.translate((1-p)*55,0);ctx.drawImage(assets.mascot,cx-imageW/2,cy-imageH/2+18,imageW,imageH);ctx.restore();
  const x=h?155:90;const y=h?695:1485;
  line(ctx,x,y-70,x+260*s.wipe,y-70,palette.gold,.65);
  text(ctx,'CONHECIMENTO QUE',x,y,h?35:37,{reveal:reveal(s,3)});
  text(ctx,'ORIENTA SUA JORNADA.',x,y+(h?52:57),h?35:37,{color:palette.muted,reveal:reveal(s,4)});
}
function device(ctx: CanvasRenderingContext2D,img:HTMLImageElement,x:number,y:number,w:number,h:number,mobile=false) {
  ctx.save();ctx.shadowColor='rgba(0,0,0,.5)';ctx.shadowBlur=40;ctx.shadowOffsetY=24;
  roundRect(ctx,x,y,w,h,mobile?38:20,'#142737','rgba(158,181,201,.6)');ctx.restore();
  const pad=mobile?10:11;const top=mobile?10:36;
  ctx.save();ctx.beginPath();ctx.roundRect(x+pad,y+top,w-pad*2,h-top-pad,mobile?29:6);ctx.clip();
  ctx.drawImage(img,x+pad,y+top,w-pad*2,h-top-pad);ctx.restore();
  if(mobile){roundRect(ctx,x+w*.37,y+13,w*.26,9,5,'#08131f');}
  else{ for(let i=0;i<3;i++){ctx.fillStyle=i===0?palette.gold:'#526575';ctx.beginPath();ctx.arc(x+23+i*16,y+18,4,0,Math.PI*2);ctx.fill();} text(ctx,'teoremadaeducacao.com.br',x+w/2,y+24,12,{align:'center',color:palette.muted,weight:400}); }
}
function platform(c: SceneContext,s: ShotState) {
  const {ctx,width,height,assets,time,mode}=c;const h=width>height;const local=time-s.shot.start;
  const pace=mode==='commercial'?.7:1; const second=local>1.55*pace;const third=local>3.1*pace;
  const desktop=third?assets.materialsDesktop:second?assets.coursesDesktop:assets.homeDesktop;
  const mobile=third?assets.questionnairesMobile:second?assets.materialsMobile:assets.homeMobile;
  const progress=clamp(local/(s.shot.end-s.shot.start));
  text(ctx,'UMA NOVA EXPERIÊNCIA',h?130:90,h?235:380,h?56:52,{weight:700,reveal:reveal(s,0)});
  text(ctx,'para sua preparação.',h?130:90,h?312:465,h?69:70,{font:'Playfair Display',color:palette.gold,reveal:reveal(s,1)});
  const p=reveal(s,1);ctx.save();ctx.globalAlpha*=p;ctx.translate((1-p)*100, (1-p)*30);
  const dw=h?900:880;const dh=dw*900/1440+36;
  const dx=h?170:65;const dy=h?340:620;
  device(ctx,desktop,dx+progress*18,dy-progress*12,dw,dh);
  const mw=h?260:305;const mh=mw*844/390+10;
  device(ctx,mobile,h?1490:680,h?355:920,mw,mh,true);ctx.restore();
  const x=h?1320:90;const y=h?275:1335;
  if(h){ text(ctx,'Explore a plataforma',x,y,27,{color:palette.muted,reveal:reveal(s,2)}); }
  const captions=third?['MATERIAIS DE ESTUDO','QUESTÕES: EM DESENVOLVIMENTO']:second?['CURSOS VIA HOTMART','MATERIAIS DE ESTUDO']:['PÁGINA INICIAL','SUA PREPARAÇÃO COMEÇA AQUI'];
  if(h){ const labels=third?['MATERIAIS','DE ESTUDO','QUESTÕES EM','DESENVOLVIMENTO']:second?['CURSOS VIA','HOTMART','MATERIAIS','DE ESTUDO']:['PÁGINA','INICIAL','SUA PREPARAÇÃO','COMEÇA AQUI']; labels.forEach((label,i)=>text(ctx,label,1135,530+i*47,24,{color:i<2?palette.gold:palette.muted,maxWidth:330})); }
  else{ text(ctx,captions[0],x,y,29,{color:palette.gold,maxWidth:555}); const words=third?['QUESTÕES:','EM DESENVOLVIMENTO']:second?['MATERIAIS','DE ESTUDO']:['SUA PREPARAÇÃO','COMEÇA AQUI']; words.forEach((word,i)=>text(ctx,word,x,y+75+i*43,28,{color:palette.muted,maxWidth:550})); }
  const bx=h?130:90;const by=h?1030:1625;
  for(let i=0;i<3;i++){roundRect(ctx,bx+i*66,by,48,3,1,(third?2:second?1:0)===i?palette.gold:'#375064');}
}
function closing(c: SceneContext,s: ShotState) {
  const {ctx,width,height,assets,time}=c;const h=width>height;
  const x=h?130:90;
  text(ctx,'PREPARE-SE PARA CONQUISTAR',x,h?290:420,h?46:42,{reveal:reveal(s,0)});
  text(ctx,'seu espaço',x,h?415:540,h?112:112,{font:'Playfair Display',reveal:reveal(s,1)});
  text(ctx,'na educação.',x,h?545:665,h?112:112,{font:'Playfair Display',color:palette.gold,reveal:reveal(s,2)});
  const size=h?450:400;const lx=h?1280:340;const ly=h?250:760;
  ctx.save();ctx.globalAlpha*=reveal(s,2);ctx.beginPath();ctx.roundRect(lx,ly,size,size,18);ctx.clip();ctx.drawImage(assets.logo,lx,ly,size,size);ctx.restore();
  text(ctx,'TEOREMA DA EDUCAÇÃO',h?1505:540,h?770:1245,h?35:41,{align:'center',reveal:reveal(s,3)});
  const bx=h?130:90; const by=h?680:1350;const bw=h?800:900;
  ctx.save();ctx.globalAlpha*=reveal(s,3);roundRect(ctx,bx,by,bw,100,8,palette.gold);text(ctx,'COMECE SUA JORNADA',bx+bw/2,by+64,36,{align:'center',color:palette.navy,weight:700});ctx.restore();
  text(ctx,'teoremadaeducacao.com.br',bx,h?858:1540,h?40:41,{reveal:reveal(s,4),weight:500});
  const glint=clamp(1-Math.abs(time-(s.shot.end-.75))*3);
  ctx.save();ctx.globalAlpha*=glint;line(ctx,bx+bw-20,by-12,bx+bw-20,by+12,palette.white);line(ctx,bx+bw-33,by,bx+bw-7,by,palette.white);ctx.restore();
}
const scenes = { opening, preparation, formula, professor, platform, closing };
export function drawScene(c:SceneContext,state:ShotState,index:number){
  if(state.opacity<=0)return;
  c.ctx.save();c.ctx.globalAlpha=state.opacity;
  const zoom=1+state.camera*.018;
  c.ctx.translate(c.width/2,c.height/2);c.ctx.scale(zoom,zoom);c.ctx.translate(-c.width/2,-c.height/2);
  scenes[state.shot.id](c,state);c.ctx.restore();
  if(state.opacity>.5)heading(c,state.shot.title,`0${index+1}`);
}

