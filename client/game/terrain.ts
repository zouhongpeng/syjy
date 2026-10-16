/**
 * 地形生成：高度图 + 生物群系 + 河流/湖泊
 * 为前端 GPU 渲染与逻辑层(敌人移动/建筑高度) 提供采样数据
 */
import { Noise } from './noise';
import { MAP_SIZE, WATER_LEVEL, Biome } from './config';

export interface TerrainData {
  size: number;
  heights: Float32Array; // size*size，index = y*size+x
  biomes: Uint8Array; // Biome index
  heightAt(x: number, z: number): number;
  biomeAt(x: number, z: number): Biome;
  water: boolean;
}

const BIOME_ORD: Biome[] = [
  'plain', 'hill', 'mountain', 'snow', 'water', 'forest', 'swamp', 'canyon', 'lake',
];

export function generateTerrain(seed = 42): TerrainData {
  const noise = new Noise(seed);
  const size = 260; // 逻辑分辨率
  const heights = new Float32Array(size * size);
  const biomes = new Uint8Array(size * size);

  // 1) 基础高度 + 大陆性断裂
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size - 0.5;
      const nz = y / size - 0.5;
      const e = noise.noise2(nx * 3.0, nz * 3.0); // 大尺度
      const m = noise.noise1(nx * 8.0, nz * 8.0); // 中尺度细节
      const ridge = 1 - Math.abs(noise.noise3(nx * 5.0, nz * 5.0) * 2 - 1); // 山脊
      let h = e * 120 + m * 25 + Math.pow(ridge, 2) * 60;
      // 中心平坦，适合基地
      const centerDist = Math.sqrt(nx * nx + nz * nz);
      if (centerDist < 0.12) h = h * 0.4 + 8;
      heights[y * size + x] = Math.max(0, h + 14);
    }
  }

  // 2) 河流侵蚀（几条蛇形河流）
  const rivers: { x: number; z: number }[][] = [];
  for (let r = 0; r < 3; r++) {
    const river: { x: number; z: number }[] = [];
    let px = Math.random() * size;
    let pz = 0;
    let dir = Math.random() * Math.PI * 2;
    for (let s = 0; s < size * 0.8; s++) {
      dir += (Math.random() - 0.5) * 0.6;
      px += Math.cos(dir) * 2.2;
      pz += Math.sin(dir) * 2.2;
      river.push({ x: px, z: pz });
    }
    rivers.push(river);
  }
  // 侵蚀：河流所在位置高度压到水面附近
  for (const river of rivers) {
    for (const p of river) {
      const xi = Math.max(2, Math.min(size - 3, Math.floor(p.x)));
      const zi = Math.max(2, Math.min(size - 3, Math.floor(p.z)));
      for (let dy = -3; dy <= 3; dy++)
        for (let dx = -3; dx <= 3; dx++) {
          const i = (zi + dy) * size + (xi + dx);
          heights[i] = Math.min(heights[i], WATER_LEVEL + 2);
        }
    }
  }

  // 3) 生物群系判定
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const h = heights[y * size + x];
      const nx = x / size - 0.5;
      const nz = y / size - 0.5;
      const moisture = noise.noise3(nx * 5.0 + 100, nz * 5.0 + 100);
      let biome: Biome = 'plain';
      if (h <= WATER_LEVEL + 1.5) biome = 'lake';
      else if (h < 22) biome = moisture > 0.52 ? 'swamp' : 'plain';
      else if (h < 38) biome = moisture > 0.6 ? 'forest' : 'plain';
      else if (h < 60) biome = moisture > 0.55 ? 'forest' : 'hill';
      else if (h < 92) biome = 'mountain';
      else biome = 'snow';
      biomes[y * size + x] = BIOME_ORD.indexOf(biome);
    }
  }

  return {
    size,
    heights,
    biomes,
    water: true,
    heightAt(x, z) {
      // 世界坐标 -> 逻辑网格
      const fx = (x / MAP_SIZE + 0.5) * size;
      const fz = (z / MAP_SIZE + 0.5) * size;
      const x0 = Math.max(0, Math.min(size - 2, Math.floor(fx)));
      const z0 = Math.max(0, Math.min(size - 2, Math.floor(fz)));
      const tx = fx - x0;
      const tz = fz - z0;
      const h00 = heights[z0 * size + x0];
      const h10 = heights[z0 * size + x0 + 1];
      const h01 = heights[(z0 + 1) * size + x0];
      const h11 = heights[(z0 + 1) * size + x0 + 1];
      return (
        h00 * (1 - tx) * (1 - tz) +
        h10 * tx * (1 - tz) +
        h01 * (1 - tx) * tz +
        h11 * tx * tz
      );
    },
    biomeAt(x, z) {
      const fx = Math.floor((x / MAP_SIZE + 0.5) * size);
      const fz = Math.floor((z / MAP_SIZE + 0.5) * size);
      const xi = Math.max(0, Math.min(size - 1, fx));
      const zi = Math.max(0, Math.min(size - 1, fz));
      return BIOME_ORD[biomes[zi * size + xi]];
    },
  };
}