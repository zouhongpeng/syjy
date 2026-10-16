/**
 * 游戏状态 store：可变单例 + 简单订阅（供 React UI 使用 useSyncExternalStore）
 */
import { useSyncExternalStore } from 'react';
import {
  RegionType, Resources, START_RESOURCES, EnemyType, CORE_HP,
  REGION_DEFS, DAY_DURATION, NIGHT_DURATION,
} from './config';

export interface Region {
  id: number;
  type: RegionType;
  x1: number; z1: number;
  x2: number; z2: number;
  capacityUsed: number;
  maxCapacity?: number;
}

export interface Building {
  uid: number;
  defId: string;
  x: number; z: number;
  hp: number; maxHp: number;
  level: number;
  regionId?: number;
}

export interface Enemy {
  uid: number;
  type: EnemyType;
  x: number; z: number;
  hp: number; maxHp: number;
  speed: number;
  dmg: number;
  state: 'moving' | 'attacking';
  targetUid?: number;
  slow: number;
  t: number;
}

export interface Projectile {
  uid: number;
  sx: number; sz: number;
  tx: number; tz: number;
  targetUid: number;
  dmg: number;
  vsElite: number;
  t: number;
  dur: number;
  splash?: number;
}

export interface Particle {
  uid: number;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  color: string;
  t: number; life: number; size: number;
}

export interface MagicGain { type: EnemyType; count: number; crystal: number }
export interface WaveResult {
  kills: MagicGain[];
  totalCrystal: number;
  lostBuildings: number;
  coreDamage: number;
}

export type Phase = 'day' | 'night' | 'prep';
export type BuildMode = { defId: string } | null;

export interface Selection {
  kind: 'region' | 'building' | 'core' | 'enemy' | 'terrain' | null;
  id?: number;
}

export interface Stats {
  totalTime: number;
  kills: Record<EnemyType, number>;
  buildingsBuilt: number;
  totalArea: number;
  maxCoreLevel: number;
}

export interface GameState {
  started: boolean;
  loading: boolean;
  runId: number;
  phase: Phase;
  day: number;
  wave: number;
  elapsed: number;
  resources: Resources;
  core: { x: number; z: number; hp: number; maxHp: number; level: number };
  regions: Region[];
  buildings: Building[];
  enemies: Enemy[];
  projectiles: Projectile[];
  particles: Particle[];
  incomingDirections: { dir: number }[];
  incomingCount: number;
  announce: string | null;
  waveResult: WaveResult | null;
  gameOver: boolean;
  selection: Selection;
  buildMode: BuildMode;
  cameraTarget: { x: number; z: number } | null;
  stats: Stats;
  paused: boolean;
  soundOn: boolean;
  nextRegionId: number;
  nextUid: number;
  // ---- 运行时动态字段（非持久化） ----
  terrainRef?: unknown;
  _regionPaint?: string | null;
  _regionPaintMsg?: string | null;
  _paintType?: RegionType | null;
  _buildMsg?: string | null;
}

export const DAY_SECONDS = DAY_DURATION;
export const NIGHT_SECONDS = NIGHT_DURATION;

export const LEVEL_HP = CORE_HP;
export const LEVELS = CORE_HP.length - 1;

export function initialState(): GameState {
  return {
    started: false,
    loading: true,
    runId: 0,
    phase: 'prep',
    day: 1,
    wave: 1,
    elapsed: 0,
    resources: { ...START_RESOURCES },
    core: { x: 0, z: 0, hp: CORE_HP[1], maxHp: CORE_HP[1], level: 1 },
    regions: [],
    buildings: [],
    enemies: [],
    projectiles: [],
    particles: [],
    incomingDirections: [],
    incomingCount: 0,
    announce: null,
    waveResult: null,
    gameOver: false,
    selection: { kind: null },
    buildMode: null,
    cameraTarget: null,
    stats: {
      totalTime: 0,
      kills: { infantry: 0, cavalry: 0, knight: 0, siege: 0, assassin: 0, bishop: 0 },
      buildingsBuilt: 0, totalArea: 0, maxCoreLevel: 1,
    },
    paused: false,
    soundOn: true,
    nextRegionId: 1,
    nextUid: 1,
  };
}

// ---- 订阅机制 ----
const listeners = new Set<() => void>();
let version = 0;
export let game: GameState = initialState();

function notify() {
  version++;
  listeners.forEach((l) => l());
}

export function upsert(mutator: (g: GameState) => void) {
  mutator(game);
  notify();
}

// 供游戏主循环在每帧直接修改 game 后节流触发 UI 刷新
let uiTimer = 0;
export function syncUI() {
  const mark = () => { notify(); };
  // 简单节流：每 120ms 最多刷新一次 UI
  if (Date.now() - uiTimer > 120) {
    uiTimer = Date.now();
    mark();
  }
}

export function subscribeGame(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getVersion() {
  return version;
}

export function useGame<V>(selector: (g: GameState) => V): V {
  return useSyncExternalStore(subscribeGame, () => selector(game), () => selector(initialState()));
}

export function resetGame() {
  game = initialState();
  notify();
  return game;
}

export function uid() {
  return game.nextUid++;
}