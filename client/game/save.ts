import { game, upsert, resetGame } from './store';

/**
 * 存档系统：localStorage JSON
 */
const SAVE_KEY = 'abyss_save_v1';

export function saveGame() {
  try {
    const data = JSON.stringify({
      day: game.day,
      wave: game.wave,
      resources: game.resources,
      core: game.core,
      regions: game.regions,
      buildings: game.buildings,
      stats: game.stats,
      phase: game.phase,
    });
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SAVE_KEY, data);
    }
    return true;
  } catch {
    return false;
  }
}

export function loadGame(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    upsert((g) => {
      g.day = data.day;
      g.wave = data.wave;
      g.resources = { ...g.resources, ...data.resources };
      g.core = { ...g.core, ...data.core };
      g.regions = data.regions || [];
      g.buildings = (data.buildings || []).map((b: any) => ({ ...b }));
      g.stats = { ...g.stats, ...data.stats };
      g.phase = 'prep';
      g.elapsed = 0;
      g.started = true;
      g.announce = 'continue';
    });
    return true;
  } catch {
    return false;
  }
}

export function hasSave(): boolean {
  try {
    return typeof localStorage !== 'undefined' && !!localStorage.getItem(SAVE_KEY);
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch { /* ignore */ }
}