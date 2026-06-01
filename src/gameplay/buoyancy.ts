import * as THREE from "three";
import type { VoxelWorldEngine } from "../engine";

type BuoyancyOptions = {
  waterLevel: number;
  gravityEnabled: boolean;
  resolveBlockMass?: (blockId: string) => number;
};

function getVoxelWorldPoint(engine: VoxelWorldEngine, entityId: string, voxel: { x: number; y: number; z: number }) {
  const debug = engine.getIntrospection(entityId);
  const rotation = new THREE.Quaternion(
    debug.worldTransform.rotation.x,
    debug.worldTransform.rotation.y,
    debug.worldTransform.rotation.z,
    debug.worldTransform.rotation.w
  );
  const scale = debug.worldTransform.scale;
  const position = debug.worldTransform.position;
  const local = new THREE.Vector3(voxel.x + 0.5, voxel.y + 0.5, voxel.z + 0.5);
  local.multiply(new THREE.Vector3(scale.x, scale.y, scale.z));
  local.applyQuaternion(rotation);
  return local.add(new THREE.Vector3(position.x, position.y, position.z));
}

function buildStaticSurfaceColumns(engine: VoxelWorldEngine) {
  const columns = new Map<string, number>();
  for (const entity of engine.listEntities()) {
    if (entity.kind !== "voxel" || entity.physics !== "static") continue;
    for (const voxel of entity.voxels?.values() ?? []) {
      const worldPoint = getVoxelWorldPoint(engine, entity.id, voxel);
      const columnX = Math.floor(worldPoint.x);
      const columnZ = Math.floor(worldPoint.z);
      const key = `${columnX},${columnZ}`;
      const topY = worldPoint.y + 0.5;
      const previous = columns.get(key);
      if (previous === undefined || topY > previous) columns.set(key, topY);
    }
  }
  return columns;
}

export function applyGravityAndBuoyancy(engine: VoxelWorldEngine, options: BuoyancyOptions) {
  const staticSurface = buildStaticSurfaceColumns(engine);
  const gravity = 9.81;
  const waterDensity = 1.0;
  const waterLinearDrag = 2.2;
  const airLinearDrag = 0.08;
  const maxFluidDrag = 55;

  for (const entity of engine.listEntities()) {
    if (entity.id === engine.rootId) continue;
    if (entity.physics !== "dynamic" || entity.kind !== "voxel") continue;
    const debug = engine.getIntrospection(entity.id);

    let totalMass = 0;
    let submergedVolume = 0;
    let totalVolume = 0;
    const weightedCom = new THREE.Vector3();
    let displacedMass = 0;
    const weightedCob = new THREE.Vector3();
    let maxStaticPenetration = 0;

    for (const voxel of entity.voxels?.values() ?? []) {
      const worldPoint = getVoxelWorldPoint(engine, entity.id, voxel);
      const blockMass = Math.max(0.01, options.resolveBlockMass?.(voxel.value) ?? 1);
      totalMass += blockMass;
      weightedCom.addScaledVector(worldPoint, blockMass);
      totalVolume += 1;

      const depth = options.waterLevel - worldPoint.y;
      const submersion = THREE.MathUtils.clamp((depth + 0.5) / 1.0, 0, 1);
      if (submersion > 0) {
        submergedVolume += submersion;
        // Treat each voxel as unit volume and scale displaced mass by submerged fraction.
        const displaced = waterDensity * submersion;
        displacedMass += displaced;
        weightedCob.addScaledVector(worldPoint, displaced);
      }

      const columnKey = `${Math.floor(worldPoint.x)},${Math.floor(worldPoint.z)}`;
      const surfaceY = staticSurface.get(columnKey);
      if (surfaceY !== undefined) {
        const voxelBottomY = worldPoint.y - 0.5;
        const penetration = surfaceY - voxelBottomY;
        if (penetration > maxStaticPenetration) maxStaticPenetration = penetration;
      }
    }

    if (totalMass <= 0) continue;
    const centerOfMass = weightedCom.multiplyScalar(1 / totalMass);

    if (options.gravityEnabled) {
      engine.addForce(entity.id, {
        label: "gravity",
        source: centerOfMass,
        vector: { x: 0, y: -totalMass * gravity, z: 0 }
      });
    }

    if (displacedMass > 0) {
      const centerOfBuoyancy = weightedCob.multiplyScalar(1 / displacedMass);
      engine.addForce(entity.id, {
        label: "buoyancy",
        source: centerOfBuoyancy,
        vector: { x: 0, y: displacedMass * gravity, z: 0 }
      });
    }

    const submergedRatio = totalVolume > 0 ? THREE.MathUtils.clamp(submergedVolume / totalVolume, 0, 1) : 0;
    const exposedRatio = 1 - submergedRatio;
    const velocity = new THREE.Vector3(debug.worldVelocity.x, debug.worldVelocity.y, debug.worldVelocity.z);
    const speed = velocity.length();
    if (speed > 1e-4) {
      const dragDirection = velocity.multiplyScalar(-1 / speed);
      const waterDragMagnitude = waterLinearDrag * submergedRatio * speed;
      const airDragMagnitude = airLinearDrag * exposedRatio * speed;
      const dragMagnitude = Math.min(maxFluidDrag, waterDragMagnitude + airDragMagnitude);
      const totalDrag = dragDirection.multiplyScalar(dragMagnitude);
      engine.addForce(entity.id, {
        label: "fluid-drag",
        source: centerOfMass,
        vector: { x: totalDrag.x, y: totalDrag.y, z: totalDrag.z }
      });
    }

    if (maxStaticPenetration > 0) {
      const upwardCorrection = maxStaticPenetration * 95;
      const downwardVelocity = Math.max(0, -debug.worldVelocity.y);
      const damping = downwardVelocity * 14;
      engine.addForce(entity.id, {
        label: "collision-support",
        source: centerOfMass,
        vector: { x: 0, y: upwardCorrection + damping, z: 0 }
      });
    }
  }
}