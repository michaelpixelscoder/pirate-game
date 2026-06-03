import {
  addVec3,
  cloneVec3,
  conjugateQuat,
  crossVec3,
  identityTransform,
  lengthVec3,
  mulVec3,
  multiplyQuat,
  normalizeQuat,
  subVec3,
  quat,
  rotateVec3ByQuat,
  vec3
} from "./math";
import type {
  DebugVisibility,
  EntityCreationInput,
  EntityId,
  EntityIntrospection,
  EntityMetadata,
  EntityPatch,
  ForceVector,
  VoxelCell
} from "./types";

function cloneTransform(transform: EntityMetadata["transform"]) {
  return {
    position: cloneVec3(transform.position),
    rotation: { ...transform.rotation },
    scale: cloneVec3(transform.scale)
  };
}

function mergeTransform(base: EntityMetadata["transform"], patch?: Partial<EntityMetadata["transform"]>) {
  if (!patch) return cloneTransform(base);
  return {
    position: patch.position ? { ...base.position, ...patch.position } : cloneVec3(base.position),
    rotation: patch.rotation ? { ...base.rotation, ...patch.rotation } : { ...base.rotation },
    scale: patch.scale ? { ...base.scale, ...patch.scale } : cloneVec3(base.scale)
  };
}

function createEmptyRuntime() {
  return {
    localVelocity: vec3(),
    worldVelocity: vec3(),
    angularVelocity: vec3(),
    forces: {
      applied: [] as ForceVector[],
      accumulated: vec3(),
      accumulatedTorque: vec3()
    }
  };
}

function worldifyTransform(parent: EntityMetadata["worldTransform"] | null, local: EntityMetadata["transform"]) {
  const scaledLocal = {
    x: local.position.x * local.scale.x,
    y: local.position.y * local.scale.y,
    z: local.position.z * local.scale.z
  };
  const rotatedLocal = parent ? rotateVec3ByQuat(scaledLocal, parent.rotation) : scaledLocal;
  const worldPosition = parent ? addVec3(parent.position, rotatedLocal) : cloneVec3(scaledLocal);
  const worldRotation = parent ? multiplyQuat(parent.rotation, local.rotation) : { ...local.rotation };
  const worldScale = parent ? {
    x: parent.scale.x * local.scale.x,
    y: parent.scale.y * local.scale.y,
    z: parent.scale.z * local.scale.z
  } : cloneVec3(local.scale);
  return { position: worldPosition, rotation: worldRotation, scale: worldScale };
}

function voxelCount(voxels?: Map<string, VoxelCell>) {
  return voxels ? voxels.size : 0;
}

export class VoxelWorldEngine {
  readonly rootId: EntityId = "world";
  private entities = new Map<EntityId, EntityMetadata>();
  private handles = new Map<EntityId, unknown>();
  private nextId = 1;
  private environment = {
    gravity: vec3(),
    wind: vec3()
  };
  private debugVisibility: DebugVisibility = {
    forces: false,
    velocity: false
  };

  constructor() {
    this.entities.set(this.rootId, {
      id: this.rootId,
      name: "world",
      kind: "root",
      physics: "static",
      collides: false,
      parentId: null,
      transform: identityTransform(),
      worldTransform: identityTransform(),
      debug: {
        forces: false,
        velocity: false,
        renderForces: false,
        renderVelocity: false
      },
      runtime: createEmptyRuntime()
    });
  }

  setGlobalDebug(visibility: Partial<DebugVisibility>) {
    this.debugVisibility = { ...this.debugVisibility, ...visibility };
  }

  getGlobalDebug() {
    return { ...this.debugVisibility };
  }

  setEnvironment(next: Partial<{ gravity: { x: number; y: number; z: number }; wind: { x: number; y: number; z: number } }>) {
    if (next.gravity) this.environment.gravity = { ...next.gravity };
    if (next.wind) this.environment.wind = { ...next.wind };
  }

  getEnvironment() {
    return {
      gravity: cloneVec3(this.environment.gravity),
      wind: cloneVec3(this.environment.wind)
    };
  }

