/**
 * 引擎：每帧 tick 推进模拟
 * 昼夜循环 / 波次生成 / 敌军AI / 战斗 / 生产
 */
import {
  MAP_SIZE, DAY_DURATION, NIGHT_DURATION, ENEMY_DEFS, EnemyType, BUILDING_DEFS,
  COLORS, CORE_LEVEL_COST, CORE_HP, REGION_DEFS,
} from './config';
import { game, uid, WaveResult, Region, Enemy, initialState as storeInitial } from './store';
import { TerrainData } from './terrain';
import { playSfx } from './sfx';

const DIRECTIONS = 8;
export function dist(a: { x: number; z: number }, b: { x: number; z: number }) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

// ---- 波次数据 ----
function numDirections(wave: number): number {
  if (wave % 5 === 0) return 8;
  return 2 + (Math.random() > 0.4 ? 1 : 0);
}
function edgePoint(dir: number): { x: number; z: number } {
  const a = (dir / DIRECTIONS) * Math.PI * 2;
  const r = MAP_SIZE * 0.52;
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}
function waveCount(type: EnemyType, wave: number): number {
  const base: Record<EnemyType, number> = { infantry: 8, cavalry: 4, knight: 2, siege: 1, assassin: 3, bishop: 0 };
  return Math.round(base[type] + wave * 1.3);
}
function spawnWave(wave: number, directions: number) {
  const dirs: { dir: number }[] = [];
  if (directions === 8) for (let d = 0; d < 8; d++) dirs.push({ dir: d });
  else {
    const set = new Set<number>();
    while (set.size < directions) set.add(Math.floor(Math.random() * DIRECTIONS));
    set.forEach((d) => dirs.push({ dir: d }));
  }
  const baseComp: EnemyType[] = (['infantry', 'cavalry', 'knight', 'siege', 'assassin'] as EnemyType[])
    .slice(0, Math.min(5, 2 + Math.floor(wave / 4)));
  const comp: EnemyType[] = wave % 10 === 0 ? ['bishop'] : baseComp;
  game.incomingDirections = dirs;
  game.incomingCount = comp.reduce((s, t) => s + waveCount(t, wave), 0);
  // 圣光之夜：第7/14天数量翻倍，方向+2
  const doubled = game.day % 7 === 0;
  for (const dir of dirs) {
    const p = edgePoint(dir.dir);
    for (const type of comp) {
      let cnt = waveCount(type, wave);
      if (type === 'bishop') cnt = 1;
      if (doubled) cnt = Math.round(cnt * 2);
      for (let i = 0; i < cnt; i++) {
        const def = ENEMY_DEFS[type];
        const dx = p.x + (Math.random() - 0.5) * 60;
        const dz = p.z + (Math.random() - 0.5) * 60;
        const hpMul = 1 + (wave - 1) * 0.06;
        game.enemies.push({
          uid: uid(), type, x: dx, z: dz,
          hp: def.hp * hpMul, maxHp: def.hp * hpMul,
          speed: def.speed * (1 + Math.min(0.5, (wave - 1) * 0.02)),
          dmg: def.damage * (1 + (wave - 1) * 0.03),
          state: 'moving', slow: 1, t: Math.random() * 0.4,
        });
      }
    }
  }
  if (doubled || directions === 8) playSfx('hit');
}

// ---- 主 tick ----
export function tick(dt: number, terrain: TerrainData) {
  if (!game.started || game.gameOver || game.paused) return;
  game.stats.totalTime += dt;

  // 相位流转
  if (game.phase === 'prep') {
    game.elapsed += dt;
    if (game.elapsed >= 3) { game.elapsed = 0; game.phase = 'night'; }
  } else if (game.phase === 'day') {
    game.elapsed += dt;
    if (game.elapsed >= DAY_DURATION || (enemiesAllDead() && game.elapsed > 1)) endDay();
  } else if (game.phase === 'night') {
    game.elapsed += dt;
    if (game.elapsed >= NIGHT_DURATION) {
      game.elapsed = 0;
      game.phase = 'day';
      spawnWave(game.wave, numDirections(game.wave));
      if (game.wave % 5 === 0) playSfx('drum');
      game.wave++;
    }
  }

  // 子系统
  tickProduction(dt);
  tickEnemies(dt, terrain);
  tickDefense(dt);
  tickProjectiles(dt);
  tickParticles(dt);

  // 核心燃烧粒子
  if (game.core.hp < game.core.maxHp * 0.5 && Math.random() < 0.3) {
    spawnParticle(game.core.x, 6 + Math.random() * 10, game.core.z, COLORS.magicPurpleDeep, 0.8);
  }
}

