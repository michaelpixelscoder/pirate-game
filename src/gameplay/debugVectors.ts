import * as THREE from "three";
import type { VoxelWorldEngine } from "../engine";

function clearGroup(group: THREE.Group) {
  while (group.children.length) {
    const child = group.children[0] as THREE.Object3D & { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] };
    group.remove(child);
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
      else child.material.dispose();
    }
  }
}

function addArrow(group: THREE.Group, source: THREE.Vector3, vector: THREE.Vector3, color: number, opacity: number, depthTest: boolean) {
  const magnitude = vector.length();
  if (magnitude < 0.0001) return;
  const arrow = new THREE.ArrowHelper(
    vector.clone().normalize(),
    source,
    Math.min(4, Math.max(0.2, magnitude * 0.2)),
    magnitude > 4 ? 0xff4d4d : color,
    0.45,
    0.18
  );
  const lineMaterial = arrow.line.material as THREE.LineBasicMaterial;
  const coneMaterial = arrow.cone.material as THREE.MeshBasicMaterial;
  lineMaterial.transparent = true;
  coneMaterial.transparent = true;
  lineMaterial.opacity = opacity;
  coneMaterial.opacity = opacity;
  lineMaterial.depthTest = depthTest;
  coneMaterial.depthTest = depthTest;
  lineMaterial.depthWrite = false;
  coneMaterial.depthWrite = false;
  group.add(arrow);
}

export class DebugVectorRenderer {
  readonly group = new THREE.Group();

  constructor(private readonly engine: VoxelWorldEngine) {}

  render() {
    clearGroup(this.group);
    const globalDebug = this.engine.getGlobalDebug();
    for (const entity of this.engine.getEntitiesWithDebugVectors()) {
      if (entity.id === this.engine.rootId) continue;
      const debug = this.engine.getIntrospection(entity.id);
      const showForces = globalDebug.forces || debug.debug.forces || debug.debug.renderForces;
      const showVelocity = globalDebug.velocity || debug.debug.velocity || debug.debug.renderVelocity;
      const worldPos = new THREE.Vector3(debug.worldTransform.position.x, debug.worldTransform.position.y, debug.worldTransform.position.z);
      if (showForces) {
        for (const force of debug.forces) {
          const source = new THREE.Vector3(force.source.x, force.source.y, force.source.z);
          const vector = new THREE.Vector3(force.vector.x, force.vector.y, force.vector.z);
          addArrow(this.group, source, vector, 0xf2d96b, 1, true);
          addArrow(this.group, source, vector, 0xf2d96b, 0.45, false);
        }
      }
      if (showVelocity) {
        const velocity = new THREE.Vector3(debug.worldVelocity.x, debug.worldVelocity.y, debug.worldVelocity.z);
        addArrow(this.group, worldPos, velocity, 0x6bc8ff, 1, true);
        addArrow(this.group, worldPos, velocity, 0x6bc8ff, 0.45, false);
      }
    }
  }
}