import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.MOTION_URL||'http://127.0.0.1:4174');await page.evaluate(()=>window.__ready);
 await mkdir('output/qa',{recursive:true});
 for(const mode of ['institutional','horizontal']){
  const tiles=[];const times=[1.9,4.7,8.35,10.6,15.85,19.3];
  for(let i=0;i<times.length;i++){
   const data=await page.evaluate(({t,mode})=>{window.__render(t,mode);return document.querySelector('#stage').toDataURL();},{t:times[i],mode});
   const buffer=Buffer.from(data.split(',')[1],'base64');await writeFile(`output/qa/${mode}-${i+1}.png`,buffer);
   tiles.push(await sharp(buffer).resize(mode==='horizontal'?640:324).png().toBuffer());
  }
  const w=mode==='horizontal'?640:324; const h=mode==='horizontal'?360:576;
  await sharp({create:{width:w*3,height:h*2,channels:3,background:'#061828'}}).composite(tiles.map((input,i)=>({input,left:(i%3)*w,top:Math.floor(i/3)*h}))).png().toFile(`output/qa/${mode}-storyboard.png`);
 }
 if(errors.length)throw Error(errors.join('\n'));console.log('PASS: 12 scene samples; no browser errors.');
}finally{await browser.close();}