function enemiesAllDead() {
  return game.enemies.length === 0;
}

// === 世界波次数据（结算用） ===
let countDead: Partial<Record<EnemyType, number>> = {};
let lostBuildings = 0;
let coreDamage = 0;

export function resetWaveCounters() {
  countDead = {}; lostBuildings = 0; coreDamage = 0;
}

// 跳过准备阶段，立即进入夜晚建造阶段
export function skipPrep() {
  if (game.phase !== 'prep') return false;
  game.phase = 'night';
  game.elapsed = 0;
  return true;
}

function endDay() {
  const magic = (Object.keys(countDead) as EnemyType[]).map((t) => ({
    type: t, count: countDead[t] || 0, crystal: (countDead[t] || 0) * ENEMY_DEFS[t].drop,
  }));
  const res: WaveResult = {
    kills: magic,
    totalCrystal: magic.reduce((s, m) => s + m.crystal, 0),
    lostBuildings,
    coreDamage: Math.round(coreDamage),
  };
  game.waveResult = res;
  game.phase = 'prep';
  game.elapsed = 0;
  game.enemies = [];
  game.projectiles = [];
  resetWaveCounters();
  game.day++;
  const boss = game.day >= 1 && (game.day - 1) % 10 === 0;
  game.announce = boss ? 'prep-bishop' : 'prep';
}

// === 生产 ===
interface ProdAcc { [uid: number]: number }
const prodAcc: ProdAcc = {};
function tickProduction(dt: number) {
  game.buildings.forEach((b) => {
    const def = BUILDING_DEFS[b.defId];
    if (!def.production) return;
    const eff = regionEff(b.regionId) * (b.level >= 2 ? 1.5 : 1) * (b.level >= 3 ? 2 : 1);
    prodAcc[b.uid] = (prodAcc[b.uid] || 0) + dt;
    const interval = def.production.interval / eff;
    if (prodAcc[b.uid] >= interval) {
      prodAcc[b.uid] -= interval;
      if (def.production.crystal) game.resources.crystal += def.production.crystal;
      if (def.production.wood) game.resources.wood += def.production.wood;
      if (def.production.food) game.resources.food += def.production.food;
    }
  });
}

export function regionEff(id?: number): number {
  if (!id) return 1;
  const r = game.regions.find((x) => x.id === id);
  if (!r) return 1;
  let eff = 1;
  if (r.type === 'workshop') {
    const mines = game.buildings.filter((b) => b.regionId === id && BUILDING_DEFS[b.defId].production?.crystal).length;
    eff += Math.min(0.3, mines * 0.05);
  }
  if (r.type === 'logistics') {
    const vaults = game.buildings.filter((b) => b.regionId === id && b.defId === 'vault').length;
    eff += Math.min(0.3, vaults * 0.05);
  }
  if (r.type === 'populace') {
    const nests = game.buildings.filter((b) => b.regionId === id && b.defId === 'nest').length;
    game.resources.maxPops = 50 + nests * 20;
  }
  if (r.type === 'defense') {
    const towers = game.buildings.filter((b) => b.regionId === id && b.defId === 'tower').length;
    eff = 1 + Math.min(0.3, towers * 0.05);
  }
  // 王座全局
  if (game.buildings.some((b) => b.defId === 'throne')) eff *= 1.1;
  return eff;
}

