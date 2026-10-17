// Medición de fps de la escena: cuenta los cuadros que MapLibre realmente dibuja (evento «render»).
import type { Map as MLMap } from 'maplibre-gl';

export interface MedidaFps { fps: number; cuadros: number; ms: number; p95ms: number; peorMs: number }

/** Resume intervalos entre cuadros (ms) en fps medio y percentil 95 del tiempo por cuadro. */
export function resumirCuadros(intervalos: number[], ms: number): MedidaFps {
  const o = [...intervalos].sort((a, b) => a - b);
  const p95 = o.length ? o[Math.min(o.length - 1, Math.floor(o.length * 0.95))] : 0;
  return { fps: ms > 0 ? +((intervalos.length * 1000) / ms).toFixed(1) : 0, cuadros: intervalos.length, ms: Math.round(ms), p95ms: +p95.toFixed(1), peorMs: +(o.at(-1) ?? 0).toFixed(1) };
}

/** Mide durante `ms` mientras la cámara se mueve (vuelo u órbita). */
export function medirFps(map: Pick<MLMap, 'on' | 'off'>, ms = 5000): Promise<MedidaFps> {
  return new Promise((res) => {
    const iv: number[] = [];
    let prev = 0;
    const t0 = performance.now();
    const f = () => { const t = performance.now(); if (prev) iv.push(t - prev); prev = t; };
    map.on('render', f);
    setTimeout(() => { map.off('render', f); res(resumirCuadros(iv, performance.now() - t0)); }, ms);
  });
}
