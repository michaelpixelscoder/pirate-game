import "./style.css";
import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";

type BlockKind =
  | "stone"
  | "dirt"
  | "sand"
  | "wood_trunk"
  | "foliage"
  | "wood_plank"
  | "rudder";

type BlockShape = "block" | "slab" | "stairs" | "side_wall" | "center_wall";
type Orientation = "north" | "east" | "south" | "west";
type SlabPosition = "bottom" | "center" | "top";
type BlockId = string;
type ToolId = "empty" | BlockId;

type BlockDefinition = {
  id: BlockId;
  label: string;
  kind: BlockKind;
  shape: BlockShape;
  color: number;
  solid: boolean;
  orientation?: Orientation;
  slabPosition?: SlabPosition;
};

type VoxelHit = {
  entity: VoxelEntity;
  voxel: THREE.Vector3;
  position: THREE.Vector3;
  normal: THREE.Vector3;
};

type ShapeBox = {
  min: THREE.Vector3;
  max: THREE.Vector3;
};

type ShipAttachment = {
  ship: VoxelEntity;
  localPosition: THREE.Vector3;
  lastWorldPosition: THREE.Vector3;
  missingSince: number | null;
};

const BLOCKS: Record<BlockId, BlockDefinition> = {
  stone_block: { id: "stone_block", label: "Stone", kind: "stone", shape: "block", color: 0x87919a, solid: true },
  stone_slab_bottom: { id: "stone_slab_bottom", label: "Slab Bottom", kind: "stone", shape: "slab", color: 0x87919a, solid: true, slabPosition: "bottom" },
  stone_slab_center: { id: "stone_slab_center", label: "Slab Center", kind: "stone", shape: "slab", color: 0x87919a, solid: true, slabPosition: "center" },
  stone_slab_top: { id: "stone_slab_top", label: "Slab Top", kind: "stone", shape: "slab", color: 0x87919a, solid: true, slabPosition: "top" },
  stone_stairs_north: { id: "stone_stairs_north", label: "Stair N", kind: "stone", shape: "stairs", color: 0x87919a, solid: true, orientation: "north" },
  stone_stairs_east: { id: "stone_stairs_east", label: "Stair E", kind: "stone", shape: "stairs", color: 0x87919a, solid: true, orientation: "east" },
  stone_stairs_south: { id: "stone_stairs_south", label: "Stair S", kind: "stone", shape: "stairs", color: 0x87919a, solid: true, orientation: "south" },
  stone_stairs_west: { id: "stone_stairs_west", label: "Stair W", kind: "stone", shape: "stairs", color: 0x87919a, solid: true, orientation: "west" },
  stone_side_wall_north: { id: "stone_side_wall_north", label: "Wall N", kind: "stone", shape: "side_wall", color: 0x87919a, solid: true, orientation: "north" },
  stone_side_wall_east: { id: "stone_side_wall_east", label: "Wall E", kind: "stone", shape: "side_wall", color: 0x87919a, solid: true, orientation: "east" },
  stone_side_wall_south: { id: "stone_side_wall_south", label: "Wall S", kind: "stone", shape: "side_wall", color: 0x87919a, solid: true, orientation: "south" },
  stone_side_wall_west: { id: "stone_side_wall_west", label: "Wall W", kind: "stone", shape: "side_wall", color: 0x87919a, solid: true, orientation: "west" },
  stone_center_wall: { id: "stone_center_wall", label: "Post", kind: "stone", shape: "center_wall", color: 0x87919a, solid: true },
  dirt_block: { id: "dirt_block", label: "Dirt", kind: "dirt", shape: "block", color: 0x7b5535, solid: true },
  sand_block: { id: "sand_block", label: "Sand", kind: "sand", shape: "block", color: 0xd9c47c, solid: true },
  wood_trunk_block: { id: "wood_trunk_block", label: "Trunk", kind: "wood_trunk", shape: "block", color: 0x6b4629, solid: true },
  foliage_block: { id: "foliage_block", label: "Leaf", kind: "foliage", shape: "block", color: 0x3f8f4d, solid: true },
  wood_plank_block: { id: "wood_plank_block", label: "Plank", kind: "wood_plank", shape: "block", color: 0xb8824c, solid: true },
  wood_plank_slab_bottom: { id: "wood_plank_slab_bottom", label: "Slab Bottom", kind: "wood_plank", shape: "slab", color: 0xb8824c, solid: true, slabPosition: "bottom" },
  wood_plank_slab_center: { id: "wood_plank_slab_center", label: "Slab Center", kind: "wood_plank", shape: "slab", color: 0xb8824c, solid: true, slabPosition: "center" },
  wood_plank_slab_top: { id: "wood_plank_slab_top", label: "Slab Top", kind: "wood_plank", shape: "slab", color: 0xb8824c, solid: true, slabPosition: "top" },
  wood_plank_stairs_north: { id: "wood_plank_stairs_north", label: "Stair N", kind: "wood_plank", shape: "stairs", color: 0xb8824c, solid: true, orientation: "north" },
  wood_plank_stairs_east: { id: "wood_plank_stairs_east", label: "Stair E", kind: "wood_plank", shape: "stairs", color: 0xb8824c, solid: true, orientation: "east" },
  wood_plank_stairs_south: { id: "wood_plank_stairs_south", label: "Stair S", kind: "wood_plank", shape: "stairs", color: 0xb8824c, solid: true, orientation: "south" },
  wood_plank_stairs_west: { id: "wood_plank_stairs_west", label: "Stair W", kind: "wood_plank", shape: "stairs", color: 0xb8824c, solid: true, orientation: "west" },
  wood_plank_side_wall_north: { id: "wood_plank_side_wall_north", label: "Wall N", kind: "wood_plank", shape: "side_wall", color: 0xb8824c, solid: true, orientation: "north" },
  wood_plank_side_wall_east: { id: "wood_plank_side_wall_east", label: "Wall E", kind: "wood_plank", shape: "side_wall", color: 0xb8824c, solid: true, orientation: "east" },
  wood_plank_side_wall_south: { id: "wood_plank_side_wall_south", label: "Wall S", kind: "wood_plank", shape: "side_wall", color: 0xb8824c, solid: true, orientation: "south" },
  wood_plank_side_wall_west: { id: "wood_plank_side_wall_west", label: "Wall W", kind: "wood_plank", shape: "side_wall", color: 0xb8824c, solid: true, orientation: "west" },
  wood_plank_center_wall: { id: "wood_plank_center_wall", label: "Post", kind: "wood_plank", shape: "center_wall", color: 0xb8824c, solid: true },
  rudder_block_north: { id: "rudder_block_north", label: "Rudder N", kind: "rudder", shape: "side_wall", color: 0x6e4024, solid: true, orientation: "north" },
  rudder_block_east: { id: "rudder_block_east", label: "Rudder E", kind: "rudder", shape: "side_wall", color: 0x6e4024, solid: true, orientation: "east" },
  rudder_block_south: { id: "rudder_block_south", label: "Rudder S", kind: "rudder", shape: "side_wall", color: 0x6e4024, solid: true, orientation: "south" },
  rudder_block_west: { id: "rudder_block_west", label: "Rudder W", kind: "rudder", shape: "side_wall", color: 0x6e4024, solid: true, orientation: "west" }
};

