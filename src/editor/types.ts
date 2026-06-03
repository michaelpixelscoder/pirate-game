// ---------------------------------------------------------------------------
// .asset.json file format
// ---------------------------------------------------------------------------

/** A single voxel cell stored in an asset file */
export interface VoxelCellSpec {
  x: number;
  y: number;
  z: number;
  value: string; // block id, e.g. "grass_block"
}

/** Placement transform inside a reference */
export interface AssetTransform {
  /** Translation [x, y, z] */
  position?: [number, number, number];
  /** Rotation as quaternion [x, y, z, w] — must be a 90° multiple for voxel grids */
  rotation?: [number, number, number, number];
  /** Uniform or per-axis scale */
  scale?: number | [number, number, number];
}

/** A reference to another .asset.json, placed at a transform */
export interface AssetReference extends AssetTransform {
  /** Path to the referenced file, relative to this file's location */
  path: string;
  /** Optional id override — defaults to the referenced asset's id */
  id?: string;
}

/** A named entity definition — used inside WorldAsset.entities */
export interface EntitySpec {
  name?: string;
  physics?: "static" | "dynamic";
  transform?: AssetTransform;
  cells?: VoxelCellSpec[];
  _references?: AssetReference[];
}

/** A standalone reusable structure (tree, ship, cabin …) */
export interface LibraryAsset {
  version: "1";
  kind: "library";
  id: string;
  name?: string;
  physics?: "static" | "dynamic";
  cells?: VoxelCellSpec[];
  _references?: AssetReference[];
}

/**
 * A world / scene file that composes multiple named entities.
 * Each entity may embed its own cells and/or reference library assets.
 *
 * @example
 * // world.asset.json
 * {
 *   "version": "1", "kind": "world", "id": "world", "name": "Main World",
 *   "entities": {
 *     "island": {
 *       "cells": [...],
 *       "_references": [{"path": "lib/island.asset.json", "position": [0, 0, 0]}]
 *     }
 *   }
 * }
 */
export interface WorldAsset {
  version: "1";
  kind: "world";
  id: string;
  name?: string;
  entities: Record<string, EntitySpec>;
}

export type AssetFile = LibraryAsset | WorldAsset;

// ---------------------------------------------------------------------------
// Resolved / runtime types
// ---------------------------------------------------------------------------

/** A voxel cell after all references have been resolved and transforms applied */
export interface ResolvedCell {
  x: number;
  y: number;
  z: number;
  value: string;
  /** The asset path this cell originally came from */
  originPath: string;
}

/** Fully resolved asset ready for rendering */
export interface ResolvedAsset {
  /** Source asset (before resolution) */
  raw: AssetFile;
  /** All cells after flattening _references recursively */
  allCells: ResolvedCell[];
  /**
   * For WorldAsset: per-entity resolved cells.
   * For LibraryAsset: empty map.
   */
  entityCells: Map<string, ResolvedCell[]>;
}

// ---------------------------------------------------------------------------
// Manifest — index of all known assets in public/assets/
// ---------------------------------------------------------------------------

export interface AssetManifestEntry {
  id: string;
  name: string;
  /** Path relative to the assets root, e.g. "world.asset.json" */
  path: string;
  kind: "library" | "world";
}

export interface AssetManifest {
  assets: AssetManifestEntry[];
}
