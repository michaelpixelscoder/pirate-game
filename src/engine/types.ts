import type { Quat, Transform, Vec3 } from "./math";

export type EntityId = string;

export type EntityKind = "root" | "generic" | "voxel";

export type EntityPhysicsMode = "static" | "dynamic";

export type EntityDebugFlags = {
  forces: boolean;
  velocity: boolean;
  renderForces: boolean;
  renderVelocity: boolean;
};

export type EntityForces = {
  applied: ForceVector[];
  accumulated: Vec3;
  accumulatedTorque: Vec3;
};

export type VoxelCell = {
  x: number;
  y: number;
  z: number;
  value: string;
};

export type EntityRuntime = {
  localVelocity: Vec3;
  worldVelocity: Vec3;
  angularVelocity: Vec3;
  forces: EntityForces;
};

export type EntityMetadata = {
  id: EntityId;
  name: string;
  kind: EntityKind;
  physics: EntityPhysicsMode;
  collides: boolean;
  parentId: EntityId | null;
  transform: Transform;
  worldTransform: Transform;
  debug: EntityDebugFlags;
  runtime: EntityRuntime;
  voxels?: Map<string, VoxelCell>;
};

export type EntityCreationInput = {
  id?: EntityId;
  name: string;
  kind?: EntityKind;
  physics?: EntityPhysicsMode;
  collides?: boolean;
  parentId?: EntityId | null;
  transform?: Partial<Transform>;
  debug?: Partial<EntityDebugFlags>;
  voxels?: Iterable<VoxelCell>;
};

export type EntityPatch = Partial<
  Pick<EntityMetadata, "name" | "kind" | "physics" | "collides" | "parentId">
> & {
  transform?: Partial<Transform>;
  debug?: Partial<EntityDebugFlags>;
};

export type ForceVector = {
  source: Vec3;
  vector: Vec3;
  label: string;
  entityId: EntityId;
};

export type EntityIntrospection = {
  id: EntityId;
  name: string;
  parentId: EntityId | null;
  kind: EntityKind;
  physics: EntityPhysicsMode;
  collides: boolean;
  localTransform: Transform;
  worldTransform: Transform;
  localVelocity: Vec3;
  worldVelocity: Vec3;
  forces: ForceVector[];
  debug: EntityDebugFlags;
  voxelCount: number;
};

export type DebugVisibility = {
  forces: boolean;
  velocity: boolean;
};
