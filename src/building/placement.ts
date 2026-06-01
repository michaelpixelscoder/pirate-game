import * as THREE from "three";
import type { EntityId, VoxelWorldEngine } from "../engine";
import type { BlockCell, BlockDefinition, BuildRegistry, ToolDefinition } from "./registry";
import { rotateBlockCells } from "./registry";

export type RaycastHit = {
  entityId: EntityId;
  entityName: string;
  cellKey: string;
  blockId: string;
  voxel: THREE.Vector3;
  worldPoint: THREE.Vector3;
  normal: THREE.Vector3;
};

type BlockInstance = {
  blockId: string;
  origin: THREE.Vector3;
  cells: string[];
};

type DestroyState = {
  hitKey: string;
  startedAt: number;
};

export type BlockPlacementPreview = {
  visible: boolean;
  entityId: EntityId | null;
  block: BlockDefinition | null;
  origin: THREE.Vector3 | null;
  cells: BlockCell[];
  rotationTurns: number;
};

export class BlockPlacementSystem {
  private selectedIndex = 0;
  private rotationTurns = 0;
  private destroyState: DestroyState | null = null;
  private readonly instancesByEntity = new Map<EntityId, Map<string, BlockInstance>>();

  constructor(
    private readonly engine: VoxelWorldEngine,
    private readonly registry: BuildRegistry,
    private readonly editableEntities: () => EntityId[]
  ) {}

  get entries() {
    return [{ kind: "empty" as const, id: "empty", name: "Empty Hand", icon: "∅" }, ...this.registry.listTools()];
  }

  get selectedTool() {
    return this.entries[this.selectedIndex] ?? this.entries[0];
  }

  get selectedBlock() {
    if (this.selectedIndex === 0) return null;
    const tool = this.entries[this.selectedIndex] as ToolDefinition | undefined;
    if (!tool) return null;
    return this.registry.getBlock(tool.blockId);
  }

  get selectionIndex() {
    return this.selectedIndex;
  }

  selectIndex(index: number) {
    const clamped = Math.min(Math.max(index, 0), this.entries.length - 1);
    this.selectedIndex = clamped;
  }

  cycleSelection(delta: number) {
    const total = this.entries.length;
    if (total === 0) return;
    this.selectedIndex = ((this.selectedIndex + delta) % total + total) % total;
  }

  rotateSelection() {
    this.rotationTurns = (this.rotationTurns + 1) % 4;
  }

  resetRotation() {
    this.rotationTurns = 0;
  }

  getRotationTurns() {
    return this.rotationTurns;
  }

  hasSelection() {
    return this.selectedIndex > 0;
  }

  raycast(camera: THREE.Camera) {
    const origin = new THREE.Vector3();
    const direction = new THREE.Vector3();
    camera.getWorldPosition(origin);
    camera.getWorldDirection(direction);

    let best: RaycastHit | null = null;
    let bestDistance = Infinity;

    for (const entity of this.engine.listEntities()) {
      if (entity.kind !== "voxel" || !entity.voxels?.size) continue;
      const entityInstanceMap = this.instancesByEntity.get(entity.id);
      const inverseMatrix = this.worldMatrix(entity.id).clone().invert();
      const localOrigin = origin.clone().applyMatrix4(inverseMatrix);
      const localDirection = direction.clone().transformDirection(inverseMatrix).normalize();
      const ray = new THREE.Ray(localOrigin, localDirection);

      for (const [key, cell] of entity.voxels) {
        const [x, y, z] = key.split(",").map(Number);
        const box = new THREE.Box3(new THREE.Vector3(x, y, z), new THREE.Vector3(x + 1, y + 1, z + 1));
        const localHit = new THREE.Vector3();
        if (!ray.intersectBox(box, localHit)) continue;
        const worldHit = this.worldPoint(entity.id, localHit);
        const distance = origin.distanceTo(worldHit);
        if (distance > 8 || distance >= bestDistance) continue;
        const normal = localHit.clone().sub(box.getCenter(new THREE.Vector3()));
        const axis = Math.max(Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z));
        normal.set(
          Math.abs(normal.x) === axis ? Math.sign(normal.x) : 0,
          Math.abs(normal.y) === axis ? Math.sign(normal.y) : 0,
          Math.abs(normal.z) === axis ? Math.sign(normal.z) : 0
        );
        best = {
          entityId: entity.id,
          entityName: entity.name,
          cellKey: key,
          blockId: cell.value,
          voxel: new THREE.Vector3(x, y, z),
          worldPoint: worldHit,
          // Keep hit normal in local voxel space so placement offsets are grid-aligned.
          normal
        };
        bestDistance = distance;
      }
    }

