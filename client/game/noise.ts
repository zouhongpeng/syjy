/**
 * 简化版 Simplex 噪声封装（避免依赖库差异）
 * 提供 2D 分形噪声用于地形生成
 */
function hash2d(x: number, y: number): number {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return (h >>> 0) / 4294967295;
}

function smooth(t: number) {
  return t * t * (3 - 2 * t);
}

// 值噪声 + 双线性插值 + fbm
function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const a = hash2d(xi, yi);
  const b = hash2d(xi + 1, yi);
  const c = hash2d(xi, yi + 1);
  const d = hash2d(xi + 1, yi + 1);
  const u = smooth(xf);
  const v = smooth(yf);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

export class Noise {
  private seed: number;
  constructor(seed = 1337) {
    this.seed = seed;
  }
  private five(x: number, y: number, octaves: number, lacunarity: number, gain: number): number {
    let amp = 0.5;
    let freq = 0.5;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += valueNoise(x * freq + this.seed, y * freq + this.seed) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm; // 0..1
  }
  noise2(x: number, y: number): number {
    return this.five(x, y, 5, 2.1, 0.5);
  }
  noise1(x: number, y: number): number {
    return this.five(x, y, 3, 2.0, 0.5);
  }
  noise3(x: number, y: number): number {
    return this.five(x, y, 2, 1.7, 0.55);
  }
}