  clearAllForces() {
    for (const entity of this.entities.values()) {
      entity.runtime.forces.applied = [];
      entity.runtime.forces.accumulated = vec3();
      entity.runtime.forces.accumulatedTorque = vec3();
    }
  }

  createEntity(input: EntityCreationInput) {
    const id = input.id ?? `entity-${this.nextId++}`;
    if (this.entities.has(id)) throw new Error(`Entity already exists: ${id}`);
    const parentId = input.parentId ?? this.rootId;
    const transform = {
      position: { ...vec3(), ...(input.transform?.position ?? {}) },
      rotation: { ...quat(), ...(input.transform?.rotation ?? {}) },
      scale: { ...vec3(1, 1, 1), ...(input.transform?.scale ?? {}) }
    };
    const voxels: Map<string, VoxelCell> | undefined = input.voxels
      ? new Map(Array.from(input.voxels, (voxel) => [`${voxel.x},${voxel.y},${voxel.z}`, voxel] as const))
      : undefined;
    const entity: EntityMetadata = {
      id,
      name: input.name ?? id,
      kind: input.kind ?? (voxels ? "voxel" : "generic"),
      physics: input.physics ?? "static",
      collides: input.collides ?? true,
      parentId,
      transform,
      worldTransform: identityTransform(),
      debug: {
        forces: input.debug?.forces ?? false,
        velocity: input.debug?.velocity ?? false,
        renderForces: input.debug?.renderForces ?? false,
        renderVelocity: input.debug?.renderVelocity ?? false
      },
      runtime: createEmptyRuntime(),
      voxels
    };
    this.entities.set(id, entity);
    this.recomputeEntityWorldTransform(id);
    return id;
  }

  removeEntity(id: EntityId) {
    if (id === this.rootId) return;
    this.entities.delete(id);
    this.handles.delete(id);
    for (const entity of this.entities.values()) {
      if (entity.parentId === id) entity.parentId = this.rootId;
    }
  }

  getEntity(id: EntityId) {
    return this.entities.get(id) ?? null;
  }

  listEntities() {
    return Array.from(this.entities.values());
  }

  setParent(id: EntityId, parentId: EntityId | null) {
    const entity = this.requireEntity(id);
    entity.parentId = parentId ?? this.rootId;
    this.recomputeEntityWorldTransform(id);
  }

  setParentPreserveWorld(id: EntityId, parentId: EntityId | null) {
    const entity = this.requireEntity(id);
    const parent = parentId ? this.entities.get(parentId) ?? this.entities.get(this.rootId)! : this.entities.get(this.rootId)!;
    const world = cloneTransform(entity.worldTransform);
    const parentWorld = parent.worldTransform;
    const inverseParentRotation = conjugateQuat(parentWorld.rotation);
    const relativePosition = subVec3(world.position, parentWorld.position);
    const rotatedPosition = rotateVec3ByQuat(relativePosition, inverseParentRotation);
    entity.parentId = parentId ?? this.rootId;
    entity.transform = {
      position: {
        x: rotatedPosition.x / parentWorld.scale.x,
        y: rotatedPosition.y / parentWorld.scale.y,
        z: rotatedPosition.z / parentWorld.scale.z
      },
      rotation: multiplyQuat(inverseParentRotation, world.rotation),
      scale: {
        x: world.scale.x / parentWorld.scale.x,
        y: world.scale.y / parentWorld.scale.y,
        z: world.scale.z / parentWorld.scale.z
      }
    };
    this.recomputeEntityWorldTransform(id);
  }

  patchEntity(id: EntityId, patch: EntityPatch) {
    const entity = this.requireEntity(id);
    if (patch.name !== undefined) entity.name = patch.name;
    if (patch.kind !== undefined) entity.kind = patch.kind;
    if (patch.physics !== undefined) entity.physics = patch.physics;
    if (patch.collides !== undefined) entity.collides = patch.collides;
    if (patch.parentId !== undefined) entity.parentId = patch.parentId ?? this.rootId;
    if (patch.transform) entity.transform = mergeTransform(entity.transform, patch.transform);
    if (patch.debug) entity.debug = { ...entity.debug, ...patch.debug };
    this.recomputeEntityWorldTransform(id);
  }