// === 敌军 ===
function terrainMul(terrain: TerrainData, x: number, z: number): number {
  const b = terrain.biomeAt(x, z);
  switch (b) {
    case 'forest': return 0.7;
    case 'swamp': return 0.5;
    case 'canyon': return 0.8;
    default: return 1;
  }
}
function tickEnemies(dt: number, terrain: TerrainData) {
  const core = game.core;
  game.enemies.forEach((e) => {
    const def = ENEMY_DEFS[e.type];
    e.t += dt;
    // 攻击建筑态
    if (e.state === 'attacking') {
      const t = game.buildings.find((b) => b.uid === e.targetUid);
      if (!t) { e.state = 'moving'; e.targetUid = undefined; }
      else {
        const d = dist(e, { x: t.x, z: t.z });
        if (d > def.radius + 5) {
          const m = terrainMul(terrain, e.x, e.z);
          if (m > 0) { const s = e.speed * e.slow * m * dt; e.x += ((t.x - e.x) / d) * s; e.z += ((t.z - e.z) / d) * s; }
        } else { t.hp -= e.dmg * dt; if (t.hp <= 0) { destroyBuilding(t.uid); } }
      }
      return;
    }
    // 规划攻击目标
    const wantBuilding = def.tactical !== 'core';
    const nearby = game.buildings
      .filter((b) => dist(e, { x: b.x, z: b.z }) < 30)
      .sort((a, b2) => dist(e, { x: a.x, z: a.z }) - dist(e, { x: b2.x, z: b2.z }));
    if (wantBuilding && nearby.length > 0) {
      e.state = 'attacking'; e.targetUid = nearby[0].uid; return;
    }
    const dCore = dist(e, core);
    if (dCore <= def.radius + 7) {
      game.core.hp -= e.dmg * dt;
      coreDamage += e.dmg * dt;
      if (game.core.hp <= 0) {
        game.core.hp = 0; game.gameOver = true; game.announce = 'gameover';
      }
      return;
    }
    const m = terrainMul(terrain, e.x, e.z);
    if (m > 0) { const s = e.speed * e.slow * m * dt; e.x += ((core.x - e.x) / dCore) * s; e.z += ((core.z - e.z) / dCore) * s; }
  });
}

function destroyBuilding(id: number) {
  const idx = game.buildings.findIndex((b) => b.uid === id);
  if (idx >= 0) {
    const b = game.buildings[idx];
    const reg = game.regions.find((r) => r.id === b.regionId);
    if (reg) reg.capacityUsed--;
    game.buildings.splice(idx, 1);
    lostBuildings++;
    burst(b.x, b.z, COLORS.rockLight);
    playSfx('hit');
  }
}

// === 防御 ===
interface CdAcc { [uid: number]: number }
const cdAcc: CdAcc = {};
function tickDefense(dt: number) {
  game.buildings.forEach((b) => {
    const def = BUILDING_DEFS[b.defId];
    if (!def.weapon) return;
    const eye = game.buildings.filter((o) => o.defId === 'eye' && dist(o, b) < 60).length;
    const range = def.weapon.range * (1 + Math.min(0.5, eye * 0.15));
    cdAcc[b.uid] = (cdAcc[b.uid] || 0) + dt;
    const rate = def.weapon.rate * (b.level >= 2 ? 1.4 : 1) * (b.level >= 3 ? 2 : 1);
    if (cdAcc[b.uid] < 1 / rate) return;
    const target = game.enemies.find((e) => dist(b, e) < range + ENEMY_DEFS[e.type].radius);
    if (!target) { cdAcc[b.uid] = 0; return; }
    cdAcc[b.uid] = 0;
    game.projectiles.push({
      uid: uid(), sx: b.x, sz: b.z, tx: target.x, tz: target.z, targetUid: target.uid,
      dmg: def.weapon.damage, vsElite: def.weapon.vsElite || 1,
      t: 0, dur: Math.max(0.1, dist(b, target) / 90), splash: def.weapon.splash,
    });
  });
}

