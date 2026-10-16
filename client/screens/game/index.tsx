import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { Screen } from '@/components/Screen';
import { useGame, game, upsert, syncUI, Region as ImportedRegion, Building as ImportedBuilding } from '@/game/store';
import { generateTerrain, TerrainData } from '@/game/terrain';
import GameCanvas from '@/game/GameCanvas';
import {
  REGION_DEFS, RegionType, BUILDING_DEFS, BUILDING_ORDER_FOR, BuildingCategory,
  MAP_SIZE, CORE_HP, CORE_LEVEL_COST, ENEMY_DEFS,
} from '@/game/config';
import {
  tick, tryBuild, upgradeCore, upgradeBuilding, demolishBuilding,
  addRegion, expandRegion, skipPrep, coreRadius, resetGame,
} from '@/game/engine';
import { saveGame, loadGame, hasSave, clearSave } from '@/game/save';
import { ensureAudio, playSfx, startDrums, stopDrums } from '@/game/sfx';

// ============ 类型 ============
type RegionTypeKeys = RegionType;
const REGION_TYPES: RegionTypeKeys[] = ['core', 'defense', 'populace', 'workshop', 'logistics', 'outpost'];
const PANELS = ['战区规划', '建筑部署', '魔军调动', '资源管理', '情报中心'] as const;
type Panel = (typeof PANELS)[number];

function fmt(n: number) {
  return Math.floor(n).toString();
}

