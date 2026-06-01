import type { EntityMetadata, ForceVector } from "./types";

export type RenderHandle = unknown;

export type EntityRenderSnapshot = {
  id: string;
  name: string;
  kind: string;
  voxels: EntityMetadata["voxels"] extends Map<string, infer V> ? V[] : never;
  parentId: string | null;
  collides: boolean;
  transform: EntityMetadata["worldTransform"];
};

export interface VoxelRenderBackend {
  createEntity(snapshot: EntityRenderSnapshot): RenderHandle;
  updateEntity(handle: RenderHandle, snapshot: EntityRenderSnapshot): void;
  removeEntity(handle: RenderHandle): void;
  setDebugVectors(vectors: ForceVector[]): void;
}

