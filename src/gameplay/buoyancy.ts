import type { VoxelWorldEngine } from "../engine";
import { rotateVec3ByQuat } from "../engine/math";

export type BuoyancyOptions = {
  waterLevel: number;
  gravityEnabled: boolean;
  resolveBlockMass?: (blockId: string) => number;
  /** Pre-built static surface map from buildStaticSurface() -- avoids O(static voxels) work every frame. */
  staticSurface?: Map<string, number>;
  /** Hard Y floor for dynamic entities. Only dynamic voxels are stopped here; static voxels are exempt and may go below. */
  floorY?: number;
};

function clamp01(x: number) {
  return Math.min(1, Math.max(0, x));
}

function getVoxelWorldPoint(engine: VoxelWorldEngine, entityId: string, voxel: { x: number; y: number; z: number }) {
  const info = engine.getIntrospection(entityId);
  const { rotation, scale, position } = info.worldTransform;
  const local = {
    x: (voxel.x + 0.5) * scale.x,
    y: (voxel.y + 0.5) * scale.y,
    z: (voxel.z + 0.5) * scale.z
  };
  const rotated = rotateVec3ByQuat(local, rotation);
  return { x: position.x + rotated.x, y: position.y + rotated.y, z: position.z + rotated.z };
}

/**
 * Build a column-top map for all static voxel entities.
 * Cache this result and pass via options.staticSurface to avoid
 * re-iterating all static voxels every physics frame.
 */
export function buildStaticSurface(engine: VoxelWorldEngine): Map<string, number> {
  const columns = new Map<string, number>();
  for (const entity of engine.listEntities()) {
    if (entity.kind !== "voxel" || entity.physics !== "static") continue;
    for (const voxel of entity.voxels?.values() ?? []) {
      const wp = getVoxelWorldPoint(engine, entity.id, voxel);
      const key = `${Math.floor(wp.x)},${Math.floor(wp.z)}`;
      const topY = wp.y + 0.5;
      const prev = columns.get(key);
      if (prev === undefined || topY > prev) columns.set(key, topY);
    }
  }
  return columns;
}

export function applyGravityAndBuoyancy(engine: VoxelWorldEngine, options: BuoyancyOptions) {
  const staticSurface = options.staticSurface ?? buildStaticSurface(engine);
  const gravity = 9.81;
  const waterDensity = 1.0;
  const waterLinearDrag = 2.2;
  const airLinearDrag = 0.08;
  const maxFluidDrag = 55;

  for (const entity of engine.listEntities()) {
    if (entity.id === engine.rootId) continue;
    if (entity.physics !== "dynamic" || entity.kind !== "voxel") continue;
    const info = engine.getIntrospection(entity.id);

    let totalMass = 0;
    let submergedVolume = 0;
    let totalVolume = 0;
    let comX = 0, comY = 0, comZ = 0;
    let displacedMass = 0;
    let cobX = 0, cobY = 0, cobZ = 0;
    let maxStaticPenetration = 0;
    let maxFloorPenetration = 0;

    for (const voxel of entity.voxels?.values() ?? []) {
      const wp = getVoxelWorldPoint(engine, entity.id, voxel);
      const blockMass = Math.max(0.01, options.resolveBlockMass?.(voxel.value) ?? 1);
      totalMass += blockMass;
      comX += wp.x * blockMass; comY += wp.y * blockMass; comZ += wp.z * blockMass;
      totalVolume += 1;

      const submersion = clamp01((options.waterLevel - wp.y + 0.5));
      if (submersion > 0) {
        submergedVolume += submersion;
        const displaced = waterDensity * submersion;
        displacedMass += displaced;
        cobX += wp.x * displaced; cobY += wp.y * displaced; cobZ += wp.z * displaced;
      }

      const surfaceY = staticSurface.get(`${Math.floor(wp.x)},${Math.floor(wp.z)}`);
      if (surfaceY !== undefined) {
        const penetration = surfaceY - (wp.y - 0.5);
        if (penetration > maxStaticPenetration) maxStaticPenetration = penetration;
      }

      if (options.floorY !== undefined) {
        const floorPen = options.floorY + 0.5 - wp.y;
        if (floorPen > maxFloorPenetration) maxFloorPenetration = floorPen;
      }
    }

    if (totalMass <= 0) continue;
    const invMass = 1 / totalMass;
    const com = { x: comX * invMass, y: comY * invMass, z: comZ * invMass };

    if (options.gravityEnabled) {
      engine.addForce(entity.id, { label: "gravity", source: com, vector: { x: 0, y: -totalMass * gravity, z: 0 } });
    }

    if (displacedMass > 0) {
      const invDisp = 1 / displacedMass;
      const cob = { x: cobX * invDisp, y: cobY * invDisp, z: cobZ * invDisp };
      engine.addForce(entity.id, { label: "buoyancy", source: cob, vector: { x: 0, y: displacedMass * gravity, z: 0 } });
    }

    const submergedRatio = totalVolume > 0 ? clamp01(submergedVolume / totalVolume) : 0;
    const wv = info.worldVelocity;
    const speed = Math.sqrt(wv.x * wv.x + wv.y * wv.y + wv.z * wv.z);
    if (speed > 1e-4) {
      const invSpeed = -1 / speed;
      const dragMagnitude = Math.min(maxFluidDrag,
        (waterLinearDrag * submergedRatio + airLinearDrag * (1 - submergedRatio)) * speed
      );
      engine.addForce(entity.id, {
        label: "fluid-drag",
        source: com,
        vector: { x: wv.x * invSpeed * dragMagnitude, y: wv.y * invSpeed * dragMagnitude, z: wv.z * invSpeed * dragMagnitude }
      });
    }

    if (maxStaticPenetration > 0) {
      const damping = Math.max(0, -wv.y) * 14;
      engine.addForce(entity.id, {
        label: "collision-support",
        source: com,
        vector: { x: 0, y: maxStaticPenetration * 95 + damping, z: 0 }
      });
    }

    if (maxFloorPenetration > 0) {
      const damping = Math.max(0, -wv.y) * 14;
      engine.addForce(entity.id, {
        label: "floor-collision",
        source: com,
        vector: { x: 0, y: maxFloorPenetration * 95 + damping, z: 0 }
      });
    }
  }
}
