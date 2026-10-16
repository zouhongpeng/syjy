/* eslint-disable react/no-unknown-property */
import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { TerrainData } from './terrain';
import { MAP_SIZE, BIOME_COLOR, Biome, COLORS, RegionType } from './config';
import { useGame, game, upsert, Region, Building, Enemy } from './store';
import { addRegion, tryBuild } from './engine';

// 确定性伪随机（用于渲染期，避免 impure 函数调用）
function hash1(x: number, z: number) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// =================== 地形网格 ===================
function TerrainMesh({ terrain, onGroundMove, onGroundClick }: {
  terrain: TerrainData;
  onGroundMove?: (p: { x: number; z: number }) => void;
  onGroundClick?: (p: { x: number; z: number }) => void;
}) {
  const geom = useMemo(() => {
    const size = terrain.size;
    const g = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, size - 1, size - 1);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = terrain.heightAt(x, z);
      pos.setY(i, h);
      const bio = terrain.biomeAt(x, z);
      const c = new THREE.Color(BIOME_COLOR[bio]);
      // 噪声扰动颜色（确定性 hash）
      c.multiplyScalar(0.85 + hash1(x, z) * 0.3);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, [terrain]);

  return (
    <mesh
      geometry={geom}
      receiveShadow
      onPointerMove={(e) => { if (onGroundMove) onGroundMove({ x: e.point.x, z: e.point.z }); }}
      onClick={(e) => { if (onGroundClick) { e.stopPropagation(); onGroundClick({ x: e.point.x, z: e.point.z }); } }}
    >
      <meshStandardMaterial vertexColors roughness={1} metalness={0.1} />
    </mesh>
  );
}

// =================== 水域 ===================
function WaterMesh({ terrain }: { terrain: TerrainData }) {
  const ref = useRef<THREE.Mesh>(null);
  const geometry = useMemo(() => {
    const size = terrain.size;
    const g = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, size - 1, size - 1);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const bio = terrain.biomeAt(x, z);
      if (bio === 'water' || bio === 'lake') pos.setY(i, 6.2);
      else pos.setY(i, -100); // 沉到地下
    }
    return g;
  }, [terrain]);
  useFrame((state) => {
    if (ref.current) {
      (ref.current.material as THREE.MeshStandardMaterial).opacity = 0.75;
    }
  });
  return (
    <mesh ref={ref} geometry={geometry}>
      <meshStandardMaterial color={COLORS.water} transparent opacity={0.75} roughness={0.3} metalness={0.4} />
    </mesh>
  );
}

