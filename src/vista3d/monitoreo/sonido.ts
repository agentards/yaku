// Aviso sonoro corto con WebAudio: sin archivos ni red. El navegador exige un clic antes de sonar.
export const TONOS_NUEVO = [[880, 0], [1320, 0.18]] as const;
export const TONOS_COINCIDE = [[1046, 0]] as const;

export class Sonido {
  private ctx: AudioContext | null = null;
  /** Avisos pedidos (sonaran o no): lo lee el E2E. */
  sonados = 0;
  silenciado = false;
  activo = () => !this.silenciado && this.ctx?.state === 'running';
  activar() {
    this.silenciado = false;
    try {
      this.ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      return this.ctx.resume().then(() => this.activo()).catch(() => false);
    } catch { return Promise.resolve(false); }
  }
  /** Dos tonos = incidente nuevo; uno = otro vecino coincide. */
  sonar(tonos: readonly (readonly [number, number])[] = TONOS_NUEVO) {
    this.sonados++;
    const c = this.ctx;
    if (!c || c.state !== 'running' || this.silenciado) return false;
    const t0 = c.currentTime;
    for (const [f, dt] of tonos) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + dt);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + dt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.2);
      o.connect(g).connect(c.destination);
      o.start(t0 + dt); o.stop(t0 + dt + 0.22);
    }
    return true;
  }
}