// ================= 主组件 =================
export default function GameScreen() {
  const terrainRef = useRef<TerrainData | null>(null);
  const [terrain] = useState<TerrainData | null>(() => generateTerrain(20240430));
  const loading = useGame((g) => g.loading);
  const started = useGame((g) => g.started);

  // 挂载后标记地形就绪（不调用 React setState）
  useEffect(() => {
    if (!terrain) return;
    terrainRef.current = terrain;
    upsert((g) => { g.terrainRef = terrain; g.loading = false; });
  }, [terrain]);

  // 游戏主循环
  useEffect(() => {
    if (!terrain) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      tick(dt, terrain);
      syncUI();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [terrain]);

  if (loading || !terrain) {
    return <LoadingScreen />;
  }
  if (!started) {
    return <MainMenu onStart={() => upsert((g) => { g.started = true; g.phase = 'prep'; g.elapsed = 0; })} onContinue={() => { loadGame(); }} canContinue={hasSave()} />;
  }

  return (
    <Screen backgroundColor="#0A0E1A" statusBarStyle="light">
      <View className="flex-1 bg-[#0A0E1A] relative overflow-hidden">
        {/* 3D 画布 */}
        <View className="absolute inset-0">
          <GameCanvas terrain={terrain} />
        </View>

        {/* 顶部状态栏 */}
        <TopBar />
        {/* 左侧军事部署面板 */}
        <LeftPanel />
        {/* 右侧信息面板 */}
        <RightPanel />
        {/* 底部操作栏 */}
        <BottomBar />
        {/* 小地图 */}
        <MiniMap />

        {/* 弹窗层 */}
        <CenterModals onStartWave={() => { skipPrep(); upsert((g) => { g.announce = null; g.waveResult = null; }); }} onRestart={() => resetGame()} />
      </View>
    </Screen>
  );
}

// ================= 加载 =================
function LoadingScreen() {
  return (
    <Screen backgroundColor="#0A0E1A" statusBarStyle="light">
      <View className="flex-1 items-center justify-center bg-[#0A0E1A]">
        <Text className="text-3xl font-bold text-purple-400 tracking-widest mb-4">深渊纪元</Text>
        <View className="w-48 h-1 bg-[#1A1F2E] rounded overflow-hidden">
          <View className="w-full h-full bg-purple-500 animate-pulse" />
        </View>
        <Text className="text-muted mt-4 text-sm">正在侵蚀大陆 · 生成随机地形…</Text>
      </View>
    </Screen>
  );
}

// ================= 主菜单 =================
function MainMenu({ onStart, onContinue, canContinue }: { onStart: () => void; onContinue: () => void; canContinue: boolean }) {
  return (
    <Screen backgroundColor="#0A0E1A" statusBarStyle="light">
      <View className="flex-1 items-center justify-center bg-[#0A0E1A] px-8">
        <Text className="text-5xl font-black text-purple-400 tracking-widest mb-2">深渊纪元</Text>
        <Text className="text-base text-[#4A5568] mb-10 text-center leading-6">
          超大随机地形 · 军事化部署 · 多方向防守 · 昼夜生存
        </Text>
        <TouchableOpacity onPress={() => { ensureAudio(); onStart(); }} className="w-64 py-4 rounded-lg bg-purple-600 items-center mb-4">
          <Text className="text-white font-bold text-lg">新游戏</Text>
        </TouchableOpacity>
        {canContinue && (
          <TouchableOpacity onPress={() => { onContinue(); }} className="w-64 py-4 rounded-lg bg-[#2D3548] items-center mb-4">
            <Text className="text-white font-bold text-lg">继续游戏</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => { clearSave(); }} className="w-64 py-3 rounded-lg bg-[#1A1F2E] items-center">
          <Text className="text-[#9CA3AF] text-base">查看统计</Text>
        </TouchableOpacity>
      </View>
    </Screen>
  );
}

// ================= 顶部状态栏 =================
function TopBar() {
  const res = useGame((g) => g.resources);
  const day = useGame((g) => g.day);
  const phase = useGame((g) => g.phase);
  const elapsed = useGame((g) => g.elapsed);
  const wave = useGame((g) => g.wave);
  const incoming = useGame((g) => g.incomingCount);
  const dirs = useGame((g) => g.incomingDirections);
  const rem = phase === 'day' ? Math.max(0, 120 - elapsed) : phase === 'night' ? Math.max(0, 60 - elapsed) : 0;
  const phaseName = phase === 'day' ? '白天 · 战斗' : phase === 'night' ? '夜晚 · 建造' : '准备阶段';
  const phaseCol = phase === 'day' ? 'text-amber-300' : phase === 'night' ? 'text-purple-300' : 'text-gray-300';
  return (
    <View className="absolute top-3 left-3 right-3 z-20 flex-row items-center bg-[#0A0E1A]/85 rounded-xl border border-[#2D3548] px-4 py-2.5" style={{ gap: 24 }}>
      <View>
        <Text className="text-white font-black text-lg tracking-widest">深渊要塞</Text>
        <Text className="text-[#4A5568] text-[11px] uppercase">Day {String(day).padStart(2, '0')}</Text>
      </View>
      <View className="flex-row" style={{ gap: 16 }}>
        <ResItem label="魔晶" val={fmt(res.crystal)} color="text-[#5BC0DE]" />
        <ResItem label="枯木" val={fmt(res.wood)} color="text-[#A16207]" />
        <ResItem label="魔石" val={fmt(res.stone)} color="text-[#9CA3AF]" />
        <ResItem label="魔粮" val={fmt(res.food)} color="text-[#22C55E]" />
        <ResItem label="魔民" val={`${fmt(res.pops)}/${res.maxPops}`} color="text-purple-300" />
      </View>
      <View className="ml-auto items-end">
        <Text className={`font-mono text-[11px] ${phaseCol}`}>{phaseName}</Text>
        <Text className="text-white font-mono text-[11px]">{fmt(rem)}s</Text>
        {phase === 'day' && incoming > 0 && (
          <Text className="text-amber-400 text-[11px] font-mono">来袭 {incoming} · {dirs.length}方向</Text>
        )}
      </View>
    </View>
  );
}

function ResItem({ label, val, color }: { label: string; val: string; color: string }) {
  return (
    <View className="items-center">
      <Text className={`font-mono text-lg font-bold ${color}`}>{val}</Text>
      <Text className="text-[#4A5568] text-[10px] uppercase">{label}</Text>
    </View>
  );
}

// ================= 左侧面板 =================
function LeftPanel() {
  const [panel, setPanel] = useState<Panel>('战区规划');
  const [dragType, setDragType] = useState<RegionType | null>(null);
  const [dragRect, setDragRect] = useState<{ x1: number; z1: number; x2: number; z2: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; z: number } | null>(null);
  const core = useGame((g) => g.core);
  const buildMode = useGame((g) => g.buildMode);

  // 区域拖拽放置（简化：点击两点定角）
  const startDrag = () => { enableDragHint(); setDragging(true); setDragStart(null); };

  return (
    <View className="absolute left-3 top-24 bottom-24 z-20 w-56 bg-[#0A0E1A]/88 rounded-xl border border-[#2D3548] overflow-hidden">
      {/* Tab 头 */}
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="border-b border-[#2D3548]">
          {PANELS.map((p) => (
            <TouchableOpacity
              key={p}
              onPress={() => setPanel(p)}
              className={`px-3 py-2.5 ${panel === p ? 'border-b-2 border-purple-500' : ''}`}
            >
              <Text className={`text-[11px] ${panel === p ? 'text-white font-bold' : 'text-[#4A5568]'}`}>{p}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 10 }}>
        {panel === '战区规划' && <RegionPanel core={core} onAddRegion={(t: RegionType) => setDragType(t)} buildMode={buildMode} />}
        {panel === '建筑部署' && <BuildPanel />}
        {panel === '魔军调动' && <ArmyPanel />}
        {panel === '资源管理' && <ResourcePanel />}
        {panel === '情报中心' && <IntelPanel />}
      </ScrollView>
    </View>
  );
}

function enableDragHint() {
  // 提示用户在地图上点击两点规划区域
  (game as any)._dragEnable = true;
  // 设置一个一次性多选：这里使用 regionPaint 动作
}

// 区域规划面板 —— 使用「点击地图两点确定区域」
function RegionPanel({ core, onAddRegion, buildMode }: any) {
  const [paintType, setPaintType] = useState<RegionType>('defense');
  const regions = useGame((g) => g.regions);
  return (
    <View>
      <RegionPaintCard type={paintType} setType={setPaintType} />
      <Text className="text-[#9CA3AF] text-[11px] mt-3 mb-1">已规划区域</Text>
      {regions.map((r) => (
        <View key={r.id} className="flex-row items-center justify-between py-1.5 rounded bg-[#1A1F2E] px-2 mb-1">
          <Text className="text-white text-[11px]">{REGION_DEFS[r.type].name}</Text>
          <Text className="text-[#4A5568] text-[10px] font-mono">{fmt(Math.abs(r.x2 - r.x1) * Math.abs(r.z2 - r.z1) / 10000)}㎡</Text>
        </View>
      ))}
      <Text className="text-[#4A5568] text-[10px] mt-2 leading-4">
        Tip: 点击地图上两个点，即可拖拽规划一个{REGION_DEFS[paintType].name}。
      </Text>
    </View>
  );
}

// 区域规划绘制卡片
function RegionPaintCard({ type, setType }: { type: RegionType; setType: (t: RegionType) => void }) {
  return (
    <View>
      <Text className="text-white text-sm font-bold mb-2">区域规划</Text>
      <View className="flex-row flex-wrap" style={{ gap: 6 }}>
        {REGION_TYPES.map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => { setType(t); game['_paintType'] = t; upsert((g) => { g.buildMode = null; g._regionPaint = t; }); }}
            className={`px-2 py-1.5 rounded-md border ${type === t ? 'border-purple-500 bg-purple-500/20' : 'border-[#2D3548]'}`}
          >
            <Text className="text-[10px] text-white" style={{ color: REGION_DEFS[t].color }}>{REGION_DEFS[t].name}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity
        onPress={() => { game['_regionPaint'] = 'active'; upsert((g) => { g._regionPaintMsg = '请在地图上点击两点规划区域'; }); playSfx('place'); }}
        className="mt-3 py-2.5 rounded-md bg-purple-600 items-center"
      >
        <Text className="text-white text-[12px] font-bold">在地图上绘制区域</Text>
      </TouchableOpacity>
      <Text className="text-[#4A5568] text-[10px] mt-1.5">先选类型 → 点击”绘制“ → 地图上点两点</Text>
    </View>
  );
}

// 建筑部署面板
function BuildPanel() {
  const [cat, setCat] = useState<BuildingCategory>('defense');
  const buildMode = useGame((g) => g.buildMode);
  const cats: { id: BuildingCategory; name: string }[] = [
    { id: 'core', name: '魔核区' }, { id: 'defense', name: '魔防线' },
    { id: 'populace', name: '魔民区' }, { id: 'workshop', name: '魔工坊' },
    { id: 'logistics', name: '魔后勤' }, { id: 'outpost', name: '前哨腐化' },
  ];
  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2">
        {cats.map((c) => (
          <TouchableOpacity key={c.id} onPress={() => setCat(c.id)}
            className={`px-3 py-1.5 mr-2 rounded-md ${cat === c.id ? 'bg-purple-600' : 'bg-[#1A1F2E]'}`}>
            <Text className="text-[11px] text-white">{c.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {BUILDING_ORDER_FOR[cat].map((id) => {
        const def = BUILDING_DEFS[id];
        const active = buildMode?.defId === id;
        return (
          <TouchableOpacity
            key={id}
            onPress={() => { upsert((g) => { g.buildMode = active ? null : { defId: id }; g._buildMsg = active ? null : `点击地图放置 ${def.name}`; }); playSfx('place'); }}
            className={`mb-2 p-2.5 rounded-lg border ${active ? 'border-purple-500 bg-purple-500/20' : 'border-[#2D3548] bg-[#1A1F2E]'}`}
          >
            <View className="flex-row justify-between items-center">
              <Text className="text-white text-[12px] font-bold">{def.name}</Text>
              <Text className="text-[#5BC0DE] text-[10px] font-mono">{def.cost.crystal}魔</Text>
            </View>
            <Text className="text-[#4A5568] text-[10px] mt-0.5">{def.desc}</Text>
            {active && <Text className="text-purple-300 text-[10px] mt-1">点击地图放置（右键/ESC取消）</Text>}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// 魔军调动
function ArmyPanel() {
  const enemies = useGame((g) => g.enemies);
  const count: Record<string, number> = {};
  enemies.forEach((e) => { count[e.type] = (count[e.type] || 0) + 1; });
  return (
    <View>
      <Text className="text-white text-sm font-bold mb-2">当前圣战军</Text>
      {(Object.keys(ENEMY_DEFS) as (keyof typeof ENEMY_DEFS)[]).map((t) => (
        <View key={t} className="flex-row justify-between py-1.5 border-b border-[#1A1F2E]">
          <Text className="text-white text-[11px]">{ENEMY_DEFS[t].name}</Text>
          <Text className={`font-mono text-[11px] ${(count[t] || 0) > 0 ? 'text-amber-400' : 'text-[#4A5568]'}`}>{count[t] || 0}</Text>
        </View>
      ))}
      <Text className="text-[#4A5568] text-[10px] mt-2">圣战军白天从多个方向进攻。</Text>
    </View>
  );
}

// 资源管理
function ResourcePanel() {
  const res = useGame((g) => g.resources);
  const core = useGame((g) => g.core);
  return (
    <View>
      <Text className="text-white text-sm font-bold mb-2">资源</Text>
      {([['魔晶', res.crystal, '#5BC0DE'], ['枯木', res.wood, '#A16207'], ['魔石', res.stone, '#9CA3AF'], ['魔粮', res.food, '#22C55E']] as const).map(([k, v, c]) => (
        <View key={k} className="flex-row justify-between py-1.5 border-b border-[#1A1F2E]">
          <Text className="text-white text-[11px]">{k}</Text>
          <Text className="font-mono text-[11px]" style={{ color: c }}>{fmt(v)}</Text>
        </View>
      ))}
      <Text className="text-white text-sm font-bold mt-4 mb-1">魔核</Text>
      <Text className="text-white text-[12px]">等级 Lv.{core.level} / {CORE_HP.length - 1}</Text>
      <Text className="text-[#4A5568] text-[11px]">能量半径 {coreRadius(core.level)}</Text>
      <TouchableOpacity
        onPress={() => { const r = upgradeCore(); if (r.ok) upsert((g) => { g.selection = { kind: 'core' }; }); }}
        className="mt-3 py-2.5 rounded-md bg-purple-600 items-center"
      >
        <Text className="text-white text-[12px] font-bold">升级魔核 ({CORE_LEVEL_COST[core.level] || '-'}魔晶)</Text>
      </TouchableOpacity>
    </View>
  );
}

// 情报中心
function IntelPanel() {
  const stats = useGame((g) => g.stats);
  const day = useGame((g) => g.day);
  return (
    <View>
      <Text className="text-white text-sm font-bold mb-2">情报</Text>
      <StatRow label="存活天数" val={fmt(day)} />
      <StatRow label="击杀总数" val={fmt(Object.values(stats.kills).reduce((a, b) => a + b, 0))} />
      <StatRow label="建造建筑" val={fmt(stats.buildingsBuilt)} />
      <StatRow label="规划面积" val={`${fmt(stats.totalArea)}㎡`} />
      <StatRow label="魔核最高" val={`Lv.${stats.maxCoreLevel}`} />
    </View>
  );
}
function StatRow({ label, val }: { label: string; val: string }) {
  return (
    <View className="flex-row justify-between py-1.5 border-b border-[#1A1F2E]">
      <Text className="text-[#4A5568] text-[11px]">{label}</Text>
      <Text className="text-white font-mono text-[11px]">{val}</Text>
    </View>
  );
}

// ================= 右侧信息面板 =================
function RightPanel() {
  const sel = useGame((g) => g.selection);
  const regions = useGame((g) => g.regions);
  const buildings = useGame((g) => g.buildings);
  const core = useGame((g) => g.core);

  // 未选中 -> 总览
  if (!sel.kind || sel.kind === 'terrain') {
    const defArea = regions.reduce((s, r) => s + Math.abs(r.x2 - r.x1) * Math.abs(r.z2 - r.z1) / 10000, 0);
    const totalHp = buildings.reduce((s, b) => s + b.maxHp, 0);
    return (
      <View className="absolute right-3 top-24 z-20 w-60 bg-[#0A0E1A]/88 rounded-xl border border-[#2D3548] p-4">
        <Text className="text-white font-bold text-base mb-3">战区总览</Text>
        <StatRow label="总面积" val={`${MAP_SIZE}×${MAP_SIZE}`} />
        <StatRow label="已规划区域" val={`${fmt(regions.length)}`} />
        <StatRow label="总建筑数" val={`${fmt(buildings.length)}`} />
        <StatRow label="魔核等级" val={`Lv.${core.level}`} />
        <StatRow label="预计防御力" val={`${fmt(totalHp)} HP`} />
        <Text className="text-[#4A5568] text-[11px] mt-3">点击地图上区域或建筑查看详情</Text>
      </View>
    );
  }
  if (sel.kind === 'region') {
    const r = regions.find((x) => x.id === sel.id);
    if (r) return <RegionInfo r={r} />;
  }
  if (sel.kind === 'building') {
    const b = buildings.find((x) => x.uid === sel.id);
    if (b) return <BuildingInfo b={b} />;
  }
  if (sel.kind === 'core') {
    return (
      <View className="absolute right-3 top-24 z-20 w-60 bg-[#0A0E1A]/88 rounded-xl border border-purple-500/50 p-4">
        <Text className="text-purple-300 font-bold text-base mb-2">魔核核心</Text>
        <View className="mb-2">
          <View className="h-2 bg-[#1A1F2E] rounded overflow-hidden">
            <View className="h-full bg-purple-500" style={{ width: `${(core.hp / core.maxHp) * 100}%` }} />
          </View>
          <Text className="text-white font-mono text-[11px] mt-1">{fmt(core.hp)} / {fmt(core.maxHp)} HP</Text>
        </View>
        <StatRow label="能量半径" val={`${fmt(coreRadius(core.level))}`} />
        <StatRow label="魔核等级" val={`Lv.${core.level}`} />
        <TouchableOpacity onPress={() => upgradeCore()} className="mt-3 py-2 rounded-md bg-purple-600 items-center">
          <Text className="text-white text-[12px] font-bold">升级 ({CORE_LEVEL_COST[core.level] || '-'}魔晶)</Text>
        </TouchableOpacity>
      </View>
    );
  }
  return null;
}

function RegionInfo({ r }: { r: ImportedRegion }) {
  const def = REGION_DEFS[r.type];
  const buildings = useGame((g) => g.buildings);
  const inRegion = buildings.filter((b) => b.regionId === r.id);
  const cap = r.maxCapacity || def.capacity;
  return (
    <View className="absolute right-3 top-24 z-20 w-60 bg-[#0A0E1A]/88 rounded-xl border border-[#2D3548] p-4">
      <Text className="font-bold text-base mb-1" style={{ color: def.color }}>{def.name}</Text>
      <Text className="text-[#4A5568] text-[11px] leading-4 mb-3">{def.desc}</Text>
      <StatRow label="面积" val={`${fmt(Math.abs(r.x2 - r.x1) * Math.abs(r.z2 - r.z1) / 10000)}㎡`} />
      <StatRow label="建筑" val={`${fmt(inRegion.length)}/${cap}`} />
      <StatRow label="加成" val={bonusText(r.type)} />
      <Text className="text-white text-[12px] font-bold mt-3 mb-1">区域内建筑</Text>
      {inRegion.map((b) => <Text key={b.uid} className="text-white text-[10px]">{BUILDING_DEFS[b.defId].name}</Text>)}
      <TouchableOpacity
        onPress={() => { expandRegion(r.id); upsert((g) => { g.selection = { kind: 'region', id: r.id }; }); }}
        className="mt-3 py-2 rounded-md bg-[#2D3548] items-center">
        <Text className="text-white text-[12px] font-bold">扩建 (40魔)</Text>
      </TouchableOpacity>
    </View>
  );
}

function bonusText(t: string) {
  switch (t) {
    case 'defense': return '防御协同';
    case 'workshop': return '产出协同';
    case 'populace': return '魔民产出';
    case 'logistics': return '效率协同';
    case 'outpost': return '陷阱伤害';
    case 'core': return '全图HP提升';
    default: return '—';
  }
}

function BuildingInfo({ b }: { b: any }) {
  const def = BUILDING_DEFS[b.defId];
  const sel = useGame((g) => g.selection);
  return (
    <View className="absolute right-3 top-24 z-20 w-60 bg-[#0A0E1A]/88 rounded-xl border border-[#2D3548] p-4">
      <Text className="text-white font-bold text-base mb-1">{def.name}</Text>
      <Text className="text-[#4A5568] text-[11px] leading-4 mb-3">{def.desc}</Text>
      <StatRow label="HP" val={`${fmt(b.hp)}/${fmt(b.maxHp)}`} />
      <StatRow label="等级" val={`Lv.${b.level}`} />
      {def.weapon && <StatRow label="攻击" val={`${fmt(def.weapon.damage)}·${fmt(def.weapon.range)}m`} />}
      <View className="flex-row mt-3" style={{ gap: 8 }}>
        <TouchableOpacity onPress={() => { const r = upgradeBuilding(b.uid); if (r.ok) upsert((g) => { g.selection = { kind: 'building', id: b.uid }; }); }}
          className="flex-1 py-2 rounded-md bg-[#2D3548] items-center">
          <Text className="text-white text-[11px] font-bold">升级</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { demolishBuilding(b.uid); upsert((g) => { g.selection = { kind: null }; }); }}
          className="flex-1 py-2 rounded-md bg-red-900/60 items-center">
          <Text className="text-red-300 text-[11px] font-bold">拆除</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ================= 底部操作栏 =================
function BottomBar() {
  const paused = useGame((g) => g.paused);
  const phase = useGame((g) => g.phase);
  const onArea = () => { upsert((g) => { g._regionPaint = 'active'; });
    if (game['_regionPaint'] !== 'active') { upsert((g) => { g._regionPaint = 'active'; }); } };
  const onBuild = () => { upsert((g) => { g.buildMode = g.buildMode ? null : { defId: 'tower' }; }); };
  const onDemo = () => { upsert((g) => { g.buildMode = null; g._regionPaint = null; }); };
  const onReset = () => { upsert((g) => { g.cameraTarget = { x: 0, z: 0 }; }); };
  const onDemolish = () => {
    const sel = game.selection;
    if (sel && sel.kind === 'building') { demolishBuilding(sel.id!); upsert((g) => { g.selection = { kind: null }; }); }
    else alert('请先选中一个建筑，再点击拆除');
  };
  const btn = (label: string, active: boolean, action: () => void) => (
    <TouchableOpacity key={label} onPress={action}
      className={`px-3.5 py-2 rounded-md ${active ? 'bg-purple-600' : 'bg-[#1A1F2E] border border-[#2D3548]'}`}>
      <Text className={`text-[12px] ${active ? 'text-white font-bold' : 'text-[#9CA3AF]'}`}>{label}</Text>
    </TouchableOpacity>
  );
  return (
    <View className="absolute bottom-3 left-3 right-3 z-20 flex-row items-center justify-center bg-[#0A0E1A]/85 rounded-xl border border-[#2D3548] px-3 py-2" style={{ gap: 8 }}>
      {btn('区域规划', false, onArea)}
      {btn('建造', false, onBuild)}
      {btn('拆除', false, onDemolish)}
      {btn(paused ? '加速' : '暂停', paused, () => upsert((g) => { g.paused = !g.paused; }))}
      {btn('视角复位', false, onReset)}
      {btn('存盘', false, () => { saveGame(); })}
    </View>
  );
}

// ================= 小地图 =================
function MiniMap() {
  const regions = useGame((g) => g.regions);
  const enemies = useGame((g) => g.enemies);
  const core = useGame((g) => g.core);
  const dirs = useGame((g) => g.incomingDirections);
  const phase = useGame((g) => g.phase);
  if (Platform.OS === 'web' && typeof window !== 'undefined' && (window as any).innerWidth < 480) return null;
  const size = 132;
  const toPx = (v: number) => ((v / MAP_SIZE) * 0.5 + 0.5) * size;
  const colors: Record<string, string> = {
    core: '#8B5CF6', defense: '#3B82F6', populace: '#22C55E', workshop: '#EAB308',
    logistics: '#A855F7', outpost: '#9CA3AF',
  };
  return (
    <View className="absolute bottom-16 left-3 z-20 bg-[#0A0E1A]/90 rounded-lg border border-[#2D3548] p-2"
      style={{ width: size + 16, height: size + 16 }}>
      <View style={{ width: size, height: size }} className="relative overflow-hidden rounded bg-[#1A1F2E]">
        {regions.map((r) => (
          <View key={r.id} style={{
            position: 'absolute',
            left: toPx(Math.min(r.x1, r.x2)), top: toPx(Math.min(r.z1, r.z2)),
            width: Math.max(2, toPx(Math.max(r.x1, r.x2)) - toPx(Math.min(r.x1, r.x2))),
            height: Math.max(2, toPx(Math.max(r.z1, r.z2)) - toPx(Math.min(r.z1, r.z2))),
            backgroundColor: colors[r.type],
            opacity: 0.4,
          }} />
        ))}
        {/* 核心 */}
        <View style={{ position: 'absolute', left: toPx(core.x) - 4, top: toPx(core.z) - 4, width: 8, height: 8, borderRadius: 4, backgroundColor: '#8B5CF6' }} />
        {/* 来袭方向箭头 */}
        {dirs.map((d, i) => (
          <View key={i} style={{
            position: 'absolute',
            left: toPx(Math.cos((d.dir / 8) * Math.PI * 2) * MAP_SIZE * 0.5) - 2,
            top: toPx(Math.sin((d.dir / 8) * Math.PI * 2) * MAP_SIZE * 0.5) - 2,
            width: 4, height: 4, borderRadius: 2, backgroundColor: '#D4A843',
          }} />
        ))}
        {/* 敌人 */}
        {enemies.map((e) => (
          <View key={e.uid} style={{ position: 'absolute', left: toPx(e.x) - 1.5, top: toPx(e.z) - 1.5, width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#D4A843' }} />
        ))}
      </View>
      <Text className="text-[#4A5568] text-[9px] text-center mt-1 font-mono">MIMIC · 战略小地图</Text>
    </View>
  );
}

// ================= 弹窗层 =================
function CenterModals({ onStartWave, onRestart }: { onStartWave: () => void; onRestart: () => void }) {
  const announce = useGame((g) => g.announce);
  const waveResult = useGame((g) => g.waveResult);
  const gameOver = useGame((g) => g.gameOver);
  const day = useGame((g) => g.day);
  const stats = useGame((g) => g.stats);
  const res = useGame((g) => g.resources);

  if (gameOver) {
    return (
      <View className="absolute inset-0 z-50 items-center justify-center bg-black/80">
        <Text className="text-red-500 text-4xl font-black mb-2">魔渊陷落</Text>
        <Text className="text-[#9CA3AF] mb-6">魔核能量耗尽，深渊灯火熄灭。</Text>
        <View className="w-64 bg-[#1A1F2E] rounded-xl p-4 mb-6">
          <StatRow label="存活天数" val={`${fmt(day - 1)}`} />
          <StatRow label="击杀总数" val={`${fmt(Object.values(stats.kills).reduce((a, b) => a + b, 0))}`} />
          <StatRow label="建造建筑" val={`${fmt(stats.buildingsBuilt)}`} />
          <StatRow label="规划面积" val={`${fmt(stats.totalArea)}㎡`} />
        </View>
        <TouchableOpacity onPress={onRestart} className="px-8 py-3 rounded-lg bg-purple-600">
          <Text className="text-white font-bold">重新开始</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (announce === 'prep' || announce === 'prep-bishop') {
    const isBoss = announce === 'prep-bishop';
    return (
      <View className="absolute inset-0 z-50 items-center justify-center bg-black/70">
        <View className="bg-[#101426] rounded-2xl border border-[#2D3548] w-80 p-6">
          <Text className="text-purple-300 text-lg font-black mb-1 text-center">
            {isBoss ? '大主教来袭' : `DAY ${String(day - 1)} 战斗结束`}
          </Text>
          <Text className="text-[#4A5568] text-center text-[11px] mb-4">圣战军退却，深渊获得喘息</Text>
          {waveResult && (
            <View className="mb-4">
              <Text className="text-white text-[12px] font-bold mb-1">本波战果</Text>
              {waveResult.kills.map((k) => (
                <Text key={k.type} className="text-[#9CA3AF] text-[11px]">
                  {ENEMY_DEFS[k.type].name} ×{k.count}（+{fmt(k.crystal)}魔晶）
                </Text>
              ))}
              <StatRow label="获得魔晶" val={`+${fmt(waveResult.totalCrystal)}`} />
              <StatRow label="损失建筑" val={`${fmt(waveResult.lostBuildings)}`} />
              <StatRow label="魔核受创" val={`${fmt(waveResult.coreDamage)}`} />
            </View>
          )}
          <View className="flex-row" style={{ gap: 8 }}>
            <TouchableOpacity onPress={onStartWave}
              className="flex-1 py-2.5 rounded-lg bg-purple-600 items-center">
              <Text className="text-white font-bold text-[13px]">夜幕降临</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  if (announce === 'continue') {
    return (
      <View className="absolute inset-0 z-50 items-center justify-center bg-black/80">
        <Text className="text-amber-300 text-2xl font-black mb-3">存档已载入</Text>
        <Text className="text-white mb-1">当前第 {day} 天</Text>
        <TouchableOpacity onPress={() => { upsert((g) => { g.announce = null; }); }}
          className="mt-4 px-8 py-3 rounded-lg bg-purple-600">
          <Text className="text-white font-bold">继续建造</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return null;
}

// reset game view helper
function resetGameView() {
  resetGame();
  upsert((g) => { g.started = true; g.phase = 'prep'; g.elapsed = 0; g.loading = false; });
}