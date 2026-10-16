/**
 * 深渊纪元 —— 全局配置
 * 色彩系统 / 地形 / 区域 / 建筑 / 敌军 定义
 */

// ===== 全局常量 =====
export const MAP_SIZE = 1000; // 地图边长(单位)
export const SEGMENTS = 220;  // 地形细分
export const HEIGHT_AMP = 100; // 地形高度范围
export const WATER_LEVEL = 6;  // 水面高度

export const DAY_DURATION = 120;   // 白天(战斗) 秒
export const NIGHT_DURATION = 60;  // 夜晚(建造) 秒
export const DAY_NIGHT_BLEND = 5;  // 昼夜过渡秒数

// ===== 主色调 =====
export const COLORS = {
  abyss: '#0A0E1A',
  rockDark: '#1A1F2E',
  rockMid: '#2D3548',
  rockLight: '#4A5568',
  snow: '#E8EDF5',
  magicPurple: '#8B5CF6',
  magicPurpleDeep: '#A855F7',
  magicGreen: '#22C55E',
  crystal: '#5BC0DE',
  placeOk: '#48BB78',
  placeBad: '#E53E3E',
  enemyGold: '#D4A843',
  enemyElite: '#E53E3E',
  bishop: '#FFD700',
  forestDark: '#1A2E1A',
  swamp: '#2A2A3D',
  plain: '#2A3D2A',
  hill: '#4A3D2A',
  mountain: '#2D3548',
  snowland: '#E8EDF5',
  water: '#1A2A4A',
};

// ===== 地形 biomes =====
export type Biome =
  | 'plain'
  | 'hill'
  | 'mountain'
  | 'snow'
  | 'water'
  | 'forest'
  | 'swamp'
  | 'canyon'
  | 'lake';

export const BIOME_COLOR: Record<Biome, string> = {
  plain: '#2A3D2A',
  hill: '#4A3D2A',
  mountain: '#2D3548',
  snow: '#E8EDF5',
  water: '#1A2A4A',
  forest: '#1A2E1A',
  swamp: '#2A2A3D',
  canyon: '#0F1520',
  lake: '#1A2A4A',
};

// ===== 区域类型 =====
export type RegionType =
  | 'core' // 魔核核心区
  | 'defense' // 魔防线区
  | 'populace' // 魔民区
  | 'workshop' // 魔工坊区
  | 'logistics' // 魔后勤区
  | 'outpost'; // 前哨腐化区

export interface RegionDef {
  id: RegionType;
  name: string;
  color: string;
  capacity: number;
  canOutsideCore: boolean; // 是否允许在魔核能量范围外
  desc: string;
}

export const REGION_DEFS: Record<RegionType, RegionDef> = {
  core: {
    id: 'core', name: '魔核核心区', color: '#8B5CF6', capacity: 3,
    canOutsideCore: false,
    desc: '要塞中心，魔核所在。必须重点保护。',
  },
  defense: {
    id: 'defense', name: '魔防线区', color: '#3B82F6', capacity: 20,
    canOutsideCore: true,
    desc: '战区外围/隘口，抵御圣战军进攻。',
  },
  populace: {
    id: 'populace', name: '魔民区', color: '#22C55E', capacity: 15,
    canOutsideCore: false,
    desc: '战区腹地，提升魔民上限与产出。',
  },
  workshop: {
    id: 'workshop', name: '魔工坊区', color: '#EAB308', capacity: 10,
    canOutsideCore: false,
    desc: '靠近资源点，产出魔晶/枯木/魔粮。',
  },
  logistics: {
    id: 'logistics', name: '魔后勤区', color: '#A855F7', capacity: 8,
    canOutsideCore: false,
    desc: '交通要道，存储与运输、提升效率。',
  },
  outpost: {
    id: 'outpost', name: '前哨腐化区', color: '#9CA3AF', capacity: 999,
    canOutsideCore: true,
    desc: '外围无人区，设置陷阱延缓敌人。',
  },
};

// ===== 建筑定义 =====
export type BuildingCategory =
  | 'core'
  | 'defense'
  | 'populace'
  | 'workshop'
  | 'logistics'
  | 'outpost';

export interface BuildingDef {
  id: string;
  name: string;
  category: BuildingCategory;
  cost: { crystal: number; wood: number; stone: number };
  hp: number;
  desc: string;
  // 行为能力
  weapon?: { damage: number; range: number; rate: number; splash?: number; vsElite?: number };
  production?: { crystal?: number; wood?: number; food?: number; stone?: number; interval: number };
  wall?: boolean; // 阻挡
  trap?: { dps: number; radius: number; slow: number };
  decoy?: boolean; // 诱饵
  popCap?: number;
  // 外观
  geometry: 'box' | 'cylinder' | 'cone' | 'sphere';
  baseColor: string;
  scale: number;
}

export const TOWER_COLORS: Record<string, string> = {};

