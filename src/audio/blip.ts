let actx: AudioContext | null = null;

/** Lazy WebAudio oscillator beep, created on first sound. Ported from the original `blip`. */
export function blip(f: number, d: number, type: OscillatorType = 'square'): void {
  try {
    actx =
      actx ||
      new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(0.06, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + d);
    o.connect(g);
    g.connect(actx.destination);
    o.start();
    o.stop(actx.currentTime + d);
  } catch {
    /* audio unavailable — ignore */
  }
}