// =================== 森林 InstancedMesh ===================
const TREES = 180;
function ForestMesh({ terrain }: { terrain: TerrainData }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const placesRef = useRef<{ x: number; z: number; s: number; c: number }[]>([]);

  useEffect(() => {
    const arr: { x: number; z: number; s: number; c: number }[] = [];
    let guard = 0;
    while (arr.length < TREES && guard++ < 8000) {
      const x = (Math.random() - 0.5) * MAP_SIZE;
      const z = (Math.random() - 0.5) * MAP_SIZE;
      const bio = terrain.biomeAt(x, z);
      if (bio === 'forest') {
        arr.push({ x, z, s: 3 + Math.random() * 4, c: 0.5 + Math.random() * 0.5 });
      }
    }
    placesRef.current = arr;
    if (!ref.current) return;
    const dummy = new THREE.Object3D();
    arr.forEach((p, i) => {
      const h = terrain.heightAt(p.x, p.z);
      dummy.position.set(p.x, h + p.s * 0.8, p.z);
      dummy.scale.setScalar(p.s);
      dummy.updateMatrix();
      ref.current!.setMatrixAt(i, dummy.matrix);
      ref.current!.setColorAt(i, new THREE.Color(0x1a4a1a).multiplyScalar(p.c));
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [terrain]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, TREES]}>
      <coneGeometry args={[1, 2.4, 6]} />
      <meshStandardMaterial roughness={1} />
    </instancedMesh>
  );
}

// =================== 区域平面 ===================
function RegionQuad({ r }: { r: Region }) {
  const col = useMemo(() => {
    // 根据类型取色
    const map: Record<string, string> = {
      core: '#8B5CF6', defense: '#3B82F6', populace: '#22C55E',
      workshop: '#EAB308', logistics: '#A855F7', outpost: '#9CA3AF',
    };
    return new THREE.Color(map[r.type]);
  }, [r.type]);
  return (
    <mesh
      position={[(r.x1 + r.x2) / 2, 1.0, (r.z1 + r.z2) / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
      onClick={(e) => { e.stopPropagation(); upsert((g) => { g.selection = { kind: 'region', id: r.id }; }); }}
    >
      <planeGeometry args={[Math.abs(r.x2 - r.x1), Math.abs(r.z2 - r.z1)]} />
      <meshBasicMaterial color={col} transparent opacity={0.28} depthWrite={false} />
    </mesh>
  );
}

// =================== 建筑 ===================
function bboxGeom(radius: number) {
  // 简化的建筑几何：统一用 box + 顶部装饰，按 scale 区分
  return null;
}

function BuildingMesh({ b }: { b: Building }) {
  const ref = useRef<THREE.Group>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.position.y = -20;
      ref.current.scale.setScalar(0.01);
    }
  }, []);
  useFrame((state, dt) => {
    if (ref.current) {
      const targetY = 6;
      ref.current.position.y += (targetY - ref.current.position.y) * Math.min(1, dt * 4);
      ref.current.scale.multiplyScalar(1 + (1 - ref.current.scale.x) * Math.min(1, dt * 3));
    }
  });
  // 高度
  const color = '#4A5568';
  return (
    <group
      ref={ref}
      position={[b.x, 6, b.z]}
      onClick={(e) => { e.stopPropagation(); upsert((g) => { g.selection = { kind: 'building', id: b.uid }; }); }}
    >
      <mesh castShadow position={[0, 3, 0]}>
        <boxGeometry args={[10, 6, 10]} />
        <meshStandardMaterial color={color} roughness={0.6} metalness={0.2} />
      </mesh>
      <mesh position={[0, 8, 0]}>
        <boxGeometry args={[6, 2, 6]} />
        <meshStandardMaterial color="#8B5CF6" emissive="#8B5CF6" emissiveIntensity={0.4} />
      </mesh>
      {b.level > 1 && (
        <mesh position={[0, 11, 0]}>
          <boxGeometry args={[3, 4, 3]} />
          <meshStandardMaterial color="#EAB308" emissive="#EAB308" emissiveIntensity={0.5} />
        </mesh>
      )}
    </group>
  );
}

// =================== 魔核核心 ===================
function CoreMesh() {
  const core = useGame((g) => g.core);
  const level = core.level;
  const radius = 50 + (level - 1) * 10;
  const flame = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const sel = useGame((g) => g.selection);
  useFrame((state, dt) => {
    if (flame.current) flame.current.rotation.y += dt * 0.8;
    if (ring.current) {
      ring.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 1.5) * 0.06);
    }
  });
  return (
    <group
      position={[core.x, 0, core.z]}
      onClick={(e) => { e.stopPropagation(); upsert((g) => { g.selection = { kind: 'core' }; }); }}
    >
      {/* 能量范围光圈 */}
      <mesh
        ref={ring}
        position={[0, 1, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[radius * 0.96, radius, 48]} />
        <meshBasicMaterial color="#8B5CF6" transparent opacity={0.45} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.6, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[radius, 36]} />
        <meshBasicMaterial color="#8B5CF6" transparent opacity={0.08} depthWrite={false} />
      </mesh>
      {/* 魔核体 */}
      <mesh ref={flame} position={[0, 12, 0]} castShadow>
        <sphereGeometry args={[12 * (1 + level * 0.15), 24, 24]} />
        <meshStandardMaterial color="#8B5CF6" emissive="#A855F7" emissiveIntensity={1 + level * 0.2} />
      </mesh>
      {/* 燃烧火焰粒子光点 */}
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[Math.sin(i * 1.7) * 4, 20 + i * 2, Math.cos(i * 1.7) * 4]}>
          <sphereGeometry args={[1.5, 8, 8]} />
          <meshBasicMaterial color="#F5D0FE" transparent opacity={0.7} />
        </mesh>
      ))}
    </group>
  );
}