function tickProjectiles(dt: number) {
  game.projectiles = game.projectiles.filter((p) => {
    p.t += dt;
    const prog = p.t / p.dur;
    if (prog >= 1) {
      const target = game.enemies.find((e) => e.uid === p.targetUid);
      if (target) {
        let dmg = p.dmg * p.vsElite;
        if (p.splash && target.type === 'knight') dmg *= 1.8;
        target.hp -= dmg;
        if (p.splash) {
          game.enemies.forEach((e2) => { if (e2.uid !== target.uid && dist(target, e2) < p.splash!) e2.hp -= dmg * 0.5; });
          burst(target.x, target.z, COLORS.magicPurple, 6);
        } else spawnParticle(target.x, 6, target.z, COLORS.magicPurple, 0.5);
        if (target.hp <= 0) onKill(target);
      }
      return false;
    }
    return true;
  });
}

function onKill(e: Enemy) {
  const idx = game.enemies.indexOf(e);
  if (idx >= 0) {
    const en = game.enemies[idx];
    game.enemies.splice(idx, 1);
    const def = ENEMY_DEFS[en.type];
    game.resources.crystal += def.drop;
    countDead[en.type] = (countDead[en.type] || 0) + 1;
    (game.stats.kills as any)[en.type] = ((game.stats.kills as any)[en.type] || 0) + 1;
    burst(en.x, en.z, COLORS.enemyGold, 7);
  }
}

// === 粒子 ===
function spawnParticle(x: number, y: number, z: number, color: string, size: number) {
  if (game.particles.length > 400) return;
  game.particles.push({
    uid: uid(), x, y, z,
    vx: (Math.random() - 0.5) * 8, vy: Math.random() * 7 + 3, vz: (Math.random() - 0.5) * 8,
    color, t: 0, life: 0.5 + Math.random() * 0.5, size,
  });
}
function burst(x: number, z: number, color: string, n = 10) {
  for (let i = 0; i < n; i++) spawnParticle(x, 6 + Math.random() * 8, z, color, 0.5 + Math.random() * 0.5);
}
function tickParticles(dt: number) {
  game.particles = game.particles.filter((p) => {
    p.t += dt;
    if (p.t > p.life) return false;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy -= 7 * dt;
    return true;
  });
}

// === 对外：建造 / 升级 / 拆除 / 规划 ===
export function tryBuild(defId: string, x: number, z: number, terrain: TerrainData): { ok: boolean; reason?: string } {
  const def = BUILDING_DEFS[defId];
  if (!def) return { ok: false, reason: '未知建筑' };
  const biome = terrain.biomeAt(x, z);
  if (biome === 'water' || biome === 'lake' || biome === 'mountain') return { ok: false, reason: '地形不可建造' };
  if (game.resources.crystal < def.cost.crystal || game.resources.wood < def.cost.wood || game.resources.stone < def.cost.stone)
    return { ok: false, reason: '资源不足' };
  // 区域内 & 容量
  const reg = game.regions
    .filter((r) => x > r.x1 && x < r.x2 && z > r.z1 && z < r.z2)
    .sort((a, b2) => Math.min(a.z2 - a.z1, a.x2 - a.x1) - Math.min(b2.z2 - b2.z1, b2.x2 - b2.x1))[0];
  if (!reg) return { ok: false, reason: '请先在区域内规划并放置' };
  const rd = REGION_DEFS[reg.type];
  // 建筑必须属于该区域允许的类别
  const categoryToRegion: Record<string, string> = {
    core: 'core', defense: 'defense', populace: 'populace', workshop: 'workshop',
    logistics: 'logistics', outpost: 'outpost',
  };
  if (categoryToRegion[def.category] !== reg.type) return { ok: false, reason: `该建筑须建在${rd.name}` };
  if (reg.capacityUsed >= rd.capacity) return { ok: false, reason: '区域容量已满' };
  // 魔核范围（除防线/前哨）
  const inCore = dist({ x, z }, game.core) <= coreRadiusAt();
  if (!rd.canOutsideCore && !inCore) return { ok: false, reason: '须在魔核能量范围内' };
  // 扣资源
  game.resources.crystal -= def.cost.crystal;
  game.resources.wood -= def.cost.wood;
  game.resources.stone -= def.cost.stone;
  game.buildings.push({
    uid: uid(), defId, x, z, hp: def.hp, maxHp: def.hp, level: 1, regionId: reg.id,
  });
  reg.capacityUsed++;
  game.stats.buildingsBuilt++;
  playSfx('place');
  return { ok: true };
}