  setVoxels(id: EntityId, voxels: Iterable<VoxelCell>) {
    const entity = this.requireEntity(id);
    entity.voxels = new Map(
      Array.from(voxels, (voxel) => [`${voxel.x},${voxel.y},${voxel.z}`, voxel] as const)
    );
  }

  addVoxel(id: EntityId, voxel: VoxelCell) {
    const entity = this.requireEntity(id);
    if (!entity.voxels) entity.voxels = new Map();
    entity.voxels.set(`${voxel.x},${voxel.y},${voxel.z}`, voxel);
  }

  removeVoxel(id: EntityId, x: number, y: number, z: number) {
    const entity = this.requireEntity(id);
    entity.voxels?.delete(`${x},${y},${z}`);
  }

  clearForces(id: EntityId) {
    const entity = this.requireEntity(id);
    entity.runtime.forces.applied = [];
    entity.runtime.forces.accumulated = vec3();
    entity.runtime.forces.accumulatedTorque = vec3();
  }

  setLocalVelocity(id: EntityId, velocity: { x: number; y: number; z: number }) {
    this.requireEntity(id).runtime.localVelocity = { ...velocity };
  }

  setWorldVelocity(id: EntityId, velocity: { x: number; y: number; z: number }) {
    const entity = this.requireEntity(id);
    entity.runtime.worldVelocity = { ...velocity };
    const parent = entity.parentId ? this.entities.get(entity.parentId) ?? this.entities.get(this.rootId)! : this.entities.get(this.rootId)!;
    entity.runtime.localVelocity = {
      x: velocity.x - parent.runtime.worldVelocity.x,
      y: velocity.y - parent.runtime.worldVelocity.y,
      z: velocity.z - parent.runtime.worldVelocity.z
    };
  }

  setDebugFlags(
    id: EntityId,
    flags: Partial<{
      forces: boolean;
      velocity: boolean;
      renderForces: boolean;
      renderVelocity: boolean;
    }>
  ) {
    const entity = this.requireEntity(id);
    entity.debug = { ...entity.debug, ...flags };
  }

  addForce(id: EntityId, force: { source?: { x: number; y: number; z: number }; vector: { x: number; y: number; z: number }; label: string }) {
    const entity = this.requireEntity(id);
    const record: ForceVector = {
      entityId: id,
      label: force.label,
      source: force.source ? { ...force.source } : cloneVec3(entity.worldTransform.position),
      vector: { ...force.vector }
    };
    entity.runtime.forces.applied.push(record);
    entity.runtime.forces.accumulated = addVec3(entity.runtime.forces.accumulated, record.vector);
    const leverArm = subVec3(record.source, entity.worldTransform.position);
    const torque = crossVec3(leverArm, record.vector);
    entity.runtime.forces.accumulatedTorque = addVec3(entity.runtime.forces.accumulatedTorque, torque);
  }