const PALETTE: ToolId[] = [
  "empty",
  "wood_plank_block",
  "wood_plank_slab_bottom",
  "wood_plank_stairs_north",
  "wood_plank_side_wall_north",
  "stone_block",
  "stone_slab_bottom",
  "dirt_block",
  "sand_block",
  "wood_trunk_block",
  "foliage_block",
  "rudder_block_north"
];

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app container");
const root = app;

root.innerHTML = `
  <div class="hud">
    <div class="panel">
      <div class="title">Pirate Voxel Builder</div>
      <div class="meta">Click to capture mouse. WASD moves, double Space toggles fly. Scroll or 0 selects tools, R rotates, E uses rudder. Rudder: W/S sails, Shift boosts, A/D turns. Left click mines, right click builds.</div>
    </div>
    <div class="panel palette"></div>
  </div>
  <div class="reticle"></div>
  <div class="toast"></div>
`;

const paletteEl = document.querySelector<HTMLDivElement>(".palette");
const toastEl = document.querySelector<HTMLDivElement>(".toast");
let selectedTool: ToolId = "empty";
let selectedBlock: BlockId | null = null;
let selectedIndex = 0;
let selectedOrientation: Orientation = "north";
let selectedSlabPosition: SlabPosition = "bottom";
let flyMode = false;
let lastSpaceTap = 0;
let suppressNextJump = false;
let activeRudderShip: VoxelEntity | null = null;
let activeRudderOrientation: Orientation = "south";
let activeShipYaw: number | null = null;
let shipAttachment: ShipAttachment | null = null;
let toastUntil = 0;

const ORIENTATIONS: Orientation[] = ["north", "east", "south", "west"];
const SLAB_POSITIONS: SlabPosition[] = ["bottom", "center", "top"];
const WATER_LEVEL = -0.1;
const PLAYER_FOOT_OFFSET = 1.18;

const fullBox = (minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): ShapeBox => ({
  min: new THREE.Vector3(minX, minY, minZ),
  max: new THREE.Vector3(maxX, maxY, maxZ)
});

const SHAPE_BOXES: Record<BlockShape, ShapeBox[]> = {
  block: [fullBox(0, 0, 0, 1, 1, 1)],
  slab: [fullBox(0, 0, 0, 1, 0.5, 1)],
  stairs: [fullBox(0, 0, 0, 1, 0.5, 1), fullBox(0, 0.5, 0.5, 1, 1, 1)],
  side_wall: [fullBox(0, 0, 0, 1, 1, 0.28)],
  center_wall: [fullBox(0.3, 0, 0.3, 0.7, 1, 0.7)]
};

const ATLAS_TILE: Record<BlockKind, { col: number; row: number }> = {
  stone: { col: 0, row: 0 },
  dirt: { col: 1, row: 0 },
  sand: { col: 2, row: 0 },
  wood_trunk: { col: 0, row: 1 },
  foliage: { col: 1, row: 1 },
  wood_plank: { col: 2, row: 1 },
  rudder: { col: 2, row: 1 }
};