export function coreRadiusAt(level = game.core.level) {
  return 50 + (level - 1) * 10;
}

export function upgradeCore(): { ok: boolean; reason?: string } {
  const lv = game.core.level;
  if (lv >= CORE_HP.length - 1) return { ok: false, reason: '已达最高等级' };
  const cost = CORE_LEVEL_COST[lv];
  if (game.resources.crystal < cost) return { ok: false, reason: '魔晶不足' };
  game.resources.crystal -= cost;
  game.core.level = lv + 1;
  game.core.maxHp = CORE_HP[game.core.level];
  game.core.hp = Math.min(game.core.maxHp, game.core.hp + (CORE_HP[game.core.level] - CORE_HP[lv]) * 0.5);
  game.stats.maxCoreLevel = Math.max(game.stats.maxCoreLevel, game.core.level);
  playSfx('place');
  return { ok: true };
}

export function upgradeBuilding(id: number): { ok: boolean; reason?: string } {
  const b = game.buildings.find((x) => x.uid === id);
  if (!b) return { ok: false, reason: '建筑不存在' };
  if (b.level >= 3) return { ok: false, reason: '已达3级' };
  const cost = b.level === 1 ? 50 : 100;
  if (game.resources.crystal < cost) return { ok: false, reason: '魔晶不足' };
  game.resources.crystal -= cost;
  b.level++;
  b.maxHp += 200;
  b.hp += 200;
  playSfx('place');
  return { ok: true };
}

export function demolishBuilding(id: number) {
  const idx = game.buildings.findIndex((b) => b.uid === id);
  if (idx >= 0) {
    const b = game.buildings[idx];
    const reg = game.regions.find((r) => r.id === b.regionId);
    if (reg) reg.capacityUsed--;
    // 返还一半
    const def = BUILDING_DEFS[b.defId];
    game.resources.crystal += Math.floor(def.cost.crystal / 2);
    game.resources.wood += Math.floor(def.cost.wood / 2);
    game.resources.stone += Math.floor(def.cost.stone / 2);
    game.buildings.splice(idx, 1);
    playSfx('hit');
  }
}

export function addRegion(p: { type: Region['type']; x1: number; z1: number; x2: number; z2: number }): { ok: boolean; reason?: string } {
  const { type, x1, z1, x2, z2 } = p;
  const xmin = Math.min(x1, x2), xmax = Math.max(x1, x2);
  const zmin = Math.min(z1, z2), zmax = Math.max(z1, z2);
  if (xmax - xmin < 8 || zmax - zmin < 8) return { ok: false, reason: '区域过小' };
  if (Math.abs(xmax - xmin) > 120 || Math.abs(zmax - zmin) > 120) return { ok: false, reason: '区域过大' };
  // 重叠检测
  const overlap = game.regions.some((r) => xmin < r.x2 && xmax > r.x1 && zmin < r.z2 && zmax > r.z1);
  if (overlap) return { ok: false, reason: '与其他区域重叠' };
  game.regions.push({ id: uid(), type, x1: xmin, z1: zmin, x2: xmax, z2: zmax, capacityUsed: 0 });
  game.stats.totalArea += Math.abs(xmax - xmin) * Math.abs(zmax - zmin) / 10000;
  playSfx('place');
  return { ok: true };
}

export function expandRegion(id: number) {
  const r = game.regions.find((x) => x.id === id);
  if (!r) return;
  const cost = 40;
  if (game.resources.crystal < cost) return;
  game.resources.crystal -= cost;
  r.maxCapacity = r.maxCapacity === undefined ? REGION_DEFS[r.type].capacity + 5 : r.maxCapacity + 5;
  (r as any).capacityUsed = (r as any).capacityUsed || 0;
  playSfx('place');
}

// 供引擎外使用
export { coreRadiusAt as coreRadius }

// === 重置 ===
export function resetGame() {
  const fresh = storeInitial();
  Object.assign(game, fresh);
  resetWaveCounters();
  playSfx('place');
}