export const BUILDING_DEFS: Record<string, BuildingDef> = {
  // ===== 魔核核心区 =====
  throne: {
    id: 'throne', name: '深渊王座', category: 'core',
    cost: { crystal: 150, wood: 100, stone: 100 }, hp: 1200,
    desc: '提升全图建筑效率 +10%。',
    geometry: 'cone', baseColor: '#8B5CF6', scale: 8,
  },
  spire: {
    id: 'spire', name: '暗影尖塔', category: 'core',
    cost: { crystal: 200, wood: 150, stone: 50 }, hp: 900,
    desc: '扩大魔核能量范围 +10。',
    geometry: 'cylinder', baseColor: '#A855F7', scale: 7,
  },
  // ===== 魔防线区 =====
  wall: {
    id: 'wall', name: '黑曜石墙', category: 'defense',
    cost: { crystal: 20, wood: 0, stone: 60 }, hp: 1500,
    desc: '阻挡敌人移动，拥有HP可被击破。',
    wall: true, geometry: 'box', baseColor: '#4A5568', scale: 6,
  },
  tower: {
    id: 'tower', name: '魔能塔', category: 'defense',
    cost: { crystal: 80, wood: 20, stone: 30 }, hp: 600,
    desc: '自动攻击范围内敌人。',
    weapon: { damage: 18, range: 70, rate: 1.0 },
    geometry: 'cylinder', baseColor: '#8B5CF6', scale: 6,
  },
  cannon: {
    id: 'cannon', name: '深渊炮台', category: 'defense',
    cost: { crystal: 150, wood: 30, stone: 60 }, hp: 800,
    desc: '高伤害慢攻速，对圣殿骑士额外伤害。',
    weapon: { damage: 70, range: 110, rate: 0.22, splash: 26, vsElite: 1.8 },
    geometry: 'box', baseColor: '#6D28D9', scale: 7,
  },
  corruption: {
    id: 'corruption', name: '腐化之地', category: 'defense',
    cost: { crystal: 60, wood: 0, stone: 10 }, hp: 400,
    desc: '敌人经过时减速并受到伤害。',
    trap: { dps: 14, radius: 30, slow: 0.45 },
    geometry: 'sphere', baseColor: '#7C3AED', scale: 4,
  },
  eye: {
    id: 'eye', name: '恶魔之眼', category: 'defense',
    cost: { crystal: 100, wood: 40, stone: 20 }, hp: 500,
    desc: '扩大周围防御建筑攻击范围。',
    geometry: 'sphere', baseColor: '#E53E3E', scale: 5,
  },
  barricade: {
    id: 'barricade', name: '骨刺拒马', category: 'defense',
    cost: { crystal: 15, wood: 30, stone: 0 }, hp: 800,
    desc: '阻挡迟缓敌人行进。',
    wall: true, geometry: 'box', baseColor: '#9CA3AF', scale: 5,
  },
  // ===== 魔民区 =====
  nest: {
    id: 'nest', name: '魔民巢穴', category: 'populace',
    cost: { crystal: 60, wood: 40, stone: 20 }, hp: 500,
    desc: '提升魔民上限。', popCap: 20,
    geometry: 'sphere', baseColor: '#22C55E', scale: 6,
  },
  granary: {
    id: 'granary', name: '魔粮仓', category: 'populace',
    cost: { crystal: 50, wood: 60, stone: 10 }, hp: 700,
    desc: '存储魔粮。',
    production: { food: 4, interval: 5 },
    geometry: 'box', baseColor: '#16A34A', scale: 6,
  },
  spring: {
    id: 'spring', name: '暗泉', category: 'populace',
    cost: { crystal: 40, wood: 30, stone: 10 }, hp: 400,
    desc: '提升魔民恢复。',
    geometry: 'cylinder', baseColor: '#0EA5E9', scale: 5,
  },
  brazier: {
    id: 'brazier', name: '魔火盆', category: 'populace',
    cost: { crystal: 20, wood: 20, stone: 0 }, hp: 300,
    desc: '小型光源。',
    geometry: 'sphere', baseColor: '#F59E0B', scale: 4,
  },
  regenpool: {
    id: 'regenpool', name: '再生池', category: 'populace',
    cost: { crystal: 80, wood: 40, stone: 30 }, hp: 900,
    desc: '治疗附近建筑。',
    geometry: 'cylinder', baseColor: '#34D399', scale: 7,
  },
  // ===== 魔工坊区 =====
  mine: {
    id: 'mine', name: '魔晶矿', category: 'workshop',
    cost: { crystal: 60, wood: 20, stone: 30 }, hp: 400,
    desc: '产出魔晶。',
    production: { crystal: 5, interval: 5 },
    geometry: 'cone', baseColor: '#5BC0DE', scale: 6,
  },
  woodcamp: {
    id: 'woodcamp', name: '枯木林场', category: 'workshop',
    cost: { crystal: 30, wood: 20, stone: 10 }, hp: 350,
    desc: '产出枯木。',
    production: { wood: 4, interval: 5 },
    geometry: 'cylinder', baseColor: '#A16207', scale: 6,
  },
  furnace: {
    id: 'furnace', name: '深渊熔炉', category: 'workshop',
    cost: { crystal: 120, wood: 40, stone: 60 }, hp: 500,
    desc: '加速魔晶产出。',
    production: { crystal: 10, interval: 5 },
    geometry: 'box', baseColor: '#F97316', scale: 7,
  },
  fungifarm: {
    id: 'fungifarm', name: '魔菌田', category: 'workshop',
    cost: { crystal: 40, wood: 30, stone: 10 }, hp: 300,
    desc: '产出魔粮。',
    production: { food: 6, interval: 5 },
    geometry: 'sphere', baseColor: '#A3E635', scale: 5,
  },
  ranch: {
    id: 'ranch', name: '魔物牧场', category: 'workshop',
    cost: { crystal: 70, wood: 50, stone: 20 }, hp: 400,
    desc: '产出魔粮。',
    production: { food: 9, interval: 5 },
    geometry: 'box', baseColor: '#84CC16', scale: 6,
  },
  // ===== 魔后勤区 =====
  vault: {
    id: 'vault', name: '深渊宝库', category: 'logistics',
    cost: { crystal: 100, wood: 50, stone: 50 }, hp: 800,
    desc: '增加资源上限。',
    geometry: 'box', baseColor: '#475569', scale: 7,
  },
  channel: {
    id: 'channel', name: '暗影通道', category: 'logistics',
    cost: { crystal: 90, wood: 60, stone: 20 }, hp: 500,
    desc: '加速资源运输。',
    geometry: 'cylinder', baseColor: '#9333EA', scale: 6,
  },
  supply: {
    id: 'supply', name: '魔能补给站', category: 'logistics',
    cost: { crystal: 110, wood: 40, stone: 40 }, hp: 600,
    desc: '提升附近建筑效率。',
    geometry: 'cone', baseColor: '#A78BFA', scale: 6,
  },
  // ===== 前哨腐化区 =====
  decoy: {
    id: 'decoy', name: '诱饵魔幡', category: 'outpost',
    cost: { crystal: 40, wood: 20, stone: 0 }, hp: 200,
    desc: '吸引敌人注意。',
    decoy: true, geometry: 'cylinder', baseColor: '#DC2626', scale: 5,
  },
};

