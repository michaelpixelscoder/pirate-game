// ---------------------------------------------------------------------------
// Load a .asset.json WorldAsset and resolve it into flat voxel lists per entity
// Compatible with the game engine's entity creation API.
// Block IDs use the _block suffix (e.g. "grass_block") which the game's
// blockColor / blockTextureKey helpers already handle via .includes() matching.
// ---------------------------------------------------------------------------

export interface FlatEntityDef {
  id: string;
  name: string;
  physics: "static" | "dynamic";
  /** World-space position [x, y, z] */
  position: [number, number, number];
  /** Rotation quaternion [x, y, z, w] */
  rotation: [number, number, number, number];
  /** Flat list of resolved voxels */
  voxels: Array<{ x: number; y: number; z: number; value: string }>;
}

interface RawVoxel { x: number; y: number; z: number; value: string }
interface RawRef {
  path: string;
  position?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: number | [number, number, number];
}
interface RawEntitySpec {
  name?: string;
  physics?: "static" | "dynamic";
  transform?: { position?: [number, number, number]; rotation?: [number, number, number, number] };
  cells?: RawVoxel[];
  _references?: RawRef[];
}
interface RawWorldAsset {
  kind: "world";
  id: string;
  name?: string;
  entities: Record<string, RawEntitySpec>;
}
interface RawLibraryAsset {
  kind: "library";
  cells?: RawVoxel[];
  _references?: RawRef[];
}
type RawAsset = RawWorldAsset | RawLibraryAsset;

// Simple fetch cache so referenced libraries aren't fetched twice per load
const _cache = new Map<string, RawAsset>();

async function fetchRaw(url: string): Promise<RawAsset | null> {
  const cached = _cache.get(url);
  if (cached) return cached;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json() as RawAsset;
    _cache.set(url, data);
    return data;
  } catch {
    return null;
  }
}

function resolveRelPath(base: string, rel: string): string {
  // base may be a full URL or a path-only string (e.g. "/pirate-game/assets/world.asset.json")
  // new URL() requires an absolute base, so prefix with origin if needed.
  const absBase = base.startsWith("http") ? base : `${window.location.origin}${base.startsWith("/") ? "" : "/"}${base}`;
  const url = new URL(rel, absBase);
  return url.href;
}

function resolveScale(s?: number | [number, number, number]): [number, number, number] {
  if (s === undefined) return [1, 1, 1];
  if (typeof s === "number") return [s, s, s];
  return s;
}

function rotateByQuat(
  x: number, y: number, z: number,
  [qx, qy, qz, qw]: [number, number, number, number],
): [number, number, number] {
  // Hamilton product: q * [0,v] * q_conj, optimised version
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

function applyTransform(
  cells: RawVoxel[],
  ref: RawRef,
): RawVoxel[] {
  const [tx, ty, tz] = ref.position ?? [0, 0, 0];
  const [sx, sy, sz] = resolveScale(ref.scale);
  const rot = ref.rotation;
  return cells.map((c) => {
    let x = c.x * sx, y = c.y * sy, z = c.z * sz;
    if (rot) [x, y, z] = rotateByQuat(x, y, z, rot);
    return { ...c, x: Math.round(x + tx), y: Math.round(y + ty), z: Math.round(z + tz) };
  });
}

async function resolveLibrary(
  asset: RawLibraryAsset,
  baseUrl: string,
  visited: Set<string>,
): Promise<RawVoxel[]> {
  const result: RawVoxel[] = [...(asset.cells ?? [])];
  for (const ref of (asset._references ?? [])) {
    const refUrl = resolveRelPath(baseUrl, ref.path);
    if (visited.has(refUrl)) continue;
    const child = await fetchRaw(refUrl);
    if (!child) continue;
    const childVisited = new Set([...visited, refUrl]);
    let childCells: RawVoxel[] = [];
    if (child.kind === "library") childCells = await resolveLibrary(child, refUrl, childVisited);
    result.push(...applyTransform(childCells, ref));
  }
  return result;
}

async function resolveEntitySpec(
  spec: RawEntitySpec,
  baseUrl: string,
  visited: Set<string>,
): Promise<RawVoxel[]> {
  const result: RawVoxel[] = [...(spec.cells ?? [])];
  for (const ref of (spec._references ?? [])) {
    const refUrl = resolveRelPath(baseUrl, ref.path);
    if (visited.has(refUrl)) continue;
    const child = await fetchRaw(refUrl);
    if (!child) continue;
    const childVisited = new Set([...visited, refUrl]);
    let childCells: RawVoxel[] = [];
    if (child.kind === "library") childCells = await resolveLibrary(child, refUrl, childVisited);
    result.push(...applyTransform(childCells, ref));
  }
  return result;
}

/**
 * Load a world asset from a URL and resolve all entities into flat voxel lists.
 * Returns null if the fetch fails or the data is not a valid world asset.
 */
export async function loadWorldFromUrl(url: string): Promise<FlatEntityDef[] | null> {
  _cache.clear();
  const raw = await fetchRaw(url);
  if (!raw || raw.kind !== "world") return null;

  const world = raw as RawWorldAsset;
  const entities: FlatEntityDef[] = [];

  for (const [entityId, spec] of Object.entries(world.entities)) {
    const voxels = await resolveEntitySpec(spec, url, new Set([url]));
    const t = spec.transform;
    entities.push({
      id: entityId,
      name: spec.name ?? entityId,
      physics: spec.physics ?? "static",
      position: t?.position ?? [0, 0, 0],
      rotation: t?.rotation ?? [0, 0, 0, 1],
      voxels,
    });
  }

  return entities;
}

/**
 * Load a world asset from a raw JSON object (e.g. parsed from localStorage).
 * Pass bundledAssets to pre-populate the resolver cache with locally saved
 * library assets so they take priority over public-server fetches.
 */
export async function loadWorldFromObject(
  world: RawWorldAsset,
  baseUrl: string,
  bundledAssets: Record<string, unknown> = {},
): Promise<FlatEntityDef[] | null> {
  if (world.kind !== "world") return null;
  // Pre-populate cache with bundled library assets (keyed by their resolved URL)
  // so resolveEntitySpec finds them without hitting the network.
  for (const [relPath, asset] of Object.entries(bundledAssets)) {
    const url = resolveRelPath(baseUrl, relPath);
    _cache.set(url, asset as RawAsset);
  }
  const entities: FlatEntityDef[] = [];
  for (const [entityId, spec] of Object.entries(world.entities)) {
    const voxels = await resolveEntitySpec(spec, baseUrl, new Set([baseUrl]));
    const t = spec.transform;
    entities.push({
      id: entityId,
      name: spec.name ?? entityId,
      physics: spec.physics ?? "static",
      position: t?.position ?? [0, 0, 0],
      rotation: t?.rotation ?? [0, 0, 0, 1],
      voxels,
    });
  }
  return entities;
}