    return best;
  }

  getPreview(camera: THREE.Camera): BlockPlacementPreview {
    const block = this.selectedBlock;
    const hit = this.raycast(camera);
    if (!block || !hit) {
      return { visible: false, entityId: null, block, origin: null, cells: [], rotationTurns: this.rotationTurns };
    }

    const origin = hit.voxel.clone().add(hit.normal);
    const cells = this.worldCellsForBlock(block, origin, this.rotationTurns);
    return {
      visible: true,
      entityId: hit.entityId,
      block,
      origin,
      cells,
      rotationTurns: this.rotationTurns
    };
  }

  update(camera: THREE.Camera, dt: number, now: number, primaryDown: boolean) {
    const hit = this.raycast(camera);
    if (!primaryDown || !hit) {
      this.destroyState = null;
      return { destroyed: false, hit };
    }

    const hitKey = `${hit.entityId}:${hit.cellKey}`;
    if (!this.destroyState || this.destroyState.hitKey !== hitKey) {
      this.destroyState = { hitKey, startedAt: now };
      return { destroyed: false, hit, progress: 0 };
    }

    const progress = Math.min(1, (now - this.destroyState.startedAt) / 500);
    if (progress >= 1) {
      this.destroyHit(hit);
      this.destroyState = null;
      return { destroyed: true, hit, progress: 1 };
    }

    return { destroyed: false, hit, progress };
  }

  place(camera: THREE.Camera) {
    const block = this.selectedBlock;
    if (!block) return false;
    const hit = this.raycast(camera);
    if (!hit) return false;
    const origin = hit.voxel.clone().add(hit.normal);
    return this.placeBlock(hit.entityId, block, origin, this.rotationTurns);
  }

  getDestroyProgress(camera: THREE.Camera, primaryDown: boolean) {
    const hit = this.raycast(camera);
    if (!primaryDown || !hit || !this.destroyState) return { progress: 0, visible: false };
    const hitKey = `${hit.entityId}:${hit.cellKey}`;
    if (hitKey !== this.destroyState.hitKey) return { progress: 0, visible: false };
    return { progress: Math.min(1, (performance.now() - this.destroyState.startedAt) / 500), visible: true };
  }

  getDestroyState(camera: THREE.Camera) {
    const hit = this.raycast(camera);
    if (!hit) return null;
    const instance = this.instancesByEntity.get(hit.entityId)?.get(hit.cellKey);
    return { hit, instance };
  }

  createGhostMeshes(group: THREE.Group, camera: THREE.Camera) {
    const preview = this.getPreview(camera);
    while (group.children.length) {
      const child = group.children[0] as THREE.Mesh;
      group.remove(child);
      child.geometry.dispose();
      if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
      else child.material.dispose();
    }

    if (!preview.visible || !preview.block || !preview.origin) {
      group.visible = false;
      return;
    }

    if (!preview.entityId) {
      group.visible = false;
      return;
    }

    const world = this.engine.getIntrospection(preview.entityId).worldTransform;
    group.position.set(world.position.x, world.position.y, world.position.z);
    group.quaternion.set(world.rotation.x, world.rotation.y, world.rotation.z, world.rotation.w);
    group.scale.set(world.scale.x, world.scale.y, world.scale.z);

    for (const cell of preview.cells) {
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      const material = new THREE.MeshBasicMaterial({
        color: preview.block.color,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        depthTest: false,
        wireframe: false
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(cell.x + 0.5, cell.y + 0.5, cell.z + 0.5);
      group.add(mesh);
    }
    group.visible = true;
  }

  destroyCurrentTarget(camera: THREE.Camera) {
    const hit = this.raycast(camera);
    if (!hit) return false;
    this.destroyHit(hit);
    return true;
  }

  private destroyHit(hit: RaycastHit) {
    const instance = this.instancesByEntity.get(hit.entityId)?.get(hit.cellKey);
    if (!instance) {
      this.engine.removeVoxel(hit.entityId, hit.voxel.x, hit.voxel.y, hit.voxel.z);
      return;
    }
    for (const cellKey of instance.cells) {
      const [x, y, z] = cellKey.split(",").map(Number);
      this.engine.removeVoxel(hit.entityId, x, y, z);
      this.instancesByEntity.get(hit.entityId)?.delete(cellKey);
    }
  }

  private placeBlock(entityId: EntityId, block: BlockDefinition, origin: THREE.Vector3, turns: number) {
    const cells = this.worldCellsForBlock(block, origin, turns);
    const occupied = this.instancesByEntity.get(entityId) ?? new Map<string, BlockInstance>();
    for (const cell of cells) {
      const key = `${cell.x},${cell.y},${cell.z}`;
      if (this.engine.getEntity(entityId)?.voxels?.has(key)) return false;
    }

    const instanceId = `${block.id}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
    const instanceCells: string[] = [];
    for (const cell of cells) {
      this.engine.addVoxel(entityId, { x: cell.x, y: cell.y, z: cell.z, value: block.id });
      instanceCells.push(`${cell.x},${cell.y},${cell.z}`);
      occupied.set(`${cell.x},${cell.y},${cell.z}`, { blockId: block.id, origin: origin.clone(), cells: instanceCells });
    }
    this.instancesByEntity.set(entityId, occupied);
    return true;
  }

  private worldCellsForBlock(block: BlockDefinition, origin: THREE.Vector3, turns: number) {
    return rotateBlockCells(block.cells, turns).map((cell) => ({
      x: origin.x + cell.x,
      y: origin.y + cell.y,
      z: origin.z + cell.z
    }));
  }

  private worldMatrix(entityId: EntityId) {
    const world = this.engine.getIntrospection(entityId).worldTransform;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3(world.position.x, world.position.y, world.position.z);
    const quaternion = new THREE.Quaternion(world.rotation.x, world.rotation.y, world.rotation.z, world.rotation.w);
    const scale = new THREE.Vector3(world.scale.x, world.scale.y, world.scale.z);
    matrix.compose(position, quaternion, scale);
    return matrix;
  }

  private worldPoint(entityId: EntityId, localPoint: THREE.Vector3) {
    return localPoint.clone().applyMatrix4(this.worldMatrix(entityId));
  }
}