// =================== 敌人 ===================
function EnemyMesh({ e }: { e: Enemy }) {
  const ref = useRef<THREE.Group>(null);
  const color = useMemo(() => {
    const map: Record<string, string> = {
      infantry: '#D4A843', cavalry: '#F59E0B', knight: '#E53E3E',
      siege: '#9CA3AF', assassin: '#22D3EE', bishop: '#FFD700',
    };
    return map[e.type];
  }, [e.type]);
  useFrame(() => {
    if (ref.current) {
      ref.current.position.x = e.x;
      ref.current.position.z = e.z;
      ref.current.position.y = 5;
    }
  });
  return (
    <group ref={ref}>
      <mesh castShadow>
        <coneGeometry args={[e.type === 'siege' ? 7 : 4, e.type === 'siege' ? 10 : 7, 6]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} />
      </mesh>
      {/* HP 条 */}
      {e.hp < e.maxHp && (
        <mesh position={[0, 10, 0]}>
          <planeGeometry args={[8, 1]} />
          <meshBasicMaterial color="#222" side={THREE.DoubleSide} transparent opacity={0.8} depthTest={false} />
        </mesh>
      )}
    </group>
  );
}

function Projectiles() {
  const list = useGame((g) => g.projectiles);
  return (
    <>
      {list.map((p) => {
        const x = p.sx + (p.tx - p.sx) * (p.t / p.dur);
        const z = p.sz + (p.tz - p.sz) * (p.t / p.dur);
        return (
          <mesh key={p.uid} position={[x, 14, z]}>
            <sphereGeometry args={[1.2, 8, 8]} />
            <meshBasicMaterial color="#C4B5FD" />
          </mesh>
        );
      })}
    </>
  );
}

function Particles() {
  const list = useGame((g) => g.particles);
  return (
    <>
      {list.map((p) => (
        <mesh key={p.uid} position={[p.x, p.y, p.z]}>
          <sphereGeometry args={[p.size, 6, 6]} />
          <meshBasicMaterial color={p.color} transparent opacity={1 - p.t / p.life} />
        </mesh>
      ))}
    </>
  );
}