export const BUILDING_ORDER_FOR: Record<BuildingCategory, string[]> = {
  core: ['throne', 'spire'],
  defense: ['wall', 'tower', 'cannon', 'corruption', 'eye', 'barricade'],
  populace: ['nest', 'granary', 'spring', 'brazier', 'regenpool'],
  workshop: ['mine', 'woodcamp', 'furnace', 'fungifarm', 'ranch'],
  logistics: ['vault', 'channel', 'supply'],
  outpost: ['barricade', 'decoy', 'corruption'],
};

// ===== 敌军定义 =====
export type EnemyType =
  | 'infantry' // 征召步兵
  | 'cavalry' // 轻骑兵
  | 'knight' // 圣殿骑士
  | 'siege' // 攻城车
  | 'assassin' // 盗贼刺客
  | 'bishop'; // 大主教

export interface EnemyDef {
  id: EnemyType;
  name: string;
  hp: number;
  speed: number;
  damage: number;
  radius: number;
  drop: number;
  color: string;
  tactical: 'core' | 'building' | 'bypass';
  weight: number;
}

export const ENEMY_DEFS: Record<EnemyType, EnemyDef> = {
  infantry: {
    id: 'infantry', name: '征召步兵', hp: 30, speed: 5.5, damage: 8,
    radius: 4, drop: 1, color: '#D4A843',
    tactical: 'core', weight: 1,
  },
  cavalry: {
    id: 'cavalry', name: '轻骑兵', hp: 45, speed: 11, damage: 12,
    radius: 4, drop: 2, color: '#F59E0B',
    tactical: 'core', weight: 0.6,
  },
  knight: {
    id: 'knight', name: '圣殿骑士', hp: 120, speed: 4.5, damage: 25,
    radius: 5, drop: 5, color: '#E53E3E',
    tactical: 'building', weight: 0.4,
  },
  siege: {
    id: 'siege', name: '攻城车', hp: 400, speed: 2.2, damage: 60,
    radius: 8, drop: 10, color: '#9CA3AF',
    tactical: 'building', weight: 0.12,
  },
  assassin: {
    id: 'assassin', name: '盗贼刺客', hp: 25, speed: 8, damage: 14,
    radius: 4, drop: 3, color: '#22D3EE',
    tactical: 'bypass', weight: 0.5,
  },
  bishop: {
    id: 'bishop', name: '大主教', hp: 2200, speed: 3.2, damage: 90,
    radius: 10, drop: 50, color: '#FFD700',
    tactical: 'core', weight: 0.04,
  },
};

// ===== 魔核 =====
export const CORE_START_RADIUS = 50;
export const CORE_LEVELS = 5;
export const CORE_LEVEL_COST = [0, 100, 250, 500, 1000, 2000];
export const CORE_HP = [1200, 1500, 1900, 2400, 3000, 3800];

// ===== 初始资源 =====
export interface Resources {
  crystal: number;
  wood: number;
  stone: number;
  food: number;
  pops: number;
  maxPops: number;
}

export const START_RESOURCES: Resources = {
  crystal: 120,
  wood: 50,
  stone: 50,
  food: 50,
  pops: 20,
  maxPops: 50,
};