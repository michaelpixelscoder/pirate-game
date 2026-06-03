// ---------------------------------------------------------------------------
// localStorage persistence for user-saved levels
// Both the editor and game read/write from here.
// ---------------------------------------------------------------------------

import type { AssetFile } from "./editor/types";

const LEVELS_INDEX_KEY = "pirate-game:levels";
const LEVEL_DATA_PREFIX = "pirate-game:level:";

export interface SavedLevelMeta {
  id: string;
  name: string;
  savedAt: number; // Unix ms
}

/**
 * A fully self-contained level bundle: the world asset plus every library
 * asset that was edited locally.  When loading the bundle into the game or
 * editor, the assets map is injected into the resolver cache so local edits
 * take priority over the public-server originals.
 */
export interface SavedLevel {
  id: string;
  name: string;
  savedAt: number;
  /** The world AssetFile */
  world: AssetFile;
  /**
   * Bundled library assets keyed by their manifest-relative path
   * (e.g. "lib/cabin.asset.json").  May be empty if no library assets
   * were edited.
   */
  assets: Record<string, AssetFile>;
}

// ---- Read ----------------------------------------------------------------

export function listSavedLevels(): SavedLevelMeta[] {
  try {
    const raw = localStorage.getItem(LEVELS_INDEX_KEY);
    return raw ? (JSON.parse(raw) as SavedLevelMeta[]) : [];
  } catch {
    return [];
  }
}

export function loadSavedLevel(id: string): SavedLevel | null {
  try {
    const raw = localStorage.getItem(`${LEVEL_DATA_PREFIX}${id}`);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Migrate: old format stored the AssetFile directly (has a "kind" field)
    if (data.kind === "world") {
      return { id, name: (data as AssetFile & { name?: string }).name ?? id, savedAt: 0, world: data as AssetFile, assets: {} };
    }
    return data as SavedLevel;
  } catch {
    return null;
  }
}

// ---- Write ---------------------------------------------------------------

/**
 * Save a level bundle to localStorage.
 * @param id     - Unique level id (stable across saves of the same level)
 * @param name   - Display name shown in the start menu
 * @param world  - The world AssetFile
 * @param assets - All locally edited library assets, keyed by manifest-relative path
 */
export function saveLevel(
  id: string,
  name: string,
  world: AssetFile,
  assets: Record<string, AssetFile> = {},
): void {
  const meta: SavedLevelMeta = { id, name, savedAt: Date.now() };
  const index = listSavedLevels().filter((l) => l.id !== id);
  index.unshift(meta);
  localStorage.setItem(LEVELS_INDEX_KEY, JSON.stringify(index));
  const bundle: SavedLevel = { ...meta, world, assets };
  localStorage.setItem(`${LEVEL_DATA_PREFIX}${id}`, JSON.stringify(bundle));
}

export function deleteLevel(id: string): void {
  const index = listSavedLevels().filter((l) => l.id !== id);
  localStorage.setItem(LEVELS_INDEX_KEY, JSON.stringify(index));
  localStorage.removeItem(`${LEVEL_DATA_PREFIX}${id}`);
}