function renderPalette() {
  if (!paletteEl) return;
  paletteEl.innerHTML = PALETTE.map((tool, index) => {
    const block = tool === "empty" ? null : BLOCKS[orientBlockId(tool)];
    const label = tool === "empty" ? "Empty" : block?.label.replace(/ [NESW]$/, "") ?? "Block";
    const slotNumber = index === 0 ? "0" : String(index);
    return `<div class="slot ${tool === selectedTool ? "active" : ""}">
      <span class="swatch" style="background:${block ? `#${block.color.toString(16).padStart(6, "0")}` : "transparent"}"></span>
      <span>${slotNumber}. ${label}</span>
    </div>`;
  }).join("");
}

renderPalette();

function selectPaletteIndex(index: number) {
  selectedIndex = (index + PALETTE.length) % PALETTE.length;
  selectedTool = PALETTE[selectedIndex];
  selectedBlock = selectedTool === "empty" ? null : orientBlockId(selectedTool);
  renderPalette();
}

function orientBlockId(id: ToolId) {
  if (id === "empty") return id;
  const block = BLOCKS[id];
  if (block.slabPosition) return id.replace(/_(bottom|center|top)$/, `_${selectedSlabPosition}`);
  if (block.orientation) return id.replace(/_(north|east|south|west)$/, `_${selectedOrientation}`);
  return id;
}

function rotateSelectedOrientation() {
  if (selectedTool !== "empty" && BLOCKS[selectedTool].slabPosition) {
    selectedSlabPosition = SLAB_POSITIONS[(SLAB_POSITIONS.indexOf(selectedSlabPosition) + 1) % SLAB_POSITIONS.length];
  } else {
    selectedOrientation = ORIENTATIONS[(ORIENTATIONS.indexOf(selectedOrientation) + 1) % ORIENTATIONS.length];
  }
  if (selectedTool !== "empty") selectedBlock = orientBlockId(selectedTool);
  renderPalette();
}

function showToast(message: string, now = performance.now()) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.add("show");
  toastUntil = now + 1800;
}

function updateToast(now = performance.now()) {
  if (toastEl && toastUntil > 0 && now > toastUntil) {
    toastEl.classList.remove("show");
    toastUntil = 0;
  }
}

const blockAtlas = new THREE.TextureLoader().load("/textures/block-atlas.png");
blockAtlas.colorSpace = THREE.SRGBColorSpace;
blockAtlas.magFilter = THREE.NearestFilter;
blockAtlas.minFilter = THREE.NearestMipmapNearestFilter;
blockAtlas.wrapS = THREE.RepeatWrapping;
blockAtlas.wrapT = THREE.RepeatWrapping;

const rudderTexture = new THREE.TextureLoader().load("/textures/rudder.png");
rudderTexture.colorSpace = THREE.SRGBColorSpace;
rudderTexture.magFilter = THREE.NearestFilter;
rudderTexture.minFilter = THREE.NearestMipmapNearestFilter;
rudderTexture.wrapS = THREE.RepeatWrapping;
rudderTexture.wrapT = THREE.RepeatWrapping;

const waterTexture = createWaterTexture();
waterTexture.wrapS = THREE.RepeatWrapping;
waterTexture.wrapT = THREE.RepeatWrapping;
waterTexture.repeat.set(55, 55);

const waterCausticsTexture = createWaterCausticsTexture();
waterCausticsTexture.wrapS = THREE.RepeatWrapping;
waterCausticsTexture.wrapT = THREE.RepeatWrapping;
waterCausticsTexture.repeat.set(28, 28);

function blockBoxes(id: BlockId) {
  const block = BLOCKS[id];
  const turns = block.orientation ? ORIENTATIONS.indexOf(block.orientation) : 0;
  return SHAPE_BOXES[block.shape].map((box) => positionSlabBox(rotateBoxY(box, turns), block.slabPosition));
}

function positionSlabBox(box: ShapeBox, slabPosition?: SlabPosition) {
  if (!slabPosition) return box;
  if (slabPosition === "bottom") return box;
  if (slabPosition === "center") return fullBox(box.min.x, 0.25, box.min.z, box.max.x, 0.75, box.max.z);
  return fullBox(box.min.x, 0.5, box.min.z, box.max.x, 1, box.max.z);
}

function createWaterTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create water texture");
  const gradient = context.createLinearGradient(0, 0, 128, 128);
  gradient.addColorStop(0, "#2aa0bc");
  gradient.addColorStop(0.48, "#157f9f");
  gradient.addColorStop(1, "#0b5f82");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  context.strokeStyle = "rgba(222,255,255,0.2)";
  context.lineWidth = 1.2;
  for (let i = -128; i < 256; i += 24) {
    context.beginPath();
    context.moveTo(i, 6);
    context.bezierCurveTo(i + 18, 22, i + 18, 48, i + 42, 62);
    context.bezierCurveTo(i + 60, 76, i + 58, 104, i + 86, 126);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createWaterCausticsTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create water caustics texture");
  context.fillStyle = "#000000";
  context.fillRect(0, 0, 128, 128);
  context.globalCompositeOperation = "lighter";
  context.strokeStyle = "rgba(175,255,245,0.32)";
  context.lineWidth = 1.5;
  for (let ring = 0; ring < 18; ring++) {
    const cx = (ring * 37) % 140 - 6;
    const cy = (ring * 53) % 140 - 6;
    context.beginPath();
    for (let i = 0; i <= 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const r = 10 + Math.sin(i * 2.3 + ring) * 4;
      const x = cx + Math.cos(a) * r * 1.6;
      const y = cy + Math.sin(a) * r * 0.7;
      if (i === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function rotateBoxY(box: ShapeBox, turns: number): ShapeBox {
  let minX = box.min.x;
  let minZ = box.min.z;
  let maxX = box.max.x;
  let maxZ = box.max.z;
  for (let i = 0; i < turns; i++) {
    const nextMinX = 1 - maxZ;
    const nextMaxX = 1 - minZ;
    const nextMinZ = minX;
    const nextMaxZ = maxX;
    minX = nextMinX;
    maxX = nextMaxX;
    minZ = nextMinZ;
    maxZ = nextMaxZ;
  }
  return fullBox(minX, box.min.y, minZ, maxX, box.max.y, maxZ);
}

class VoxelEntity {
  readonly group = new THREE.Group();
  readonly voxels = new Map<string, BlockId>();
  private mesh?: THREE.Mesh;
  private colliders: RAPIER.Collider[] = [];

  constructor(
    readonly name: string,
    readonly body: RAPIER.RigidBody,
    private readonly world: RAPIER.World,
    private readonly scene: THREE.Scene
  ) {
    scene.add(this.group);
  }

  setBlock(x: number, y: number, z: number, block: BlockId | null) {
    const key = this.key(x, y, z);
    if (block) {
      this.voxels.set(key, block);
    } else {
      this.voxels.delete(key);
    }
    this.rebuild();
  }

  getBlock(x: number, y: number, z: number) {
    return this.voxels.get(this.key(x, y, z));
  }

  rebuild() {
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.geometry.dispose();
    }
    for (const collider of this.colliders) {
      this.world.removeCollider(collider, false);
    }
    this.colliders = [];

    const geometry = buildVoxelGeometry(this.voxels);
    const material = [
      new THREE.MeshStandardMaterial({
        map: blockAtlas,
        vertexColors: true,
        roughness: 0.86,
        metalness: 0.02
      }),
      new THREE.MeshStandardMaterial({
        map: rudderTexture,
        vertexColors: true,
        roughness: 0.78,
        metalness: 0.04
      })
    ];
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.group.add(this.mesh);

    for (const [key, id] of this.voxels) {
      const [x, y, z] = key.split(",").map(Number);
      for (const box of blockBoxes(id)) {
        const size = box.max.clone().sub(box.min);
        const center = box.min.clone().add(box.max).multiplyScalar(0.5);
        this.colliders.push(
          this.world.createCollider(
            RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2)
              .setTranslation(x + center.x, y + center.y, z + center.z)
              .setFriction(0.7),
            this.body
          )
        );
      }
    }
  }

  syncFromPhysics() {
    const position = this.body.translation();
    const rotation = this.body.rotation();
    this.group.position.set(position.x, position.y, position.z);
    this.group.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
  }

  worldToLocalVoxel(worldPosition: THREE.Vector3) {
    const local = this.group.worldToLocal(worldPosition.clone());
    return new THREE.Vector3(Math.floor(local.x), Math.floor(local.y), Math.floor(local.z));
  }

  localVoxelCenterToWorld(voxel: THREE.Vector3) {
    return this.group.localToWorld(new THREE.Vector3(voxel.x + 0.5, voxel.y + 0.5, voxel.z + 0.5));
  }

  hasBlockKind(kind: BlockKind) {
    for (const id of this.voxels.values()) {
      if (BLOCKS[id].kind === kind) return true;
    }
    return false;
  }

  nearestBlockKindWorldPosition(kind: BlockKind, worldPosition: THREE.Vector3) {
    let best: THREE.Vector3 | null = null;
    let bestDistance = Infinity;
    for (const [key, id] of this.voxels) {
      if (BLOCKS[id].kind !== kind) continue;
      const [x, y, z] = key.split(",").map(Number);
      const candidate = this.localVoxelCenterToWorld(new THREE.Vector3(x, y, z));
      const distance = candidate.distanceToSquared(worldPosition);
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
    return best;
  }

  localToWorld(localPosition: THREE.Vector3) {
    return this.group.localToWorld(localPosition.clone());
  }

  worldToLocal(worldPosition: THREE.Vector3) {
    return this.group.worldToLocal(worldPosition.clone());
  }

  private key(x: number, y: number, z: number) {
    return `${x},${y},${z}`;
  }
}

function buildVoxelGeometry(voxels: Map<string, BlockId>) {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const geometryGroups: Array<{ start: number; count: number; materialIndex: number }> = [];
  const color = new THREE.Color();

  const faceUvs = [
    [0, 0],
    [0, 1],
    [1, 1],
    [1, 0]
  ];
  const faces = (box: ShapeBox) => [
    { dir: [1, 0, 0], corners: [[box.max.x, box.min.y, box.min.z], [box.max.x, box.max.y, box.min.z], [box.max.x, box.max.y, box.max.z], [box.max.x, box.min.y, box.max.z]] },
    { dir: [-1, 0, 0], corners: [[box.min.x, box.min.y, box.max.z], [box.min.x, box.max.y, box.max.z], [box.min.x, box.max.y, box.min.z], [box.min.x, box.min.y, box.min.z]] },
    { dir: [0, 1, 0], corners: [[box.min.x, box.max.y, box.max.z], [box.max.x, box.max.y, box.max.z], [box.max.x, box.max.y, box.min.z], [box.min.x, box.max.y, box.min.z]] },
    { dir: [0, -1, 0], corners: [[box.min.x, box.min.y, box.min.z], [box.max.x, box.min.y, box.min.z], [box.max.x, box.min.y, box.max.z], [box.min.x, box.min.y, box.max.z]] },
    { dir: [0, 0, 1], corners: [[box.max.x, box.min.y, box.max.z], [box.max.x, box.max.y, box.max.z], [box.min.x, box.max.y, box.max.z], [box.min.x, box.min.y, box.max.z]] },
    { dir: [0, 0, -1], corners: [[box.min.x, box.min.y, box.min.z], [box.min.x, box.max.y, box.min.z], [box.max.x, box.max.y, box.min.z], [box.max.x, box.min.y, box.min.z]] }
  ];

  for (const [key, id] of voxels) {
    const [x, y, z] = key.split(",").map(Number);
    const block = BLOCKS[id];
    const tile = ATLAS_TILE[block.kind];
    const margin = 0.018;
    const u0 = tile.col / 3 + margin / 3;
    const u1 = (tile.col + 1) / 3 - margin / 3;
    const v0 = 1 - (tile.row + 1) / 2 + margin / 2;
    const v1 = 1 - tile.row / 2 - margin / 2;
    color.setHex(block.color);
    for (const box of blockBoxes(id)) {
      for (const face of faces(box)) {
        const [dx, dy, dz] = face.dir;
        const base = positions.length / 3;
        for (let i = 0; i < face.corners.length; i++) {
          const corner = face.corners[i];
          const uv = faceUvs[i];
          positions.push(x + corner[0], y + corner[1], z + corner[2]);
          normals.push(dx, dy, dz);
          colors.push(color.r, color.g, color.b);
          uvs.push(uv[0] === 0 ? u0 : u1, uv[1] === 0 ? v0 : v1);
        }
        const materialIndex = block.kind === "rudder" ? 1 : 0;
        const groupStart = indices.length;
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        geometryGroups.push({ start: groupStart, count: 6, materialIndex });
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  for (const group of geometryGroups) geometry.addGroup(group.start, group.count, group.materialIndex);
  geometry.computeBoundingSphere();
  return geometry;
}

async function boot() {
  await RAPIER.init();

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.setClearColor(0x88c8df);
  root.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x88c8df, 0.018);

  const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 900);
  const controls = new PointerLockControls(camera, renderer.domElement);
  camera.rotation.x = -0.28;
  camera.position.set(0, 5, 10);
  scene.add(controls.object);

  const sun = new THREE.DirectionalLight(0xfff3c7, 3.2);
  sun.position.set(-25, 45, 28);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbdeeff, 0x245066, 1.8));

  const seaGeometry = new THREE.PlaneGeometry(2000, 2000, 160, 160);
  const sea = new THREE.Mesh(
    seaGeometry,
    new THREE.MeshPhysicalMaterial({
      map: waterTexture,
      color: 0x2c8fbc,
      roughness: 0.08,
      metalness: 0,
      transmission: 0.08,
      thickness: 1.8,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      emissive: 0x063a58,
      emissiveIntensity: 0.16
    })
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = WATER_LEVEL;
  sea.receiveShadow = true;
  sea.renderOrder = 1;
  scene.add(sea);

  const caustics = new THREE.Mesh(
    new THREE.PlaneGeometry(2000, 2000, 160, 160),
    new THREE.MeshStandardMaterial({
      map: waterCausticsTexture,
      color: 0xb8fff2,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      emissive: 0x83fff1,
      emissiveIntensity: 0.45
    })
  );
  caustics.rotation.x = -Math.PI / 2;
  caustics.position.y = WATER_LEVEL + 0.012;
  caustics.renderOrder = 2;
  scene.add(caustics);

  const physics = new RAPIER.World({ x: 0, y: -18, z: 0 });
  const entities: VoxelEntity[] = [];

  const playerBody = physics.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 4, 8).setCanSleep(false).setGravityScale(1.35)
  );
  physics.createCollider(RAPIER.ColliderDesc.capsule(0.85, 0.38).setFriction(0.1), playerBody);

  const islandBody = physics.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(-10, -2, -12));
  const island = new VoxelEntity("island", islandBody, physics, scene);
  seedIsland(island);
  entities.push(island);

  const shipBody = physics.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 0.2, 1).setGravityScale(0).setLinearDamping(2.2).setAngularDamping(5)
  );
  const ship = new VoxelEntity("ship", shipBody, physics, scene);
  seedShip(ship);
  entities.push(ship);

  const ghostMaterial = new THREE.MeshStandardMaterial({
    color: 0xf7d36b,
    transparent: true,
    opacity: 0.36,
    depthWrite: false,
    roughness: 0.5
  });
  const ghost = new THREE.Mesh(new THREE.BufferGeometry(), ghostMaterial);
  ghost.visible = false;
  scene.add(ghost);

  const keys = new Set<string>();
  window.addEventListener("keydown", (event) => {
    keys.add(event.code);
    if (event.code === "Space" && !event.repeat) {
      const now = performance.now();
      if (now - lastSpaceTap < 320) {
        flyMode = !flyMode;
        playerBody.setGravityScale(flyMode ? 0 : 1.35, true);
        playerBody.setLinvel({ x: playerBody.linvel().x, y: 0, z: playerBody.linvel().z }, true);
        suppressNextJump = true;
      }
      lastSpaceTap = now;
    }
    if (event.code === "KeyR" && !event.repeat) {
      rotateSelectedOrientation();
    }
    if (event.code === "KeyE" && !event.repeat) {
      if (activeRudderShip) {
        activeRudderShip = null;
        activeShipYaw = null;
        showToast("Left rudder");
      } else {
        const rudder = findUsableRudder(camera, [ship], playerBody);
        if (rudder) {
          activeRudderShip = rudder.ship;
          activeRudderOrientation = rudder.orientation;
          activeShipYaw = new THREE.Euler().setFromQuaternion(rudder.ship.group.quaternion, "YXZ").y;
          shipAttachment = {
            ship: rudder.ship,
            localPosition: rudder.ship.worldToLocal(new THREE.Vector3(playerBody.translation().x, playerBody.translation().y, playerBody.translation().z)),
            lastWorldPosition: new THREE.Vector3(playerBody.translation().x, playerBody.translation().y, playerBody.translation().z),
            missingSince: null
          };
          playerBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
          showToast("Rudder engaged");
        } else {
          showToast("Aim at the rudder and press E");
        }
      }
    }
    const digit = event.key === "0" ? 10 : Number(event.key);
    if (event.key === "0") {
      selectPaletteIndex(0);
    } else if (digit >= 1 && digit < Math.min(PALETTE.length, 10)) {
      selectPaletteIndex(digit);
    }
  });
  window.addEventListener("keyup", (event) => keys.delete(event.code));
  renderer.domElement.addEventListener("wheel", (event) => {
    event.preventDefault();
    selectPaletteIndex(selectedIndex + (event.deltaY > 0 ? 1 : -1));
  }, { passive: false });

  renderer.domElement.addEventListener("click", () => controls.lock());
  renderer.domElement.addEventListener("contextmenu", (event: MouseEvent) => event.preventDefault());
  renderer.domElement.addEventListener("pointerdown", (event: PointerEvent) => {
    if (!controls.isLocked) return;
    const hit = raycastVoxels(camera, entities);
    if (!hit) return;

    const target = hit.entity.worldToLocalVoxel(hit.position.clone().addScaledVector(hit.normal, event.button === 2 ? 0.05 : -0.05));
    if (event.button === 0) {
      hit.entity.setBlock(target.x, target.y, target.z, null);
    }
    if (event.button === 2) {
      const place = hit.entity.worldToLocalVoxel(hit.position.clone().addScaledVector(hit.normal, 0.55));
      if (selectedBlock) hit.entity.setBlock(place.x, place.y, place.z, selectedBlock);
    }
  });

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const elapsed = clock.elapsedTime;
    updateToast();
    updateWater(sea, caustics, elapsed);
    updatePlayer(dt, controls, playerBody, keys, flyMode, activeRudderShip !== null);
    updateShip(ship, shipBody, playerBody, keys, elapsed, activeRudderShip === ship);
    physics.step();

    for (const entity of entities) entity.syncFromPhysics();
    updateShipAttachment(playerBody, ship, elapsed, activeRudderShip !== null);
    updateCamera(controls, playerBody, activeRudderShip, activeRudderOrientation);
    const p = playerBody.translation();
    sea.position.x = p.x;
    sea.position.z = p.z;
    caustics.position.x = p.x;
    caustics.position.z = p.z;
    updateGhost(ghost, camera, entities);

    renderer.render(scene, camera);
  });

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function seedIsland(entity: VoxelEntity) {
  for (let x = -7; x <= 7; x++) {
    for (let z = -6; z <= 6; z++) {
      const d = Math.sqrt((x / 7) ** 2 + (z / 6) ** 2);
      if (d > 1) continue;
      const h = Math.max(1, Math.floor(4 - d * 3));
      for (let y = 0; y < h; y++) {
        entity.voxels.set(`${x},${y},${z}`, y === h - 1 ? "sand_block" : y < 1 ? "stone_block" : "dirt_block");
      }
    }
  }
  for (let y = 3; y < 8; y++) entity.voxels.set(`2,${y},-1`, "wood_trunk_block");
  for (let x = -1; x <= 5; x++) {
    for (let y = 7; y <= 9; y++) {
      for (let z = -4; z <= 2; z++) {
        if (Math.abs(x - 2) + Math.abs(y - 8) + Math.abs(z + 1) < 6) entity.voxels.set(`${x},${y},${z}`, "foliage_block");
      }
    }
  }
  entity.rebuild();
}

function seedShip(entity: VoxelEntity) {
  for (let x = -4; x <= 4; x++) {
    for (let z = -9; z <= 9; z++) {
      const beam = 3 - Math.floor(Math.abs(z) / 4);
      if (Math.abs(x) <= beam) entity.voxels.set(`${x},0,${z}`, "wood_plank_block");
      if (Math.abs(x) === beam && beam > 0) entity.voxels.set(`${x},1,${z}`, x < 0 ? "wood_plank_side_wall_west" : "wood_plank_side_wall_east");
    }
  }
  for (let y = 1; y <= 7; y++) entity.voxels.set(`0,${y},0`, "wood_trunk_block");
  for (let x = -3; x <= 3; x++) {
    for (let y = 3; y <= 5; y++) entity.voxels.set(`${x},${y},1`, "foliage_block");
  }
  entity.voxels.set(`0,1,-7`, "wood_plank_stairs_north");
  entity.voxels.set(`0,1,7`, "wood_plank_stairs_south");
  entity.voxels.set(`0,1,9`, "rudder_block_south");
  entity.voxels.set(`0,2,9`, "wood_plank_center_wall");
  entity.rebuild();
}

function updateWater(sea: THREE.Mesh, caustics: THREE.Mesh, elapsed: number) {
  const worldAnchorX = sea.position.x / 2000;
  const worldAnchorZ = sea.position.z / 2000;
  waterTexture.offset.x = worldAnchorX + elapsed * 0.01;
  waterTexture.offset.y = worldAnchorZ + elapsed * 0.006;
  waterCausticsTexture.offset.x = worldAnchorX * 0.55 - elapsed * 0.006;
  waterCausticsTexture.offset.y = worldAnchorZ * 0.55 + elapsed * 0.004;
  for (const mesh of [sea, caustics]) {
    const position = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i) + mesh.position.x;
      const y = position.getY(i) + mesh.position.z;
      const wave =
        Math.sin(x * 0.032 + elapsed * 1.25) * 0.01 +
        Math.cos(y * 0.025 + elapsed * 0.9) * 0.007;
      position.setZ(i, wave);
    }
    position.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
  }
}

function updateGhost(ghost: THREE.Mesh, camera: THREE.Camera, entities: VoxelEntity[]) {
  if (!selectedBlock) {
    ghost.visible = false;
    return;
  }
  const hit = raycastVoxels(camera, entities);
  if (!hit) {
    ghost.visible = false;
    return;
  }
  const place = hit.entity.worldToLocalVoxel(hit.position.clone().addScaledVector(hit.normal, 0.55));
  ghost.geometry.dispose();
  ghost.geometry = buildVoxelGeometry(new Map([["0,0,0", selectedBlock]]));
  ghost.position.copy(hit.entity.group.localToWorld(new THREE.Vector3(place.x, place.y, place.z)));
  ghost.quaternion.copy(hit.entity.group.quaternion);
  ghost.visible = true;
}

function findUsableRudder(camera: THREE.Camera, ships: VoxelEntity[], playerBody: RAPIER.RigidBody) {
  const hit = raycastVoxels(camera, ships);
  if (hit) {
    const id = hit.entity.getBlock(hit.voxel.x, hit.voxel.y, hit.voxel.z);
    if (id && BLOCKS[id].kind === "rudder") return { ship: hit.entity, orientation: BLOCKS[id].orientation ?? "south" };
  }

  const player = playerBody.translation();
  const playerWorld = new THREE.Vector3(player.x, player.y, player.z);
  for (const ship of ships) {
    let best: { ship: VoxelEntity; orientation: Orientation; distance: number } | null = null;
    for (const [key, id] of ship.voxels) {
      const block = BLOCKS[id];
      if (block.kind !== "rudder") continue;
      const [x, y, z] = key.split(",").map(Number);
      const world = ship.localVoxelCenterToWorld(new THREE.Vector3(x, y, z));
      const distance = world.distanceTo(playerWorld);
      if (distance < 4.2 && (!best || distance < best.distance)) {
        best = { ship, orientation: block.orientation ?? "south", distance };
      }
    }
    if (best) return best;
  }
  return null;
}

function orientationVector(orientation: Orientation) {
  if (orientation === "north") return new THREE.Vector3(0, 0, -1);
  if (orientation === "east") return new THREE.Vector3(1, 0, 0);
  if (orientation === "south") return new THREE.Vector3(0, 0, 1);
  return new THREE.Vector3(-1, 0, 0);
}

function getShipTopSupport(ship: VoxelEntity, worldPosition: THREE.Vector3) {
  const local = ship.worldToLocal(worldPosition);
  const footY = local.y - PLAYER_FOOT_OFFSET;
  let bestTop = -Infinity;
  let found = false;

  for (const [key, id] of ship.voxels) {
    const [x, y, z] = key.split(",").map(Number);
    for (const box of blockBoxes(id)) {
      const minX = x + box.min.x - 0.08;
      const maxX = x + box.max.x + 0.08;
      const minZ = z + box.min.z - 0.08;
      const maxZ = z + box.max.z + 0.08;
      const top = y + box.max.y;
      if (local.x < minX || local.x > maxX || local.z < minZ || local.z > maxZ) continue;
      if (top <= footY + 0.18 && top > bestTop) {
        bestTop = top;
        found = true;
      }
    }
  }

  return found ? bestTop : null;
}

function updateShipAttachment(playerBody: RAPIER.RigidBody, ship: VoxelEntity, elapsed: number, isDrivingShip: boolean) {
  const p = playerBody.translation();
  let playerWorld = new THREE.Vector3(p.x, p.y, p.z);

  if (shipAttachment?.ship === ship) {
    const carried = ship.localToWorld(shipAttachment.localPosition);
    if (isDrivingShip) {
      playerWorld = carried;
      playerBody.setTranslation({ x: carried.x, y: carried.y, z: carried.z }, true);
    } else {
      const delta = carried.clone().sub(shipAttachment.lastWorldPosition);
      delta.y = 0;
      if (delta.lengthSq() < 9) {
        playerWorld.add(delta);
        playerBody.setTranslation({ x: playerWorld.x, y: playerWorld.y, z: playerWorld.z }, true);
      }
    }
  }

  const topBelow = getShipTopSupport(ship, playerWorld);

  if (topBelow !== null) {
    shipAttachment = {
      ship,
      localPosition: ship.worldToLocal(playerWorld),
      lastWorldPosition: playerWorld.clone(),
      missingSince: null
    };
    return;
  }

  if (!shipAttachment || shipAttachment.ship !== ship) return;
  if (shipAttachment.missingSince === null) shipAttachment.missingSince = elapsed;
  if (!isDrivingShip && elapsed - shipAttachment.missingSince > 1) {
    shipAttachment = null;
    return;
  }

  const carried = ship.localToWorld(shipAttachment.localPosition);
  if (isDrivingShip) {
    playerBody.setTranslation({ x: carried.x, y: carried.y, z: carried.z }, true);
    shipAttachment.lastWorldPosition = carried.clone();
  } else {
    shipAttachment.lastWorldPosition = playerWorld.clone();
  }
}

function updateCamera(
  controls: PointerLockControls,
  playerBody: RAPIER.RigidBody,
  ship: VoxelEntity | null,
  rudderOrientation: Orientation
) {
  if (!ship) {
    const p = playerBody.translation();
    controls.object.position.set(p.x, p.y + 0.75, p.z);
    return;
  }

  const rudderOut = orientationVector(rudderOrientation).applyQuaternion(ship.group.quaternion).normalize();
  const shipCenter = ship.group.localToWorld(new THREE.Vector3(0, 1.3, 0));
  const cameraPosition = shipCenter.clone().addScaledVector(rudderOut, 16).add(new THREE.Vector3(0, 7, 0));
  const lookAt = shipCenter.clone().addScaledVector(rudderOut, -4).add(new THREE.Vector3(0, 1.6, 0));
  controls.object.position.copy(cameraPosition);
  controls.object.lookAt(lookAt);
}

function raycastVoxels(camera: THREE.Camera, entities: VoxelEntity[]): VoxelHit | null {
  const origin = new THREE.Vector3();
  const direction = new THREE.Vector3();
  camera.getWorldPosition(origin);
  camera.getWorldDirection(direction);

  let best: VoxelHit | null = null;
  let bestDistance = Infinity;

  for (const entity of entities) {
    const inverseMatrix = entity.group.matrixWorld.clone().invert();
    const localOrigin = origin.clone().applyMatrix4(inverseMatrix);
    const localDirection = direction.clone().transformDirection(inverseMatrix).normalize();
    const ray = new THREE.Ray(localOrigin, localDirection);
    for (const [key, id] of entity.voxels) {
      const [x, y, z] = key.split(",").map(Number);
      for (const shapeBox of blockBoxes(id)) {
        const box = new THREE.Box3(
          new THREE.Vector3(x + shapeBox.min.x, y + shapeBox.min.y, z + shapeBox.min.z),
          new THREE.Vector3(x + shapeBox.max.x, y + shapeBox.max.y, z + shapeBox.max.z)
        );
        const localHit = new THREE.Vector3();
        if (!ray.intersectBox(box, localHit)) continue;
        const worldHit = entity.group.localToWorld(localHit.clone());
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
          entity,
          voxel: new THREE.Vector3(x, y, z),
          position: worldHit,
          normal: normal.transformDirection(entity.group.matrixWorld).normalize()
        };
        bestDistance = distance;
      }
    }
  }

  return best;
}

function updatePlayer(
  dt: number,
  controls: PointerLockControls,
  body: RAPIER.RigidBody,
  keys: Set<string>,
  isFlying: boolean,
  isDrivingShip: boolean
) {
  if (isDrivingShip) {
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setGravityScale(0, true);
    return;
  }

  const forward = new THREE.Vector3();
  controls.object.getWorldDirection(forward);
  const flatForward = forward.clone();
  flatForward.y = 0;
  flatForward.normalize();
  const right = new THREE.Vector3().crossVectors(flatForward, new THREE.Vector3(0, 1, 0)).normalize();
  const wish = new THREE.Vector3();

  if (keys.has("KeyW")) wish.add(isFlying ? forward : flatForward);
  if (keys.has("KeyS")) wish.sub(isFlying ? forward : flatForward);
  if (keys.has("KeyD")) wish.add(right);
  if (keys.has("KeyA")) wish.sub(right);
  const position = body.translation();
  const isSwimming = !isFlying && position.y < WATER_LEVEL + 0.8;
  if ((isFlying || isSwimming) && keys.has("Space")) wish.y += 1;
  if ((isFlying || isSwimming) && keys.has("ControlLeft")) wish.y -= 1;
  if (wish.lengthSq() > 0) wish.normalize();

  if (!isFlying && position.y < WATER_LEVEL - 1.25 && !keys.has("ControlLeft")) {
    body.setTranslation({ x: position.x, y: WATER_LEVEL - 1.25, z: position.z }, true);
  }

  body.setGravityScale(isFlying ? 0 : isSwimming ? 0.22 : 1.35, true);
  const velocity = body.linvel();
  const speed = keys.has("ShiftLeft") ? 9 : isSwimming ? 3.5 : 5.5;
  const swimBuoyancy = isSwimming ? Math.min(1.4, (WATER_LEVEL + 0.25 - position.y) * 1.8) : 0;
  const nextY = isFlying ? wish.y * speed : isSwimming ? wish.y * speed + swimBuoyancy : velocity.y;
  body.setLinvel({ x: wish.x * speed, y: nextY, z: wish.z * speed }, true);
  if (!isFlying && !isSwimming && keys.has("Space") && Math.abs(velocity.y) < 0.08 && !suppressNextJump) {
    body.applyImpulse({ x: 0, y: 6.5 * dt * 60, z: 0 }, true);
  }
  suppressNextJump = false;
}

function updateShip(
  ship: VoxelEntity,
  body: RAPIER.RigidBody,
  playerBody: RAPIER.RigidBody,
  keys: Set<string>,
  elapsed: number,
  isRudderActive: boolean
) {
  const translation = body.translation();
  const bob = Math.sin(elapsed * 1.2 + translation.x * 0.07 + translation.z * 0.04) * 0.035;
  const currentRotation = new THREE.Quaternion(body.rotation().x, body.rotation().y, body.rotation().z, body.rotation().w);
  let yaw = activeShipYaw ?? new THREE.Euler().setFromQuaternion(currentRotation, "YXZ").y;
  if (isRudderActive) {
    const turn = (keys.has("KeyA") || keys.has("KeyQ") ? 1 : 0) + (keys.has("KeyD") ? -1 : 0);
    yaw += turn * 1.65 * (1 / 60);
    activeShipYaw = yaw;
  }
  const levelRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0, "YXZ"));
  body.setRotation({ x: levelRotation.x, y: levelRotation.y, z: levelRotation.z, w: levelRotation.w }, true);
  body.setTranslation({ x: translation.x, y: WATER_LEVEL + 0.18 + bob, z: translation.z }, true);
  body.setLinvel({ x: body.linvel().x, y: 0, z: body.linvel().z }, true);
  body.setAngvel({ x: 0, y: body.angvel().y, z: 0 }, true);
  if (!isRudderActive) return;

  const player = playerBody.translation();
  const rudder = ship.nearestBlockKindWorldPosition("rudder", new THREE.Vector3(player.x, player.y, player.z));
  if (!rudder || rudder.distanceTo(new THREE.Vector3(player.x, player.y, player.z)) > 4.5) {
    activeRudderShip = null;
    activeShipYaw = null;
    return;
  }
  const rudderOut = orientationVector(activeRudderOrientation).applyQuaternion(levelRotation).normalize();
  const forward = rudderOut.multiplyScalar(-1);
  const throttle = (keys.has("KeyW") || keys.has("ShiftLeft") ? 1 : 0) + (keys.has("KeyS") ? -0.45 : 0);
  const speed = keys.has("ShiftLeft") ? 6 : 3.2;
  const desired = forward.multiplyScalar(throttle * speed);
  const current = body.linvel();
  body.setLinvel(
    {
      x: THREE.MathUtils.lerp(current.x, desired.x, 0.08),
      y: 0,
      z: THREE.MathUtils.lerp(current.z, desired.z, 0.08)
    },
    true
  );
  body.setAngvel({ x: 0, y: 0, z: 0 }, true);
}

boot().catch((error) => {
  console.error(error);
  root.innerHTML = `<pre>${String(error)}</pre>`;
});