// =================== 交互层 ===================
function InteractionLayer({ terrain }: { terrain: TerrainData }) {
  const buildMode = useGame((g) => g.buildMode);
  const paintActive = useGame((g) => g._regionPaint);
  const [regionPts, setRegionPts] = useState<{ x: number; z: number }[]>([]);
  const [preview, setPreview] = useState<{ x: number; z: number; ok: boolean } | null>(null);

  // 画地区类型（“区域规划”面板选中的类型）
  const paintTypeRef = useRef<string>('defense');
  useEffect(() => {
    paintTypeRef.current = (game as any)._paintType || 'defense';
  }, [paintActive, (game as any)._paintType]);

  const onGroundMove = useCallback((p: { x: number; z: number }) => {
    if (!buildMode) { setPreview(null); return; }
    // 颜色由 tryBuild 判断是否可放置
    const r = tryBuild(buildMode.defId, p.x, p.z, terrain);
    setPreview({ x: p.x, z: p.z, ok: r.ok });
  }, [buildMode, terrain]);

  const onGroundClick = useCallback((p: { x: number; z: number }) => {
    // 画区域
    if (paintActive === 'active') {
      if (regionPts.length === 0) {
        setRegionPts([p]);
        return;
      }
      const a = regionPts[0];
      const type = paintTypeRef.current as RegionType;
      const rz = addRegion({ type, x1: a.x, z1: a.z - 20, x2: p.x, z2: p.z + 20 });
      if (rz.ok) {
        upsert((g) => { g._regionPaint = null; g._regionPaintMsg = null; });
        setRegionPts([]);
      }
      return;
    }
    // 建造
    if (buildMode) {
      const r = tryBuild(buildMode.defId, p.x, p.z, terrain);
      if (r.ok) {
        upsert((g) => { g.buildMode = null; g.buildMode = null; g._buildMsg = null; });
        setPreview(null);
      }
      return;
    }
    // 否则点击地形清除选中
    upsert((g) => { g.selection = { kind: 'terrain' }; });
  }, [paintActive, buildMode, regionPts, terrain]);

  // ESC 取消
  useEffect(() => {
    const onKey = (ev: any) => {
      if (ev.key === 'Escape') {
        upsert((g) => { g.buildMode = null; g._regionPaint = null; g._regionPaintMsg = null; });
        setRegionPts([]);
        setPreview(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      {/* 区域第一点指示 */}
      {regionPts[0] && (
        <mesh position={[regionPts[0].x, terrain.heightAt(regionPts[0].x, regionPts[0].z) + 4, regionPts[0].z]}>
          <sphereGeometry args={[6, 10, 10]} />
          <meshBasicMaterial color="#48BB78" transparent opacity={0.6} />
        </mesh>
      )}
      {/* 建造预览 */}
      {buildMode && preview && (
        <mesh position={[preview.x, terrain.heightAt(preview.x, preview.z) + 6, preview.z]}>
          <boxGeometry args={[10, 12, 10]} />
          <meshBasicMaterial color={preview.ok ? '#48BB78' : '#E53E3E'} transparent opacity={0.35} />
        </mesh>
      )}
      <TerrainMesh
        terrain={terrain}
        onGroundMove={onGroundMove}
        onGroundClick={onGroundClick}
      />
    </>
  );
}

function SceneContent({ terrain }: { terrain: TerrainData }) {
  const regions = useGame((g) => g.regions);
  const buildings = useGame((g) => g.buildings);
  const enemies = useGame((g) => g.enemies);
  const core = useGame((g) => g.core);
  const phase = useGame((g) => g.phase);

  const skyCol = phase === 'day' ? new THREE.Color('#1a3a2a') : new THREE.Color('#0A0E1A');
  const fogCol = phase === 'day' ? '#142a20' : '#0A0E1A';

  return (
    <>
      <ambientLight intensity={phase === 'day' ? 0.6 : 0.18} />
      <hemisphereLight args={[fogCol, '#0A0E1A', phase === 'day' ? 0.6 : 0.2]} />
      <directionalLight
        position={[100, 200, 60]}
        intensity={phase === 'day' ? 1.4 : 0.5}
        color={phase === 'day' ? '#ffffff' : '#8B5CF6'}
      />
      {/* 魔核紫色氛围光 */}
      <pointLight position={[core.x, 40, core.z]} intensity={phase === 'night' ? 3.5 : 1.2} color="#A855F7" distance={200} />
      <fog attach="fog" args={[fogCol, 250, 1100]} />
      <color attach="background" args={[skyCol]} />

      <WaterMesh terrain={terrain} />
      <ForestMesh terrain={terrain} />
      {regions.map((r) => <RegionQuad key={r.id} r={r} />)}
      {buildings.map((b) => <BuildingMesh key={b.uid} b={b} />)}
      <CoreMesh />
      {enemies.map((e) => <EnemyMesh key={e.uid} e={e} />)}
      <Projectiles />
      <Particles />
      {/* 地形 + 交互（地形网格附带建造/区域点击事件） */}
      <InteractionLayer terrain={terrain} />
    </>
  );
}

// =================== Canvas 导出 ===================
export default function GameCanvas({ terrain }: { terrain: TerrainData }) {
  return (
    <Canvas
      camera={{ position: [0, 320, 420], fov: 50, near: 1, far: 2500 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true }}
    >
      <SceneContent terrain={terrain} />
      <OrbitControls
        enableDamping
        dampingFactor={0.08}
        maxPolarAngle={Math.PI / 2.5}
        minDistance={80}
        maxDistance={900}
        target={[0, 0, 0]}
      />
    </Canvas>
  );
}