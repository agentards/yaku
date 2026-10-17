import { makeObservation, OBS_TYPES, type Observation } from '../src/codec';
// Generador determinista (sin Math.random) de registros realistas en Piura.
export function sample(n: number, seed = 1): Observation[] {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const notes = ['agua hasta el tobillo frente al mercado', 'canal desbordado, lodo en pista', 'acequia tapada con basura', 'charco grande, niños cruzando', ''];
  return Array.from({ length: n }, (_, i) => makeObservation({
    type: OBS_TYPES[Math.floor(rnd() * OBS_TYPES.length)],
    severity: (1 + Math.floor(rnd() * 3)) as 1 | 2 | 3,
    lat: -5.19449 + (rnd() - 0.5) * 0.1,
    lon: -80.63282 + (rnd() - 0.5) * 0.1,
    note: notes[i % notes.length],
    ts: 1792252800 + Math.floor(rnd() * 86400),
    deviceId: ['a1b2c3d4', 'z9y8x7w6', 'k3k3k3k3'][i % 3],
  }));
}
