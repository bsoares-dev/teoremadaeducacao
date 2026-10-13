import { gsap } from 'gsap';
import { formats, shotsFor, type Mode, type Shot } from './config';
export interface ShotState { opacity: number; camera: number; wipe: number; words: { reveal: number }[]; shot: Shot }
export function createTimeline(mode: Mode) {
  const timeline = gsap.timeline({ paused: true });
  const shots: ShotState[] = shotsFor(mode).map(shot => ({ opacity: shot.start === 0 ? 1 : 0, camera: 0, wipe: 0, words: Array.from({ length: 8 }, () => ({ reveal: 0 })), shot }));
  for (const state of shots) {
    const { start, end } = state.shot;
    const entrance = start === 0 ? 0 : start - 0.22;
    timeline.to(state, { opacity: 1, duration: 0.32, ease: 'power2.inOut' }, entrance);
    timeline.to(state, { camera: 1, duration: end - entrance, ease: 'none' }, entrance);
    timeline.to(state, { wipe: 1, duration: 0.65, ease: 'expo.out' }, entrance);
    timeline.to(state.words, { reveal: 1, duration: mode === 'commercial' ? 0.46 : 0.72, stagger: mode === 'commercial' ? 0.065 : 0.11, ease: 'power3.out' }, entrance + (start ? 0.04 : 0));
    if (end < formats[mode].duration) timeline.to(state, { opacity: 0, duration: 0.3, ease: 'power2.inOut' }, end - 0.06);
  }
  const clock = { time: 0 };
  timeline.to(clock, { time: formats[mode].duration, duration: formats[mode].duration, ease: 'none' }, 0);
  return { timeline, shots };
}
