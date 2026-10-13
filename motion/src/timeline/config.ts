export const palette = { navy: '#061828', blue: '#0B2B43', gold: '#F0BC67', white: '#F8FBFF', muted: '#9EB5C9' };
export type Mode = 'institutional' | 'commercial' | 'horizontal';
export type SceneId = 'opening' | 'preparation' | 'formula' | 'professor' | 'platform' | 'closing';
export interface Shot { id: SceneId; start: number; end: number; title: string }
export const formats = {
  institutional: { width: 1080, height: 1920, duration: 20, label: 'Institucional · 20s · 9:16' },
  commercial: { width: 1080, height: 1920, duration: 12, label: 'Comercial · 12s · 9:16' },
  horizontal: { width: 1920, height: 1080, duration: 20, label: 'Horizontal · 20s · 16:9' },
} as const;
const institutional: Shot[] = [
  { id: 'opening', start: 0, end: 3, title: 'Seu futuro merece método' },
  { id: 'preparation', start: 3, end: 6, title: 'Preparação e conhecimento' },
  { id: 'formula', start: 6, end: 9, title: 'A fórmula do Teorema' },
  { id: 'professor', start: 9, end: 12, title: 'Professor Anderson' },
  { id: 'platform', start: 12, end: 17, title: 'A plataforma digital' },
  { id: 'closing', start: 17, end: 20, title: 'Comece sua jornada' },
];
const commercial: Shot[] = [
  { id: 'opening', start: 0, end: 1.8, title: 'Merece método' },
  { id: 'professor', start: 1.8, end: 4, title: 'Com Professor Anderson' },
  { id: 'preparation', start: 4, end: 5.6, title: 'Sua preparação' },
  { id: 'platform', start: 5.6, end: 9, title: 'Uma nova experiência' },
  { id: 'closing', start: 9, end: 12, title: 'Comece sua jornada' },
];
export function shotsFor(mode: Mode): Shot[] { return mode === 'commercial' ? commercial : institutional; }
export function normalizeMode(value: string): Mode {
  if (value === 'portrait' || value === 'vertical') return 'institutional';
  if (value === 'landscape') return 'horizontal';
  if (value in formats) return value as Mode;
  throw new RangeError(`Formato desconhecido: ${value}`);
}
export function clampTime(time: number, duration: number): number {
  if (!Number.isFinite(time)) throw new RangeError('O timestamp deve ser finito.');
  return Math.max(0, Math.min(time, duration));
}
