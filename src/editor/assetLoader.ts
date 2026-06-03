import type {
  AssetFile,
  AssetManifest,
  AssetReference,
  AssetTransform,
  EntitySpec,
  LibraryAsset,
  ResolvedAsset,
  ResolvedCell,
  VoxelCellSpec,
  WorldAsset,
} from "./types";

// The base URL for all asset files (from public/assets/)
const ASSET_BASE = `${import.meta.env.BASE_URL}assets/`;

// Simple in-memory cache — avoids re-fetching dependency libs on every voxel edit
const _fetchCache = new Map<string, AssetFile>();
export function clearFetchCache() { _fetchCache.clear(); }

// In-memory edit overrides — takes priority over fetch cache.
// Call setEditedAsset whenever the user modifies an asset so other scenes resolve against the edit.
const _editCache = new Map<string, AssetFile>();
export function setEditedAsset(path: string, asset: AssetFile) { _editCache.set(path, asset); }
export function hasEditedAsset(path: string) { return _editCache.has(path); }
export function getEditedAssets(): Map<string, AssetFile> { return new Map(_editCache); }

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

export async function fetchManifest(): Promise<AssetManifest> {
  const res = await fetch(`${ASSET_BASE}index.json`);
  if (!res.ok) throw new Error(`Failed to fetch asset manifest: ${res.status}`);
  return res.json() as Promise<AssetManifest>;
}

// ---------------------------------------------------------------------------
// Asset fetching with reference resolution
// ---------------------------------------------------------------------------

/**
 * Fetch and fully resolve an asset file by its manifest-relative path.
 */
export async function loadAsset(path: string): Promise<ResolvedAsset> {
  const raw = await fetchAssetFile(path);
  return resolveAsset(raw, path);
}

/**
 * Resolve an already-loaded raw asset (used for in-memory edits).
 * Only dependency files are fetched (and cached).
 */
export async function resolveAsset(raw: AssetFile, basePath: string): Promise<ResolvedAsset> {
  if (raw.kind === "library") {
    const allCells = await resolveCells(raw.cells ?? [], raw._references ?? [], basePath, new Set([basePath]));
    return { raw, allCells, entityCells: new Map() };
  }

  // WorldAsset — resolve each entity independently
  const entityCells = new Map<string, ResolvedCell[]>();
  for (const [entityId, spec] of Object.entries((raw as WorldAsset).entities)) {
    const cells = await resolveEntitySpec(spec, basePath, new Set([basePath]));
    entityCells.set(entityId, cells);
  }
  const allCells = Array.from(entityCells.values()).flat();
  return { raw, allCells, entityCells };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function fetchAssetFile(path: string): Promise<AssetFile> {
  // Edited version takes priority over the original network fetch
  const edited = _editCache.get(path);
  if (edited) return edited;
  const cached = _fetchCache.get(path);
  if (cached) return cached;
  const url = `${ASSET_BASE}${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Asset not found: ${url} (${res.status})`);
  const data = await res.json() as AssetFile;
  _fetchCache.set(path, data);
  return data;
}

async function resolveEntitySpec(
  spec: EntitySpec,
  ownerPath: string,
  visited: Set<string>,
): Promise<ResolvedCell[]> {
  return resolveCells(spec.cells ?? [], spec._references ?? [], ownerPath, visited);
}

async function resolveCells(
  ownCells: VoxelCellSpec[],
  refs: AssetReference[],
  ownerPath: string,
  visited: Set<string>,
): Promise<ResolvedCell[]> {
  const result: ResolvedCell[] = ownCells.map((c) => ({ ...c, originPath: ownerPath }));

  for (const ref of refs) {
    const refPath = resolveRelativePath(ownerPath, ref.path);
    if (visited.has(refPath)) {
      console.warn(`[AssetLoader] Circular reference detected: ${refPath}`);
      continue;
    }

    const refAsset = await fetchAssetFile(refPath);
    const childVisited = new Set([...visited, refPath]);

    let childCells: ResolvedCell[];
    if (refAsset.kind === "library") {
      childCells = await resolveCells(
        refAsset.cells ?? [],
        refAsset._references ?? [],
        refPath,
        childVisited,
      );
    } else {
      // WorldAsset referenced as a sub-asset: flatten all entities
      const world = refAsset as WorldAsset;
      const nested = await Promise.all(
        Object.values(world.entities).map((spec) =>
          resolveEntitySpec(spec, refPath, childVisited),
        ),
      );
      childCells = nested.flat();
    }

    result.push(...applyTransform(childCells, ref));
  }

  return result;
}

/** Apply a reference transform (position/rotation/scale) to a set of cells */
function applyTransform(cells: ResolvedCell[], transform: AssetTransform): ResolvedCell[] {
  const [tx, ty, tz] = transform.position ?? [0, 0, 0];
  const scale = resolveScale(transform.scale);
  const rot = transform.rotation;

  return cells.map((c) => {
    let x = c.x * scale[0];
    let y = c.y * scale[1];
    let z = c.z * scale[2];

    if (rot) {
      [x, y, z] = rotateByQuat(x, y, z, rot);
    }

    return {
      ...c,
      x: Math.round(x + tx),
      y: Math.round(y + ty),
      z: Math.round(z + tz),
    };
  });
}

function resolveScale(
  scale?: number | [number, number, number],
): [number, number, number] {
  if (scale === undefined) return [1, 1, 1];
  if (typeof scale === "number") return [scale, scale, scale];
  return scale;
}

/** Rotate a point by a quaternion (xyzw) */
function rotateByQuat(
  x: number,
  y: number,
  z: number,
  q: [number, number, number, number],
): [number, number, number] {
  const [qx, qy, qz, qw] = q;
  // v' = q * v * q^-1
  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;
  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx,
  ];
}

/**
 * Resolve a path relative to a base file path.
 * e.g. ("world.asset.json", "lib/tree.asset.json") → "lib/tree.asset.json"
 * e.g. ("lib/tree.asset.json", "../cabin.asset.json") → "cabin.asset.json"
 */
function resolveRelativePath(basePath: string, relativePath: string): string {
  // Get base directory
  const baseDir = basePath.includes("/")
    ? basePath.substring(0, basePath.lastIndexOf("/") + 1)
    : "";
  // Use URL API for clean path resolution
  const resolved = new URL(relativePath, `http://x/${baseDir}`);
  // Strip leading /
  return resolved.pathname.slice(1);
}

export type { AssetFile, AssetManifest, ResolvedAsset, ResolvedCell };
