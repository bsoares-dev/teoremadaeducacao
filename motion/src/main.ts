import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/playfair-display/600.css';
import { loadAssets } from './assets';
import { createRenderer } from './export/renderer';

declare global { interface Window { __ready: Promise<void>; __render: ReturnType<typeof createRenderer>['render']; } }
document.querySelector<HTMLDivElement>('#app')!.innerHTML='<canvas id="stage" width="1080" height="1920" aria-label="Motion institucional do Teorema da Educação"></canvas>';
document.body.style.cssText='margin:0;background:#061828;display:grid;place-items:center;min-height:100vh';
const canvas=document.querySelector<HTMLCanvasElement>('#stage')!;
canvas.style.cssText='display:block;width:auto;max-width:100%;height:100vh;object-fit:contain';
window.__ready=loadAssets().then(assets=>{const renderer=createRenderer(canvas,assets);window.__render=renderer.render;renderer.render(1.9);});