  step(dt: number) {
    const ordered = Array.from(this.entities.values());
    for (const entity of ordered) {
      if (entity.id === this.rootId) {
        entity.worldTransform = cloneTransform(entity.transform);
        continue;
      }

      const parent = entity.parentId ? this.entities.get(entity.parentId) ?? this.entities.get(this.rootId)! : this.entities.get(this.rootId)!;
      const parentWorld = parent?.worldTransform ?? identityTransform();
      entity.worldTransform = worldifyTransform(parentWorld, entity.transform);

      if (entity.physics !== "dynamic") {
        entity.runtime.localVelocity = vec3();
        entity.runtime.worldVelocity = vec3();
        entity.runtime.angularVelocity = vec3();
        continue;
      }

      if (this.environment.gravity.x !== 0 || this.environment.gravity.y !== 0 || this.environment.gravity.z !== 0) {
        this.addForce(entity.id, {
          label: "gravity",
          source: cloneVec3(entity.worldTransform.position),
          vector: cloneVec3(this.environment.gravity)
        });
      }

      if (this.environment.wind.x !== 0 || this.environment.wind.y !== 0 || this.environment.wind.z !== 0) {
        this.addForce(entity.id, {
          label: "wind",
          source: cloneVec3(entity.worldTransform.position),
          vector: cloneVec3(this.environment.wind)
        });
      }

      const accel = entity.runtime.forces.accumulated;
      const torque = entity.runtime.forces.accumulatedTorque;
      entity.runtime.localVelocity = addVec3(entity.runtime.localVelocity, mulVec3(accel, dt));
      entity.runtime.localVelocity = mulVec3(entity.runtime.localVelocity, Math.pow(0.992, dt * 60));

      // Voxel count provides a lightweight inertia approximation until full rigid-body mass properties exist.
      const inertia = Math.max(1, voxelCount(entity.voxels));
      const angularAccel = mulVec3(torque, 1 / inertia);
      entity.runtime.angularVelocity = addVec3(entity.runtime.angularVelocity, mulVec3(angularAccel, dt));
      entity.runtime.angularVelocity = mulVec3(entity.runtime.angularVelocity, Math.pow(0.985, dt * 60));

      const angularSpeed = lengthVec3(entity.runtime.angularVelocity);
      if (angularSpeed > 1e-6) {
        const angle = Math.min(angularSpeed * dt, 0.7);
        const axis = mulVec3(entity.runtime.angularVelocity, 1 / angularSpeed);
        const half = angle * 0.5;
        const sinHalf = Math.sin(half);
        const deltaRotation = {
          x: axis.x * sinHalf,
          y: axis.y * sinHalf,
          z: axis.z * sinHalf,
          w: Math.cos(half)
        };
        entity.transform.rotation = normalizeQuat(multiplyQuat(deltaRotation, entity.transform.rotation));
      }

      entity.transform.position = addVec3(entity.transform.position, mulVec3(entity.runtime.localVelocity, dt));
      entity.runtime.worldVelocity = addVec3(parent.runtime.worldVelocity, entity.runtime.localVelocity);
      entity.runtime.forces.accumulated = vec3();
      entity.runtime.forces.accumulatedTorque = vec3();
      entity.worldTransform = worldifyTransform(parentWorld, entity.transform);
    }
  }

  getIntrospection(id: EntityId): EntityIntrospection {
    const entity = this.requireEntity(id);
    return {
      id: entity.id,
      name: entity.name,
      parentId: entity.parentId,
      kind: entity.kind,
      physics: entity.physics,
      collides: entity.collides,
      localTransform: cloneTransform(entity.transform),
      worldTransform: cloneTransform(entity.worldTransform),
      localVelocity: cloneVec3(entity.runtime.localVelocity),
      worldVelocity: cloneVec3(entity.runtime.worldVelocity),
      forces: entity.runtime.forces.applied.map((force) => ({
        entityId: force.entityId,
        label: force.label,
        source: cloneVec3(force.source),
        vector: cloneVec3(force.vector)
      })),
      debug: { ...entity.debug },
      voxelCount: voxelCount(entity.voxels)
    };
  }

  getEntitiesWithDebugVectors() {
    return this.listEntities().filter((entity) => {
      const globalForces = this.debugVisibility.forces && entity.kind !== "root";
      const globalVelocity = this.debugVisibility.velocity && entity.kind !== "root";
      return entity.debug.forces || entity.debug.velocity || globalForces || globalVelocity;
    });
  }

  private recomputeEntityWorldTransform(id: EntityId) {
    const entity = this.requireEntity(id);
    const parent = entity.parentId ? this.entities.get(entity.parentId) ?? this.entities.get(this.rootId)! : this.entities.get(this.rootId)!;
    entity.worldTransform = worldifyTransform(parent.worldTransform, entity.transform);
  }

  private requireEntity(id: EntityId) {
    const entity = this.entities.get(id);
    if (!entity) throw new Error(`Unknown entity: ${id}`);
    return entity;
  }
}
