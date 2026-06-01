import "./style.css";
import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { createBoatTemplate } from "./worlds/boat";
import { createIslandTemplate } from "./worlds/island";
import type { StructureTemplate } from "./worlds/types";

type BlockKind =
  | "stone"
  | "dirt"
  | "sand"
  | "wood_trunk"
  | "foliage"
  | "wood_plank"
  | "rudder"
  | "sail"
  | "keel";

type BlockShape = "block" | "slab" | "stairs" | "side_wall" | "center_wall";
type Orientation = "north" | "east" | "south" | "west";
type SlabPosition = "bottom" | "center" | "top";
type BlockId = string;
type MultiBlockItemId = "sail_item" | "keel_item";
type ToolId = "empty" | BlockId | MultiBlockItemId;

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
  blockId: BlockId;
};

type ShapeBox = {
  min: THREE.Vector3;
  max: THREE.Vector3;
};

type ShipAttachment = {
  ship: VoxelEntity;
  localPosition: THREE.Vector3;
  localVelocity: THREE.Vector3;
  missingSince: number | null;
  localBaseY: number;
};

type MultiBlockPart = {
  offset: THREE.Vector3;
  block: BlockId;
};

type MultiBlockItem = {
  id: MultiBlockItemId;
  label: string;
  color: number;
  parts: MultiBlockPart[];
};

type ShipPhysicsCache = {
  voxelCount: number;
  hullCount: number;
  sailArea: number;
  keelArea: number;
  centerOfMass: THREE.Vector3;
  sailCenter: THREE.Vector3;
  keelCenter: THREE.Vector3;
  waterline: number;
  length: number;
  beam: number;
};

type WindState = {
  direction: THREE.Vector3;
  speed: number;
  arrow: THREE.ArrowHelper;
};

type RopeAttachment = {
  worldPoint: THREE.Vector3;
  entity: VoxelEntity;
  localPoint: THREE.Vector3;
};

type RopeLine = {
  start: RopeAttachment;
  end: RopeAttachment | null;
  endWorldPoint: THREE.Vector3;
  restLength: number;
  active: boolean;
  slack: number;
};

type ShipContact = {
  ship: VoxelEntity;
  localPosition: THREE.Vector3;
  baseY: number;
};

type StructureVoxel = {
  x: number;
  y: number;
  z: number;
  block: BlockId;
};

type StructureSave = {
  kind: "structure";
  version: 1;
  name: string;
  bodyType: "fixed" | "dynamic";
  position: [number, number, number];
  rotation: [number, number, number, number];
  voxels: StructureVoxel[];
};

type RopeSave = {
  start: {
    entity: string;
    point: [number, number, number];
  };
  end:
    | {
        entity: string;
        point: [number, number, number];
      }
    | null;
  endWorldPoint: [number, number, number];
  restLength: number;
  active: boolean;
};

type WorldSave = {
  kind: "world";
  version: 1;
  wind: {
    direction: [number, number, number];
    speed: number;
    locked: boolean;
  };
  entities: StructureSave[];
  ropes: RopeSave[];
};

type ForceDebugRecord = {
  label: string;
  source: THREE.Vector3;
  vector: THREE.Vector3;
  color: number;
  saturates?: boolean;
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
  rudder_block_west: { id: "rudder_block_west", label: "Rudder W", kind: "rudder", shape: "side_wall", color: 0x6e4024, solid: true, orientation: "west" },
  anchor_block_north: { id: "anchor_block_north", label: "Anchor N", kind: "rudder", shape: "center_wall", color: 0x5a6670, solid: true, orientation: "north" },
  anchor_block_east: { id: "anchor_block_east", label: "Anchor E", kind: "rudder", shape: "center_wall", color: 0x5a6670, solid: true, orientation: "east" },
  anchor_block_south: { id: "anchor_block_south", label: "Anchor S", kind: "rudder", shape: "center_wall", color: 0x5a6670, solid: true, orientation: "south" },
  anchor_block_west: { id: "anchor_block_west", label: "Anchor W", kind: "rudder", shape: "center_wall", color: 0x5a6670, solid: true, orientation: "west" },
  bollard_block_north: { id: "bollard_block_north", label: "Bollard N", kind: "rudder", shape: "center_wall", color: 0x936b3b, solid: true, orientation: "north" },
  bollard_block_east: { id: "bollard_block_east", label: "Bollard E", kind: "rudder", shape: "center_wall", color: 0x936b3b, solid: true, orientation: "east" },
  bollard_block_south: { id: "bollard_block_south", label: "Bollard S", kind: "rudder", shape: "center_wall", color: 0x936b3b, solid: true, orientation: "south" },
  bollard_block_west: { id: "bollard_block_west", label: "Bollard W", kind: "rudder", shape: "center_wall", color: 0x936b3b, solid: true, orientation: "west" },
  sail_block_north: { id: "sail_block_north", label: "Sail N", kind: "sail", shape: "side_wall", color: 0xf1e4c4, solid: true, orientation: "north" },
  sail_block_east: { id: "sail_block_east", label: "Sail E", kind: "sail", shape: "side_wall", color: 0xf1e4c4, solid: true, orientation: "east" },
  sail_block_south: { id: "sail_block_south", label: "Sail S", kind: "sail", shape: "side_wall", color: 0xf1e4c4, solid: true, orientation: "south" },
  sail_block_west: { id: "sail_block_west", label: "Sail W", kind: "sail", shape: "side_wall", color: 0xf1e4c4, solid: true, orientation: "west" },
  keel_block_north: { id: "keel_block_north", label: "Keel N", kind: "keel", shape: "center_wall", color: 0x51351f, solid: true, orientation: "north" },
  keel_block_east: { id: "keel_block_east", label: "Keel E", kind: "keel", shape: "center_wall", color: 0x51351f, solid: true, orientation: "east" },
  keel_block_south: { id: "keel_block_south", label: "Keel S", kind: "keel", shape: "center_wall", color: 0x51351f, solid: true, orientation: "south" },
  keel_block_west: { id: "keel_block_west", label: "Keel W", kind: "keel", shape: "center_wall", color: 0x51351f, solid: true, orientation: "west" }
};

const MULTI_BLOCK_ITEMS: Record<MultiBlockItemId, MultiBlockItem> = {
  sail_item: {
    id: "sail_item",
    label: "Sail",
    color: 0xf1e4c4,
    parts: [
      { offset: new THREE.Vector3(0, 0, 0), block: "wood_trunk_block" },
      { offset: new THREE.Vector3(0, 1, 0), block: "wood_trunk_block" },
      { offset: new THREE.Vector3(0, 2, 0), block: "wood_trunk_block" },
      { offset: new THREE.Vector3(0, 3, 0), block: "wood_trunk_block" },
      { offset: new THREE.Vector3(-2, 1, 0), block: "sail_block_north" },
      { offset: new THREE.Vector3(-1, 1, 0), block: "sail_block_north" },
      { offset: new THREE.Vector3(1, 1, 0), block: "sail_block_north" },
      { offset: new THREE.Vector3(2, 1, 0), block: "sail_block_north" },
      { offset: new THREE.Vector3(-2, 2, 0), block: "sail_block_north" },
      { offset: new THREE.Vector3(-1, 2, 0), block: "sail_block_north" },
      { offset: new THREE.Vector3(1, 2, 0), block: "sail_block_north" },
      { offset: new THREE.Vector3(2, 2, 0), block: "sail_block_north" },
      { offset: new THREE.Vector3(-1, 3, 0), block: "sail_block_north" },
      { offset: new THREE.Vector3(1, 3, 0), block: "sail_block_north" }
    ]
  },
  keel_item: {
    id: "keel_item",
    label: "Keel",
    color: 0x51351f,
    parts: [
      { offset: new THREE.Vector3(0, 0, -3), block: "keel_block_north" },
      { offset: new THREE.Vector3(0, 0, -2), block: "keel_block_north" },
      { offset: new THREE.Vector3(0, 0, -1), block: "keel_block_north" },
      { offset: new THREE.Vector3(0, 0, 0), block: "keel_block_north" },
      { offset: new THREE.Vector3(0, 0, 1), block: "keel_block_north" },
      { offset: new THREE.Vector3(0, 0, 2), block: "keel_block_north" },
      { offset: new THREE.Vector3(0, 0, 3), block: "keel_block_north" }
    ]
  }
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
  "anchor_block_north",
  "bollard_block_north",
  "rudder_block_north",
  "sail_item",
  "keel_item"
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
    <div class="panel actions">
      <button data-action="wind">Stop Wind</button>
      <button data-action="debug">Debug Forces</button>
      <button data-action="save-world">Save World</button>
      <button data-action="load-world">Load World</button>
      <button data-action="save-structure">Save Structure</button>
      <button data-action="load-structure">Load Structure</button>
    </div>
    <div class="panel palette"></div>
  </div>
  <div class="info"></div>
  <div class="forces panel"></div>
  <div class="reticle"></div>
  <div class="toast"></div>
  <input class="file-picker" type="file" accept="application/json,.json" />
  <input class="file-picker" type="file" accept="application/json,.json" />
`;

const paletteEl = document.querySelector<HTMLDivElement>(".palette");
const actionButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".actions button"));
const infoEl = document.querySelector<HTMLDivElement>(".info");
const forcesEl = document.querySelector<HTMLDivElement>(".forces");
const toastEl = document.querySelector<HTMLDivElement>(".toast");
const filePickers = Array.from(document.querySelectorAll<HTMLInputElement>(".file-picker"));
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
let playerCameraQuaternion = new THREE.Quaternion();
let activeAnchor: { ship: VoxelEntity; localPoint: THREE.Vector3; rope: RopeLine; falling: boolean } | null = null;
let pendingBollard: RopeAttachment | null = null;
const ropes: RopeLine[] = [];
let windLocked = false;
let debugForcesEnabled = false;
let debugForceRecords: ForceDebugRecord[] = [];
let toastUntil = 0;

const ORIENTATIONS: Orientation[] = ["north", "east", "south", "west"];
const SLAB_POSITIONS: SlabPosition[] = ["bottom", "center", "top"];
const WATER_LEVEL = -0.1;
const PLAYER_FOOT_OFFSET = 1.18;
const PLAYER_BODY_HALF_HEIGHT = 1.23;
const PLAYER_BODY_RADIUS = 0.85;
const WORLD_GRAVITY = -18;
const DEBUG_VECTOR_SCALE = 0.035;
const DEBUG_VECTOR_MAX_LENGTH = 2.6;

const fullBox = (minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): ShapeBox => ({
  min: new THREE.Vector3(minX, minY, minZ),
  max: new THREE.Vector3(maxX, maxY, maxZ)
});

const SHAPE_BOXES: Record<BlockShape, ShapeBox[]> = {
  block: [fullBox(0, 0, 0, 1, 1, 1)],
  slab: [fullBox(0, 0, 0, 1, 0.5, 1)],
  stairs: [fullBox(0, 0, 0, 1, 0.5, 1), fullBox(0, 0.5, 0.5, 1, 1, 1)],
  side_wall: [fullBox(0, 0, 0, 1, 1, 0.4)],
  center_wall: [fullBox(0.24, 0, 0.24, 0.76, 1, 0.76)]
};

const ATLAS_TILE: Record<BlockKind, { col: number; row: number }> = {
  stone: { col: 0, row: 0 },
  dirt: { col: 1, row: 0 },
  sand: { col: 2, row: 0 },
  wood_trunk: { col: 0, row: 1 },
  foliage: { col: 1, row: 1 },
  wood_plank: { col: 2, row: 1 },
  rudder: { col: 2, row: 1 },
  sail: { col: 2, row: 0 },
  keel: { col: 2, row: 1 }
};

function renderPalette() {
  if (!paletteEl) return;
  paletteEl.innerHTML = PALETTE.map((tool, index) => {
    const block = isBlockId(tool) ? BLOCKS[orientBlockId(tool)] : null;
    const multiItem = isMultiBlockItemId(tool) ? MULTI_BLOCK_ITEMS[tool] : null;
    const label = tool === "empty" ? "Empty" : multiItem?.label ?? block?.label.replace(/ [NESW]$/, "") ?? "Block";
    const color = block?.color ?? multiItem?.color;
    const slotNumber = index === 0 ? "0" : String(index);
    return `<div class="slot ${tool === selectedTool ? "active" : ""}">
      <span class="swatch" style="background:${color ? `#${color.toString(16).padStart(6, "0")}` : "transparent"}"></span>
      <span>${slotNumber}. ${label}</span>
    </div>`;
  }).join("");
}

renderPalette();

function selectPaletteIndex(index: number) {
  selectedIndex = (index + PALETTE.length) % PALETTE.length;
  selectedTool = PALETTE[selectedIndex];
  selectedBlock = isBlockId(selectedTool) ? orientBlockId(selectedTool) : null;
  renderPalette();
}

function orientBlockId(id: ToolId) {
  if (!isBlockId(id)) return id;
  const block = BLOCKS[id];
  if (block.slabPosition) return id.replace(/_(bottom|center|top)$/, `_${selectedSlabPosition}`);
  if (block.orientation) return id.replace(/_(north|east|south|west)$/, `_${selectedOrientation}`);
  return id;
}

function orientMultiBlockItem(item: MultiBlockItem, orientation: Orientation) {
  const turns = ORIENTATIONS.indexOf(orientation);
  return item.parts.map((part) => ({
    offset: rotateVoxelOffset(part.offset, turns),
    block: BLOCKS[part.block]?.orientation ? part.block.replace(/_(north|east|south|west)$/, `_${orientation}`) : part.block
  }));
}

function createAttachment(ship: VoxelEntity, worldPoint: THREE.Vector3): RopeAttachment {
  return {
    worldPoint: worldPoint.clone(),
    entity: ship,
    localPoint: ship.worldToLocal(worldPoint)
  };
}

function addRope(start: RopeAttachment, end: RopeAttachment, restLength?: number) {
  const ropeLength = restLength ?? start.worldPoint.distanceTo(end.worldPoint);
  const rope: RopeLine = {
    start,
    end,
    endWorldPoint: end.worldPoint.clone(),
    restLength: ropeLength,
    active: true,
    slack: Math.max(0, ropeLength - start.worldPoint.distanceTo(end.worldPoint))
  };
  ropes.push(rope);
  return rope;
}

function addFixedRope(start: RopeAttachment, endWorldPoint: THREE.Vector3, restLength?: number) {
  const ropeLength = restLength ?? start.worldPoint.distanceTo(endWorldPoint);
  const rope: RopeLine = {
    start,
    end: null,
    endWorldPoint: endWorldPoint.clone(),
    restLength: ropeLength,
    active: true,
    slack: Math.max(0, ropeLength - start.worldPoint.distanceTo(endWorldPoint))
  };
  ropes.push(rope);
  return rope;
}

function rotateVoxelOffset(offset: THREE.Vector3, turns: number) {
  let x = offset.x;
  let z = offset.z;
  for (let i = 0; i < turns; i++) {
    const nextX = -z;
    z = x;
    x = nextX;
  }
  return new THREE.Vector3(x, offset.y, z);
}

function rotateSelectedOrientation() {
  if (isBlockId(selectedTool) && BLOCKS[selectedTool].slabPosition) {
    selectedSlabPosition = SLAB_POSITIONS[(SLAB_POSITIONS.indexOf(selectedSlabPosition) + 1) % SLAB_POSITIONS.length];
  } else {
    selectedOrientation = ORIENTATIONS[(ORIENTATIONS.indexOf(selectedOrientation) + 1) % ORIENTATIONS.length];
  }
  if (isBlockId(selectedTool)) selectedBlock = orientBlockId(selectedTool);
  renderPalette();
}

function isMultiBlockItemId(id: ToolId): id is MultiBlockItemId {
  return id === "sail_item" || id === "keel_item";
}

function isBlockId(id: ToolId): id is BlockId {
  return id !== "empty" && !isMultiBlockItemId(id);
}

function isUtilityBlockId(id: BlockId) {
  return id.startsWith("anchor_block") || id.startsWith("bollard_block") || id.startsWith("rudder_block");
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

function vecToString(vector: THREE.Vector3, digits = 2) {
  return `${vector.x.toFixed(digits)}, ${vector.y.toFixed(digits)}, ${vector.z.toFixed(digits)}`;
}

function velocityToString(vector: THREE.Vector3) {
  return `${vector.x.toFixed(2)}, ${vector.y.toFixed(2)}, ${vector.z.toFixed(2)}`;
}

function blockLabel(id: BlockId | null | undefined) {
  if (!id) return "-";
  return BLOCKS[id]?.label ?? id;
}

function cloneStructureVoxelMap(voxels: Map<string, BlockId>) {
  return Array.from(voxels.entries()).map(([key, block]) => {
    const [x, y, z] = key.split(",").map(Number);
    return { x, y, z, block };
  });
}

function serializeEntity(entity: VoxelEntity): StructureSave {
  const position = entity.body.translation();
  const rotation = entity.body.rotation();
  return {
    kind: "structure",
    version: 1,
    name: entity.name,
    bodyType: entity.bodyType,
    position: [position.x, position.y, position.z],
    rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
    voxels: cloneStructureVoxelMap(entity.voxels)
  };
}

function serializeRope(rope: RopeLine): RopeSave {
  return {
    start: {
      entity: rope.start.entity.name,
      point: [rope.start.localPoint.x, rope.start.localPoint.y, rope.start.localPoint.z]
    },
    end: rope.end
      ? {
          entity: rope.end.entity.name,
          point: [rope.end.localPoint.x, rope.end.localPoint.y, rope.end.localPoint.z]
        }
      : null,
    endWorldPoint: [rope.endWorldPoint.x, rope.endWorldPoint.y, rope.endWorldPoint.z],
    restLength: rope.restLength,
    active: rope.active
  };
}

function serializeWorld(entities: VoxelEntity[], wind: WindState): WorldSave {
  return {
    kind: "world",
    version: 1,
    wind: {
      direction: [wind.direction.x, wind.direction.y, wind.direction.z],
      speed: wind.speed,
      locked: windLocked
    },
    entities: entities.map(serializeEntity),
    ropes: ropes.map(serializeRope)
  };
}

function makeEntityFromSave(spec: StructureSave, world: RAPIER.World, scene: THREE.Scene) {
  const desc = spec.bodyType === "fixed" ? RAPIER.RigidBodyDesc.fixed() : RAPIER.RigidBodyDesc.dynamic();
  if (spec.bodyType === "dynamic") {
    desc.setCanSleep(false);
    desc.setLinearDamping(spec.name === "ship" ? 2.2 : 0.2);
    desc.setAngularDamping(spec.name === "ship" ? 5 : 0.2);
    desc.setGravityScale(1);
  }
  const body = world.createRigidBody(
    desc
      .setTranslation(spec.position[0], spec.position[1], spec.position[2])
      .setRotation({ x: spec.rotation[0], y: spec.rotation[1], z: spec.rotation[2], w: spec.rotation[3] })
  );
  const entity = new VoxelEntity(spec.name, body, spec.bodyType, world, scene);
  for (const voxel of spec.voxels) {
    entity.voxels.set(`${voxel.x},${voxel.y},${voxel.z}`, voxel.block);
  }
  entity.rebuild();
  return entity;
}

function applyStructureTemplate(entity: VoxelEntity, template: StructureTemplate) {
  for (const voxel of template.voxels) {
    entity.voxels.set(`${voxel.x},${voxel.y},${voxel.z}`, voxel.block);
  }
  const [x, y, z] = template.position;
  entity.body.setTranslation({ x, y, z }, true);
  const [qx, qy, qz, qw] = template.rotation;
  entity.body.setRotation({ x: qx, y: qy, z: qz, w: qw }, true);
  entity.rebuild();
}

function templateToStructureSave(template: StructureTemplate): StructureSave {
  return {
    kind: "structure",
    version: 1,
    name: template.name,
    bodyType: template.bodyType,
    position: template.position,
    rotation: template.rotation,
    voxels: template.voxels
  };
}

function isStructureSave(value: unknown): value is StructureSave {
  return typeof value === "object" && value !== null && (value as { kind?: unknown }).kind === "structure";
}

function isWorldSave(value: unknown): value is WorldSave {
  return typeof value === "object" && value !== null && (value as { kind?: unknown }).kind === "world";
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function pickJsonFile(input: HTMLInputElement) {
  return await new Promise<File | null>((resolve) => {
    input.value = "";
    const onChange = () => {
      input.removeEventListener("change", onChange);
      resolve(input.files?.[0] ?? null);
    };
    input.addEventListener("change", onChange, { once: true });
    input.click();
  });
}

function updateActionButtonLabels() {
  const windButton = actionButtons.find((button) => button.dataset.action === "wind");
  const debugButton = actionButtons.find((button) => button.dataset.action === "debug");
  if (windButton) windButton.textContent = windLocked ? "Start Wind" : "Stop Wind";
  if (debugButton) debugButton.textContent = debugForcesEnabled ? "Hide Forces" : "Debug Forces";
}

function updateInfoPanel(
  playerBody: RAPIER.RigidBody,
  wind: WindState,
  ship: VoxelEntity,
  cursorHit: VoxelHit | null
) {
  if (!infoEl) return;

  const player = playerBody.translation();
  const playerVelocity = playerBody.linvel();
  const playerWorld = new THREE.Vector3(player.x, player.y, player.z);
  const attachment = shipAttachment;
  const parent = attachment?.ship ?? null;
  const parentWorldVelocity = parent
    ? new THREE.Vector3(parent.body.linvel().x, parent.body.linvel().y, parent.body.linvel().z)
    : new THREE.Vector3();
  const localPosition = attachment ? attachment.localPosition : playerWorld;
  const localVelocity = attachment ? attachment.localVelocity : new THREE.Vector3(playerVelocity.x, playerVelocity.y, playerVelocity.z);
  const parentLabel = parent ? `${parent.name}` : "world";
  const cursorLocal = cursorHit ? cursorHit.entity.worldToLocal(cursorHit.position) : null;
  const windYaw = Math.atan2(wind.direction.z, wind.direction.x);
  const windDegrees = (THREE.MathUtils.radToDeg(windYaw) + 360) % 360;

  infoEl.textContent = [
    `world: ${vecToString(playerWorld)}`,
    `cursor world: ${cursorHit ? vecToString(cursorHit.position) : "-"}`,
    `cursor local: ${cursorLocal ? vecToString(cursorLocal) : "-"}`,
    `cursor block: ${cursorHit ? blockLabel(cursorHit.blockId) : "-"}`,
    `wind: ${windDegrees.toFixed(0)}deg @ ${wind.speed.toFixed(2)}`,
    `parent: ${parentLabel}`,
    `local: ${vecToString(localPosition)}`,
    `local vel: ${velocityToString(localVelocity)}`,
    `parent vel: ${velocityToString(parentWorldVelocity)}`,
    `world vel: ${velocityToString(new THREE.Vector3(playerVelocity.x, playerVelocity.y, playerVelocity.z))}`
  ].join("\n");
}

function formatForceVector(vector: THREE.Vector3) {
  return `${vector.x.toFixed(2)}, ${vector.y.toFixed(2)}, ${vector.z.toFixed(2)}`;
}

function updateForcesPanel(records: ForceDebugRecord[]) {
  if (!forcesEl) return;
  if (records.length === 0) {
    forcesEl.textContent = debugForcesEnabled ? "No forces recorded." : "Forces debug is off.";
    return;
  }

  const total = records.reduce((sum, record) => sum.add(record.vector), new THREE.Vector3());
  forcesEl.textContent = [
    "Forces",
    debugForcesEnabled ? "3D arrows: on" : "3D arrows: off",
    ...records.map((record) => {
      const magnitude = record.vector.length();
      const capped = record.saturates ? " [capped]" : "";
      return `${record.label}${capped}: ${formatForceVector(record.vector)} | |F|=${magnitude.toFixed(2)}`;
    }),
    `net: ${formatForceVector(total)} | |F|=${total.length().toFixed(2)}`
  ].join("\n");
}

function buildDebugForces(scene: THREE.Scene, records: ForceDebugRecord[]) {
  const group = new THREE.Group();
  group.name = "debug-forces";
  const fullPass = new THREE.Group();
  fullPass.name = "debug-forces-full";
  const xrayPass = new THREE.Group();
  xrayPass.name = "debug-forces-xray";

  for (const record of records) {
    const magnitude = record.vector.length();
    const isNetVertical = record.label === "net-vertical";
    if (magnitude < 0.0001 && !isNetVertical) continue;
    const visibleMagnitude = Math.max(magnitude, isNetVertical ? 0.25 : 0);
    const scaledLength = visibleMagnitude * DEBUG_VECTOR_SCALE;
    const clampedLength = Math.min(DEBUG_VECTOR_MAX_LENGTH, scaledLength);
    const saturated = !isNetVertical && scaledLength >= DEBUG_VECTOR_MAX_LENGTH - 1e-6;
    record.saturates = saturated;
    const createArrow = (opacity: number, depthTest: boolean, renderOrder: number) => {
      const arrow = new THREE.ArrowHelper(
        magnitude < 0.0001 ? new THREE.Vector3(0, 1, 0) : record.vector.clone().normalize(),
        record.source.clone(),
        Math.max(0.12, clampedLength),
        saturated ? 0xff4d4d : isNetVertical && magnitude < 0.0001 ? 0xd8d8d8 : record.color,
        Math.max(0.08, clampedLength * 0.35),
        Math.max(0.05, clampedLength * 0.18)
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
      arrow.line.renderOrder = renderOrder;
      arrow.cone.renderOrder = renderOrder;
      return arrow;
    };
    fullPass.add(createArrow(1, true, 20));
    xrayPass.add(createArrow(0.5, false, 200));
  }

  group.add(fullPass);
  group.add(xrayPass);
  scene.add(group);
  return group;
}

function clearDebugForces(scene: THREE.Scene) {
  const existing = scene.getObjectByName("debug-forces");
  if (existing) {
    scene.remove(existing);
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

const sailTexture = createSailTexture();
sailTexture.colorSpace = THREE.SRGBColorSpace;
sailTexture.wrapS = THREE.RepeatWrapping;
sailTexture.wrapT = THREE.RepeatWrapping;
sailTexture.magFilter = THREE.NearestFilter;

const keelTexture = createKeelTexture();
keelTexture.colorSpace = THREE.SRGBColorSpace;
keelTexture.wrapS = THREE.RepeatWrapping;
keelTexture.wrapT = THREE.RepeatWrapping;
keelTexture.magFilter = THREE.NearestFilter;

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

function createSailTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create sail texture");
  context.fillStyle = "#eadbb9";
  context.fillRect(0, 0, 128, 128);
  context.strokeStyle = "rgba(120,86,48,0.28)";
  context.lineWidth = 2;
  for (let x = 12; x < 128; x += 24) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x + Math.sin(x) * 4, 128);
    context.stroke();
  }
  context.strokeStyle = "rgba(255,255,245,0.22)";
  for (let y = 10; y < 128; y += 18) {
    context.beginPath();
    context.moveTo(0, y);
    context.bezierCurveTo(34, y - 5, 82, y + 7, 128, y - 2);
    context.stroke();
  }
  return new THREE.CanvasTexture(canvas);
}

function createKeelTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create keel texture");
  context.fillStyle = "#3f2818";
  context.fillRect(0, 0, 128, 128);
  context.strokeStyle = "rgba(20,10,4,0.45)";
  context.lineWidth = 3;
  for (let x = 8; x < 128; x += 18) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x + 8, 128);
    context.stroke();
  }
  context.fillStyle = "rgba(255,210,130,0.08)";
  for (let i = 0; i < 36; i++) context.fillRect((i * 31) % 128, (i * 47) % 128, 3, 3);
  return new THREE.CanvasTexture(canvas);
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

function createEmptyShipPhysicsCache(): ShipPhysicsCache {
  return {
    voxelCount: 0,
    hullCount: 0,
    sailArea: 0,
    keelArea: 0,
    centerOfMass: new THREE.Vector3(),
    sailCenter: new THREE.Vector3(),
    keelCenter: new THREE.Vector3(),
    waterline: 0,
    length: 1,
    beam: 1
  };
}

function computeShipPhysicsCache(voxels: Map<string, BlockId>): ShipPhysicsCache {
  const cache = createEmptyShipPhysicsCache();
  const total = new THREE.Vector3();
  const sail = new THREE.Vector3();
  const keel = new THREE.Vector3();
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

  for (const [key, id] of voxels) {
    const [x, y, z] = key.split(",").map(Number);
    const center = new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5);
    const kind = BLOCKS[id].kind;
    total.add(center);
    cache.voxelCount++;
    min.min(center);
    max.max(center);
    if (kind === "sail") {
      cache.sailArea += 1;
      sail.add(center);
    } else if (kind === "keel") {
      cache.keelArea += 1;
      keel.add(center);
    } else {
      cache.hullCount += 1;
    }
  }

  if (cache.voxelCount > 0) cache.centerOfMass.copy(total.multiplyScalar(1 / cache.voxelCount));
  if (cache.sailArea > 0) cache.sailCenter.copy(sail.multiplyScalar(1 / cache.sailArea));
  else cache.sailCenter.copy(cache.centerOfMass);
  if (cache.keelArea > 0) cache.keelCenter.copy(keel.multiplyScalar(1 / cache.keelArea));
  else cache.keelCenter.copy(cache.centerOfMass);
  cache.length = Math.max(1, max.z - min.z + 1);
  cache.beam = Math.max(1, max.x - min.x + 1);
  cache.waterline = Math.max(0.1, min.y + 0.45);
  return cache;
}

class VoxelEntity {
  readonly group = new THREE.Group();
  readonly voxels = new Map<string, BlockId>();
  physicsCache: ShipPhysicsCache = createEmptyShipPhysicsCache();
  private mesh?: THREE.Mesh;
  private colliders: RAPIER.Collider[] = [];

  constructor(
    readonly name: string,
    readonly body: RAPIER.RigidBody,
    readonly bodyType: "fixed" | "dynamic",
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
      }),
      new THREE.MeshStandardMaterial({
        map: sailTexture,
        vertexColors: true,
        roughness: 0.92,
        metalness: 0
      }),
      new THREE.MeshStandardMaterial({
        map: keelTexture,
        vertexColors: true,
        roughness: 0.82,
        metalness: 0.02
      })
    ];
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.group.add(this.mesh);
    this.physicsCache = computeShipPhysicsCache(this.voxels);

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

  destroy() {
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh = undefined;
    }
    for (const collider of this.colliders) {
      this.world.removeCollider(collider, false);
    }
    this.colliders = [];
    this.scene.remove(this.group);
    this.world.removeRigidBody(this.body);
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
        const materialIndex = block.kind === "rudder" ? 1 : block.kind === "sail" ? 2 : block.kind === "keel" ? 3 : 0;
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
  const wind = createWindState(scene);
  const ropeGeometry = new THREE.BufferGeometry();
  const ropeLine = new THREE.LineSegments(
    ropeGeometry,
    new THREE.LineBasicMaterial({ color: 0x8b6a3d, transparent: true, opacity: 0.9 })
  );
  scene.add(ropeLine);

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
  const entityLookup = new Map<string, VoxelEntity>();
  const structureWorld = templateToStructureSave(createIslandTemplate());
  const boatWorld = templateToStructureSave(createBoatTemplate());

  const playerBody = physics.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 4, 8).setCanSleep(false).setGravityScale(1.35)
  );
  physics.createCollider(RAPIER.ColliderDesc.capsule(0.85, 0.38).setFriction(0.1), playerBody);

  const island = makeEntityFromSave(structureWorld, physics, scene);
  entities.push(island);
  entityLookup.set(island.name, island);

  const ship = makeEntityFromSave(boatWorld, physics, scene);
  entities.push(ship);
  entityLookup.set(ship.name, ship);

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
  const debugForceGroup = new THREE.Group();
  debugForceGroup.name = "debug-forces";
  scene.add(debugForceGroup);

  function registerEntity(entity: VoxelEntity) {
    entities.push(entity);
    entityLookup.set(entity.name, entity);
    return entity;
  }

  function uniqueEntityName(base: string) {
    if (!entityLookup.has(base)) return base;
    let index = 2;
    while (entityLookup.has(`${base}-${index}`)) index++;
    return `${base}-${index}`;
  }

  function addEntityFromSave(spec: StructureSave) {
    const safeName = uniqueEntityName(spec.name);
    const entity = makeEntityFromSave({ ...spec, name: safeName }, physics, scene);
    registerEntity(entity);
    return entity;
  }

  function clearWorldEntities() {
    for (const entity of entities.splice(0, entities.length)) {
      entity.destroy();
    }
    entityLookup.clear();
    ropes.splice(0, ropes.length);
    shipAttachment = null;
    activeAnchor = null;
    pendingBollard = null;
    activeRudderShip = null;
    activeShipYaw = null;
    debugForcesEnabled = false;
    windLocked = false;
    debugForceRecords = [];
    clearDebugForces(scene);
    updateActionButtonLabels();
  }

  function rebuildStartingWorld() {
    clearWorldEntities();
    registerEntity(makeEntityFromSave(templateToStructureSave(createIslandTemplate()), physics, scene));
    registerEntity(makeEntityFromSave(templateToStructureSave(createBoatTemplate()), physics, scene));
  }

  function currentFocusEntity() {
    const hit = raycastVoxels(camera, entities);
    if (hit) return hit.entity;
    if (shipAttachment) return shipAttachment.ship;
    if (activeRudderShip) return activeRudderShip;
    return entities.find((entity) => entity.name === "ship") ?? entities[0] ?? null;
  }

  function saveWorldFile() {
    const worldSave = serializeWorld(entities, wind);
    downloadText(`pirate-world-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(worldSave, null, 2));
    showToast("World saved");
  }

  function saveStructureFile() {
    const entity = currentFocusEntity();
    if (!entity) {
      showToast("No structure to save");
      return;
    }
    const structure = serializeEntity(entity);
    downloadText(`${entity.name}.json`, JSON.stringify(structure, null, 2));
    showToast("Structure saved");
  }

  async function loadWorldFile() {
    const file = await pickJsonFile(filePickers[0]);
    if (!file) return;
    try {
      const json = JSON.parse(await file.text()) as unknown;
      if (!isWorldSave(json)) {
        showToast("Invalid world file");
        return;
      }
      clearWorldEntities();
      wind.direction.set(json.wind.direction[0], json.wind.direction[1], json.wind.direction[2]);
      wind.speed = json.wind.speed;
      windLocked = json.wind.locked;
      wind.arrow.setDirection(wind.direction);
      wind.arrow.setLength(windLocked ? 0.2 : 3.5 + wind.speed * 0.9, 1.1, 0.7);
      updateActionButtonLabels();
      for (const entitySpec of json.entities) {
        addEntityFromSave(entitySpec);
      }
      for (const ropeSpec of json.ropes) {
        const startEntity = entityLookup.get(ropeSpec.start.entity);
        if (!startEntity) continue;
        const start = createAttachment(startEntity, startEntity.localToWorld(new THREE.Vector3(ropeSpec.start.point[0], ropeSpec.start.point[1], ropeSpec.start.point[2])));
        if (ropeSpec.end) {
          const endEntity = entityLookup.get(ropeSpec.end.entity);
          if (!endEntity) continue;
          const end = createAttachment(endEntity, endEntity.localToWorld(new THREE.Vector3(ropeSpec.end.point[0], ropeSpec.end.point[1], ropeSpec.end.point[2])));
          addRope(start, end, ropeSpec.restLength);
        } else {
          const endWorld = new THREE.Vector3(ropeSpec.endWorldPoint[0], ropeSpec.endWorldPoint[1], ropeSpec.endWorldPoint[2]);
          addFixedRope(start, endWorld, ropeSpec.restLength);
        }
      }
      showToast("World loaded");
    } catch {
      showToast("Could not load world");
    }
  }

  async function loadStructureFile() {
    const file = await pickJsonFile(filePickers[1]);
    if (!file) return;
    try {
      const json = JSON.parse(await file.text()) as unknown;
      if (!isStructureSave(json)) {
        showToast("Invalid structure file");
        return;
      }
      const entity = addEntityFromSave(json);
      entity.syncFromPhysics();
      showToast("Structure loaded");
    } catch {
      showToast("Could not load structure");
    }
  }

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
      const utility = findUsableUtility(camera, [ship], playerBody);
      if (utility?.type === "anchor") {
        if (activeAnchor?.ship === utility.ship) {
          activeAnchor.falling = !activeAnchor.falling;
          showToast(activeAnchor.falling ? "Anchor lowering" : "Anchor held");
        } else {
          const local = utility.ship.worldToLocal(utility.worldPoint);
          activeAnchor = {
            ship: utility.ship,
            localPoint: local,
            rope: addFixedRope(createAttachment(utility.ship, utility.worldPoint), new THREE.Vector3(utility.worldPoint.x, Math.max(-10, utility.worldPoint.y - 1), utility.worldPoint.z), 10),
            falling: true
          };
          showToast("Anchor deployed");
        }
      } else if (utility?.type === "bollard") {
        const attachment = createAttachment(utility.ship, utility.worldPoint);
        if (!pendingBollard) {
          pendingBollard = attachment;
          showToast("Bollard selected");
        } else if (pendingBollard.entity === utility.ship && pendingBollard.localPoint.distanceTo(attachment.localPoint) < 0.01) {
          pendingBollard = null;
          showToast("Pick another bollard");
        } else {
          addRope(pendingBollard, attachment);
          pendingBollard = null;
          showToast("Rope connected");
        }
      } else if (activeRudderShip) {
        activeRudderShip = null;
        activeShipYaw = null;
        controls.object.quaternion.copy(playerCameraQuaternion);
        showToast("Left rudder");
      } else {
        const rudder = findUsableRudder(camera, [ship], playerBody);
        if (rudder) {
          playerCameraQuaternion.copy(controls.object.quaternion);
          activeRudderShip = rudder.ship;
          activeRudderOrientation = rudder.orientation;
          activeShipYaw = new THREE.Euler().setFromQuaternion(rudder.ship.group.quaternion, "YXZ").y;
          shipAttachment = {
            ship: rudder.ship,
            localPosition: rudder.ship.worldToLocal(new THREE.Vector3(playerBody.translation().x, playerBody.translation().y, playerBody.translation().z)),
            localVelocity: new THREE.Vector3(),
            missingSince: null,
            localBaseY: playerBody.translation().y
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

  for (const button of actionButtons) {
    button.addEventListener("click", async () => {
      const action = button.dataset.action;
      if (action === "wind") {
        windLocked = !windLocked;
        if (!windLocked) {
          wind.speed = Math.max(wind.speed, 2.5);
        }
        updateActionButtonLabels();
        showToast(windLocked ? "Wind stopped" : "Wind resumed");
      } else if (action === "debug") {
        debugForcesEnabled = !debugForcesEnabled;
        updateActionButtonLabels();
        showToast(debugForcesEnabled ? "Forces visible" : "Forces hidden");
      } else if (action === "save-world") {
        saveWorldFile();
      } else if (action === "load-world") {
        await loadWorldFile();
      } else if (action === "save-structure") {
        saveStructureFile();
      } else if (action === "load-structure") {
        await loadStructureFile();
      }
    });
  }
  updateActionButtonLabels();

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
      if (isMultiBlockItemId(selectedTool) || selectedTool.startsWith("anchor_block") || selectedTool.startsWith("bollard_block")) {
        placeTool(hit.entity, place, selectedTool, selectedOrientation);
      }
    }
  });

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const elapsed = clock.elapsedTime;
    updateToast();
    debugForceRecords = [];
    updateWater(sea, caustics, elapsed);
    updateWind(wind, elapsed);
    updateRopes(ropes, ropeLine, entities, dt, elapsed);
    updateShip(ship, ship.body, playerBody, keys, elapsed, activeRudderShip === ship, wind);
    physics.step();

    for (const entity of entities) entity.syncFromPhysics();
    updateShipAttachment(playerBody, entities, elapsed, activeRudderShip !== null, flyMode);
    updatePlayer(dt, controls, playerBody, keys, flyMode, activeRudderShip !== null);
    updateCamera(controls, playerBody, activeRudderShip, activeRudderOrientation);
    const p = playerBody.translation();
    wind.arrow.position.set(p.x, 8, p.z - 10);
    sea.position.x = p.x;
    sea.position.z = p.z;
    caustics.position.x = p.x;
    caustics.position.z = p.z;
    const cursorHit = raycastVoxels(camera, entities);
    updateInfoPanel(playerBody, wind, ship, cursorHit);
    clearDebugForces(scene);
    if (debugForcesEnabled) {
      buildDebugForces(scene, debugForceRecords);
    }
    updateForcesPanel(debugForceRecords);
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
  for (let y = 1; y <= 4; y++) entity.voxels.set(`0,${y},0`, "wood_trunk_block");
  for (const part of orientMultiBlockItem(MULTI_BLOCK_ITEMS.sail_item, "north")) {
    entity.voxels.set(`${part.offset.x},${part.offset.y + 1},${part.offset.z}`, part.block);
  }
  for (const part of orientMultiBlockItem(MULTI_BLOCK_ITEMS.keel_item, "north")) {
    entity.voxels.set(`${part.offset.x},${part.offset.y - 1},${part.offset.z}`, part.block);
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
  if (!selectedBlock && !isMultiBlockItemId(selectedTool)) {
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
  const ghostVoxels = new Map<string, BlockId>();
  if (selectedBlock) {
    ghostVoxels.set("0,0,0", selectedBlock);
  } else if (isMultiBlockItemId(selectedTool)) {
    for (const part of orientMultiBlockItem(MULTI_BLOCK_ITEMS[selectedTool], selectedOrientation)) {
      ghostVoxels.set(`${part.offset.x},${part.offset.y},${part.offset.z}`, part.block);
    }
  }
  ghost.geometry = buildVoxelGeometry(ghostVoxels);
  ghost.position.copy(hit.entity.group.localToWorld(new THREE.Vector3(place.x, place.y, place.z)));
  ghost.quaternion.copy(hit.entity.group.quaternion);
  ghost.visible = true;
}

function placeMultiBlockItem(entity: VoxelEntity, origin: THREE.Vector3, itemId: MultiBlockItemId, orientation: Orientation) {
  for (const part of orientMultiBlockItem(MULTI_BLOCK_ITEMS[itemId], orientation)) {
    entity.voxels.set(`${origin.x + part.offset.x},${origin.y + part.offset.y},${origin.z + part.offset.z}`, part.block);
  }
  entity.rebuild();
}

function placeTool(entity: VoxelEntity, origin: THREE.Vector3, tool: ToolId, orientation: Orientation) {
  if (tool === "empty") return;
  if (isMultiBlockItemId(tool)) {
    placeMultiBlockItem(entity, origin, tool, orientation);
    return;
  }
  if (tool.startsWith("anchor_block")) {
    const blockId = orientBlockId(tool);
    const baseX = origin.x;
    const baseY = origin.y;
    const baseZ = origin.z;
    entity.voxels.set(`${baseX},${baseY},${baseZ}`, blockId);
    entity.voxels.set(`${baseX + 1},${baseY},${baseZ}`, blockId);
    entity.rebuild();
    const startPoint = entity.localToWorld(new THREE.Vector3(baseX + 0.5, baseY + 0.5, baseZ + 0.5));
    activeAnchor = {
      ship: entity,
      localPoint: new THREE.Vector3(baseX + 0.5, baseY + 0.5, baseZ + 0.5),
      rope: addFixedRope(createAttachment(entity, startPoint), new THREE.Vector3(startPoint.x, Math.max(-10, startPoint.y - 1), startPoint.z), 10),
      falling: true
    };
    showToast("Anchor deployed");
    return;
  }
  if (tool.startsWith("bollard_block")) {
    const blockId = orientBlockId(tool);
    entity.voxels.set(`${origin.x},${origin.y},${origin.z}`, blockId);
    entity.rebuild();
    const attachment = createAttachment(entity, entity.localToWorld(new THREE.Vector3(origin.x + 0.5, origin.y + 0.5, origin.z + 0.5)));
    if (!pendingBollard) {
      pendingBollard = attachment;
      showToast("Bollard selected");
    } else if (pendingBollard.entity === entity) {
      pendingBollard = null;
      showToast("Pick another bollard");
    } else {
      addRope(pendingBollard, attachment);
      pendingBollard = null;
      showToast("Rope connected");
    }
  }
}

function createWindState(scene: THREE.Scene): WindState {
  const arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 8, -10), 5, 0xf7f1b4, 1.2, 0.75);
  scene.add(arrow);
  return {
    direction: new THREE.Vector3(1, 0, 0),
    speed: 3,
    arrow
  };
}

function updateWind(wind: WindState, elapsed: number) {
  if (windLocked) {
    wind.speed = 0;
    wind.arrow.setDirection(wind.direction);
    wind.arrow.setLength(0.2, 0.1, 0.1);
    return;
  }
  const angle =
    smoothNoise(elapsed * 0.018, 11) * Math.PI * 2 +
    smoothNoise(elapsed * 0.055, 41) * 1.2 +
    smoothNoise(elapsed * 0.12, 101) * 0.35;
  const speed = 2.4 + smoothNoise(elapsed * 0.03, 7) * 1.8 + smoothNoise(elapsed * 0.16, 77) * 0.55;
  wind.direction.set(Math.cos(angle), 0, Math.sin(angle)).normalize();
  wind.speed = speed;
  wind.arrow.setDirection(wind.direction);
  wind.arrow.setLength(3.5 + speed * 0.9, 1.1, 0.7);
}

function updateRopes(ropesToUpdate: RopeLine[], ropeLine: THREE.LineSegments, entities: VoxelEntity[], dt: number, elapsed: number) {
  const positions: number[] = [];
  for (const rope of ropesToUpdate) {
    if (!rope.active) continue;
    const startWorld = rope.start.entity.localToWorld(rope.start.localPoint);
    rope.start.worldPoint.copy(startWorld);
    let endWorld: THREE.Vector3;

    if (rope.end) {
      endWorld = rope.end.entity.localToWorld(rope.end.localPoint);
      rope.end.worldPoint.copy(endWorld);
    } else {
      if (activeAnchor && activeAnchor.rope === rope && activeAnchor.falling) {
        const hitY = findTopBelowXZ(entities, rope.start.worldPoint.x, rope.start.worldPoint.z, rope.endWorldPoint.y, -10);
        const targetY = hitY ?? -10;
        rope.endWorldPoint.y = Math.max(targetY, rope.endWorldPoint.y - dt * 4.5);
        if (rope.endWorldPoint.y <= targetY + 0.03) activeAnchor.falling = false;
      }
      endWorld = rope.endWorldPoint.clone();
    }

    const delta = endWorld.clone().sub(startWorld);
    const distance = delta.length();
    const slack = Math.max(0, rope.restLength - distance);
    rope.slack = THREE.MathUtils.lerp(rope.slack, slack, 0.22);
    if (distance > rope.restLength) {
      const stretch = distance - rope.restLength;
      const dir = delta.normalize();
      const force = dir.multiplyScalar(stretch * 65);
      applyRopeImpulseAtPoint(rope.start.entity.body, startWorld, force, dt);
      if (rope.end) applyRopeImpulseAtPoint(rope.end.entity.body, endWorld, force.clone().negate(), dt);
      if (debugForcesEnabled) {
        debugForceRecords.push({ label: "rope", source: startWorld.clone(), vector: force.clone(), color: 0xccb06a });
        if (rope.end) {
          debugForceRecords.push({ label: "rope", source: endWorld.clone(), vector: force.clone().negate(), color: 0xccb06a });
        }
      }
    }

    const curvePoints = sampleRopeCurve(startWorld, endWorld, rope.restLength, rope.slack);
    for (let i = 0; i < curvePoints.length - 1; i++) {
      const a = curvePoints[i];
      const b = curvePoints[i + 1];
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }

  ropeLine.geometry.dispose();
  ropeLine.geometry = new THREE.BufferGeometry();
  ropeLine.geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
}

function sampleRopeCurve(start: THREE.Vector3, end: THREE.Vector3, restLength: number, slack: number) {
  const segments = 10;
  const points: THREE.Vector3[] = [];
  const delta = end.clone().sub(start);
  const distance = Math.max(0.001, delta.length());
  const up = new THREE.Vector3(0, 1, 0);
  const sagStrength = Math.min(1.6, slack * 0.55 + Math.max(0, restLength - distance) * 0.45);

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const point = start.clone().lerp(end, t);
    const parabola = 4 * t * (1 - t);
    point.addScaledVector(up, -parabola * sagStrength);
    points.push(point);
  }

  return points;
}

function applyRopeImpulseAtPoint(body: RAPIER.RigidBody, worldPoint: THREE.Vector3, force: THREE.Vector3, dt: number) {
  const impulse = force.clone().multiplyScalar(dt);
  body.applyImpulseAtPoint({ x: impulse.x, y: impulse.y, z: impulse.z }, { x: worldPoint.x, y: worldPoint.y, z: worldPoint.z }, true);
}

function findTopBelowXZ(entities: VoxelEntity[], x: number, z: number, maxY: number, minY: number) {
  let best = minY;
  let found = false;
  for (const entity of entities) {
    for (const [key, id] of entity.voxels) {
      const [vx, vy, vz] = key.split(",").map(Number);
      for (const box of blockBoxes(id)) {
        const worldCenter = entity.localVoxelCenterToWorld(new THREE.Vector3(vx, vy, vz));
        const wx0 = worldCenter.x + box.min.x - 0.5;
        const wx1 = worldCenter.x + box.max.x - 0.5;
        const wz0 = worldCenter.z + box.min.z - 0.5;
        const wz1 = worldCenter.z + box.max.z - 0.5;
        const top = worldCenter.y + box.max.y - 0.5;
        if (x < wx0 || x > wx1 || z < wz0 || z > wz1) continue;
        if (top <= maxY && top > best) {
          best = top;
          found = true;
        }
      }
    }
  }
  return found ? best : null;
}

function smoothNoise(t: number, seed: number) {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  return THREE.MathUtils.lerp(hashNoise(i, seed), hashNoise(i + 1, seed), u) * 2 - 1;
}

function hashNoise(i: number, seed: number) {
  const x = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453123;
  return x - Math.floor(x);
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

function findUsableUtility(camera: THREE.Camera, ships: VoxelEntity[], playerBody: RAPIER.RigidBody) {
  const hit = raycastVoxels(camera, ships);
  if (hit) {
    const id = hit.entity.getBlock(hit.voxel.x, hit.voxel.y, hit.voxel.z);
    if (id && isUtilityBlockId(id)) {
      const type = id.startsWith("anchor_block") ? "anchor" : id.startsWith("bollard_block") ? "bollard" : "rudder";
      return { ship: hit.entity, type, orientation: BLOCKS[id].orientation ?? "south", worldPoint: hit.entity.localVoxelCenterToWorld(hit.voxel) };
    }
  }

  const player = playerBody.translation();
  const playerWorld = new THREE.Vector3(player.x, player.y, player.z);
  for (const ship of ships) {
    for (const [key, id] of ship.voxels) {
      if (!isUtilityBlockId(id)) continue;
      const [x, y, z] = key.split(",").map(Number);
      const world = ship.localVoxelCenterToWorld(new THREE.Vector3(x, y, z));
      if (world.distanceTo(playerWorld) < 4.5) {
        const type = id.startsWith("anchor_block") ? "anchor" : id.startsWith("bollard_block") ? "bollard" : "rudder";
        return { ship, type, orientation: BLOCKS[id].orientation ?? "south", worldPoint: world };
      }
    }
  }
  return null;
}

function orientationVector(orientation: Orientation) {
  if (orientation === "north") return new THREE.Vector3(0, 0, -1);
  if (orientation === "east") return new THREE.Vector3(1, 0, 0);
  if (orientation === "south") return new THREE.Vector3(0, 0, 1);
  return new THREE.Vector3(-1, 0, 0);
}

type SupportHit = {
  entity: VoxelEntity;
  localPosition: THREE.Vector3;
  worldPosition: THREE.Vector3;
  topY: number;
};

function getTopSupport(entities: VoxelEntity[], worldPosition: THREE.Vector3) {
  let best: SupportHit | null = null;

  for (const entity of entities) {
    const local = entity.worldToLocal(worldPosition);
    const footY = local.y - PLAYER_FOOT_OFFSET;
    let bestTop = -Infinity;
    let found = false;

    for (const [key, id] of entity.voxels) {
      const [x, y, z] = key.split(",").map(Number);
      const block = BLOCKS[id];
      if (block.shape === "side_wall" || block.shape === "center_wall") continue;
      for (const box of blockBoxes(id)) {
        const minX = x + box.min.x - 0.08;
        const maxX = x + box.max.x + 0.08;
        const minZ = z + box.min.z - 0.08;
        const maxZ = z + box.max.z + 0.08;
        const top = y + box.max.y;
        const supportThickness = box.max.y - box.min.y;
        if (supportThickness < 0.34) continue;
        if (local.x < minX || local.x > maxX || local.z < minZ || local.z > maxZ) continue;
        const gap = footY - top;
        if (gap < -0.1 || gap > 0.22) continue;
        const inset = 0.12;
        if (local.x < x + box.min.x + inset || local.x > x + box.max.x - inset) continue;
        if (local.z < z + box.min.z + inset || local.z > z + box.max.z - inset) continue;
        if (top > bestTop) {
          bestTop = top;
          found = true;
        }
      }
    }

    if (!found) continue;
    const worldSupport = entity.localToWorld(new THREE.Vector3(local.x, bestTop + PLAYER_FOOT_OFFSET, local.z));
    if (!best || worldSupport.y > best.worldPosition.y) {
      best = {
        entity,
        localPosition: new THREE.Vector3(local.x, bestTop + PLAYER_FOOT_OFFSET, local.z),
        worldPosition: worldSupport,
        topY: bestTop
      };
    }
  }

  return best;
}

function resolveShipAttachmentCollision(
  ship: VoxelEntity,
  localPosition: THREE.Vector3,
  localVelocity: THREE.Vector3
) {
  const correctedPosition = localPosition.clone();
  const correctedVelocity = localVelocity.clone();
  const bodyMinY = correctedPosition.y - PLAYER_BODY_HALF_HEIGHT;
  const bodyMaxY = correctedPosition.y + PLAYER_BODY_HALF_HEIGHT;

  for (let pass = 0; pass < 4; pass++) {
    let moved = false;

    for (const [key, id] of ship.voxels) {
      for (const box of blockBoxes(id)) {
        const [x, y, z] = key.split(",").map(Number);
        const minX = x + box.min.x;
        const maxX = x + box.max.x;
        const minY = y + box.min.y;
        const maxY = y + box.max.y;
        const minZ = z + box.min.z;
        const maxZ = z + box.max.z;

        if (bodyMaxY <= minY || bodyMinY >= maxY) continue;

        const closestX = THREE.MathUtils.clamp(correctedPosition.x, minX, maxX);
        const closestZ = THREE.MathUtils.clamp(correctedPosition.z, minZ, maxZ);
        let dx = correctedPosition.x - closestX;
        let dz = correctedPosition.z - closestZ;
        let distSq = dx * dx + dz * dz;

        if (distSq >= PLAYER_BODY_RADIUS * PLAYER_BODY_RADIUS) continue;

        let pushX = 0;
        let pushZ = 0;
        if (distSq > 1e-8) {
          const dist = Math.sqrt(distSq);
          const penetration = PLAYER_BODY_RADIUS - dist;
          pushX = (dx / dist) * penetration;
          pushZ = (dz / dist) * penetration;
        } else {
          const toLeft = Math.abs(correctedPosition.x - minX);
          const toRight = Math.abs(maxX - correctedPosition.x);
          const toBack = Math.abs(correctedPosition.z - minZ);
          const toFront = Math.abs(maxZ - correctedPosition.z);
          const smallest = Math.min(toLeft, toRight, toBack, toFront);
          if (smallest === toLeft) pushX = -(PLAYER_BODY_RADIUS - toLeft);
          else if (smallest === toRight) pushX = PLAYER_BODY_RADIUS - toRight;
          else if (smallest === toBack) pushZ = -(PLAYER_BODY_RADIUS - toBack);
          else pushZ = PLAYER_BODY_RADIUS - toFront;
        }

        correctedPosition.x += pushX;
        correctedPosition.z += pushZ;
        if (pushX !== 0) correctedVelocity.x = 0;
        if (pushZ !== 0) correctedVelocity.z = 0;
        moved = true;

        const newClosestX = THREE.MathUtils.clamp(correctedPosition.x, minX, maxX);
        const newClosestZ = THREE.MathUtils.clamp(correctedPosition.z, minZ, maxZ);
        dx = correctedPosition.x - newClosestX;
        dz = correctedPosition.z - newClosestZ;
        distSq = dx * dx + dz * dz;
      }
    }

    if (!moved) break;
  }

  return { position: correctedPosition, velocity: correctedVelocity };
}

function updateShipAttachment(
  playerBody: RAPIER.RigidBody,
  entities: VoxelEntity[],
  elapsed: number,
  isDrivingShip: boolean,
  isFlying: boolean
) {
  if (isFlying) {
    shipAttachment = null;
    return;
  }

  const p = playerBody.translation();
  const playerWorld = new THREE.Vector3(p.x, p.y, p.z);
  const support = getTopSupport(entities, playerWorld);

  if (support) {
    if (!shipAttachment || shipAttachment.ship !== support.entity) {
      shipAttachment = {
        ship: support.entity,
        localPosition: support.localPosition.clone(),
        localVelocity: new THREE.Vector3(),
        missingSince: null,
        localBaseY: support.topY
      };
    } else {
      shipAttachment.missingSince = null;
      shipAttachment.localBaseY = support.topY;
    }
    return;
  }

  if (!shipAttachment) return;
  if (shipAttachment.missingSince === null) shipAttachment.missingSince = elapsed;
  if (!isDrivingShip && elapsed - shipAttachment.missingSince > 1) {
    shipAttachment = null;
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
    playerCameraQuaternion.copy(controls.object.quaternion);
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
          normal: normal.transformDirection(entity.group.matrixWorld).normalize(),
          blockId: id
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

  const position = body.translation();
  const attachment = shipAttachment;

  if (!isFlying && attachment) {
    const forward = new THREE.Vector3();
    controls.object.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() > 0) forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    const moveWorld = new THREE.Vector3();
    if (keys.has("KeyW")) moveWorld.add(forward);
    if (keys.has("KeyS")) moveWorld.sub(forward);
    if (keys.has("KeyD")) moveWorld.add(right);
    if (keys.has("KeyA")) moveWorld.sub(right);
    if (moveWorld.lengthSq() > 0) moveWorld.normalize();

    const jumpIntent = keys.has("Space") && !suppressNextJump;
    const speed = keys.has("ShiftLeft") ? 6.4 : 4.4;
    const deltaWorld = moveWorld.multiplyScalar(speed * dt);
    const parent = attachment.ship;
    const inverseParent = parent.group.quaternion.clone().invert();
    const deltaLocal = deltaWorld.clone().applyQuaternion(inverseParent);

    attachment.localPosition.x += deltaLocal.x;
    attachment.localPosition.z += deltaLocal.z;

    const predictedWorld = parent.localToWorld(attachment.localPosition.clone());
    const support = getTopSupport([parent], predictedWorld);
    const parentVelocity = parent.body.linvel();
    const movementVelocity = dt > 0 ? deltaLocal.clone().divideScalar(dt) : new THREE.Vector3();

    if (support && !jumpIntent) {
      attachment.localBaseY = support.topY;
      attachment.localPosition.y = support.topY + PLAYER_FOOT_OFFSET;
      attachment.localVelocity.set(movementVelocity.x, 0, movementVelocity.z);
    } else {
      if (jumpIntent) {
        attachment.localVelocity.y = Math.max(attachment.localVelocity.y, 6.5);
      } else {
        attachment.localVelocity.y -= 14.5 * dt;
      }
      attachment.localVelocity.x = movementVelocity.x;
      attachment.localVelocity.z = movementVelocity.z;
      attachment.localPosition.y += attachment.localVelocity.y * dt;
    }

    const finalWorld = parent.localToWorld(attachment.localPosition.clone());
    const worldVelocity = new THREE.Vector3(parentVelocity.x, parentVelocity.y, parentVelocity.z);
    worldVelocity.add(attachment.localVelocity);
    const resolved = resolveShipAttachmentCollision(parent, attachment.localPosition, attachment.localVelocity);
    attachment.localPosition.copy(resolved.position);
    attachment.localVelocity.copy(resolved.velocity);
    const finalResolvedWorld = parent.localToWorld(attachment.localPosition.clone());
    const resolvedWorldVelocity = new THREE.Vector3(parentVelocity.x, parentVelocity.y, parentVelocity.z).add(attachment.localVelocity);
    body.setTranslation({ x: finalResolvedWorld.x, y: finalResolvedWorld.y, z: finalResolvedWorld.z }, true);
    body.setLinvel({ x: resolvedWorldVelocity.x, y: resolvedWorldVelocity.y, z: resolvedWorldVelocity.z }, true);
    body.setGravityScale(0, true);
    suppressNextJump = false;
    return;
  }

  const forward = new THREE.Vector3();
  controls.object.getWorldDirection(forward);
  const flatForward = forward.clone();
  flatForward.y = 0;
  if (flatForward.lengthSq() > 0) flatForward.normalize();
  const right = new THREE.Vector3().crossVectors(flatForward, new THREE.Vector3(0, 1, 0)).normalize();
  const wish = new THREE.Vector3();

  if (keys.has("KeyW")) wish.add(isFlying ? forward : flatForward);
  if (keys.has("KeyS")) wish.sub(isFlying ? forward : flatForward);
  if (keys.has("KeyD")) wish.add(right);
  if (keys.has("KeyA")) wish.sub(right);
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
  isRudderActive: boolean,
  wind: WindState
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
  const cache = ship.physicsCache;
  const linvel = body.linvel();
  const velocity = new THREE.Vector3(linvel.x, 0, linvel.z);
  const forwardAxis = orientationVector(activeRudderOrientation).multiplyScalar(-1).applyQuaternion(levelRotation).normalize();
  const sideAxis = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), forwardAxis).normalize();
  const windAlignment = Math.max(0, wind.direction.dot(forwardAxis) * 0.7 + Math.abs(wind.direction.dot(sideAxis)) * 0.35);
  const sailForce = wind.direction.clone().multiplyScalar(cache.sailArea * wind.speed * wind.speed * 0.004 * windAlignment);
  const forwardDrag = forwardAxis.clone().multiplyScalar(-velocity.dot(forwardAxis) * Math.abs(velocity.dot(forwardAxis)) * 0.016 * cache.beam);
  const sideDrag = sideAxis.clone().multiplyScalar(-velocity.dot(sideAxis) * Math.abs(velocity.dot(sideAxis)) * (0.08 + cache.keelArea * 0.035));
  const buoyancyTarget = WATER_LEVEL + 0.14 + bob + Math.min(0.16, cache.hullCount * 0.002);
  const shipMass = Math.max(1, body.mass());
  const gravityMagnitude = shipMass * Math.abs(WORLD_GRAVITY) * body.gravityScale();
  const gravityForce = new THREE.Vector3(0, -gravityMagnitude, 0);
  const hullWaterlineWorld = translation.y + cache.waterline;
  const immersionDepth = WATER_LEVEL - hullWaterlineWorld;
  const submersion = THREE.MathUtils.clamp(immersionDepth * 1.8, 0, 1);
  const buoyancyForce = new THREE.Vector3(0, gravityMagnitude * submersion, 0);
  const waterDrag = velocity.clone().multiplyScalar(-(0.018 + submersion * 0.07) * shipMass);
  const verticalDrag = new THREE.Vector3(0, -linvel.y * shipMass * (0.7 + submersion * 1.4), 0);
  const buoyancyPoint = new THREE.Vector3(
    translation.x + cache.centerOfMass.x,
    translation.y + cache.centerOfMass.y,
    translation.z + cache.centerOfMass.z
  );
  const nextVelocity = velocity.add(sailForce).add(forwardDrag).add(sideDrag);
  body.addForceAtPoint(
    { x: buoyancyForce.x, y: buoyancyForce.y, z: buoyancyForce.z },
    { x: buoyancyPoint.x, y: buoyancyPoint.y, z: buoyancyPoint.z },
    true
  );
  body.addForceAtPoint(
    { x: verticalDrag.x, y: verticalDrag.y, z: verticalDrag.z },
    { x: buoyancyPoint.x, y: buoyancyPoint.y, z: buoyancyPoint.z },
    true
  );
  body.addForceAtPoint(
    { x: waterDrag.x, y: waterDrag.y, z: waterDrag.z },
    { x: buoyancyPoint.x, y: buoyancyPoint.y, z: buoyancyPoint.z },
    true
  );
  body.setLinvel({ x: nextVelocity.x, y: linvel.y * 0.98, z: nextVelocity.z }, true);
  body.setAngvel({ x: 0, y: body.angvel().y, z: 0 }, true);
  if (debugForcesEnabled) {
    const origin = new THREE.Vector3(translation.x, translation.y, translation.z);
    debugForceRecords.push({
      label: "gravity",
      source: buoyancyPoint.clone(),
      vector: gravityForce,
      color: 0xff6b6b
    });
    debugForceRecords.push({
      label: "sail",
      source: origin.clone().add(cache.sailCenter.clone().applyQuaternion(levelRotation)),
      vector: sailForce.clone(),
      color: 0xf1e4c4
    });
    debugForceRecords.push({
      label: "keel",
      source: origin.clone().add(cache.keelCenter.clone().applyQuaternion(levelRotation)),
      vector: sideDrag.clone(),
      color: 0x8ab6ff
    });
    debugForceRecords.push({
      label: "buoyancy",
      source: buoyancyPoint.clone(),
      vector: buoyancyForce.clone(),
      color: 0x7cf2ff
    });
    debugForceRecords.push({
      label: "vertical-drag",
      source: buoyancyPoint.clone(),
      vector: verticalDrag.clone(),
      color: 0xa7f0ff
    });
    debugForceRecords.push({
      label: "water-drag",
      source: buoyancyPoint.clone(),
      vector: waterDrag.clone(),
      color: 0x79b6ff
    });
  }
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
  const speed = keys.has("ShiftLeft") ? 5.4 : 2.8;
  const desired = forward.multiplyScalar(throttle * speed);
  const current = body.linvel();
  body.setLinvel(
    {
      x: THREE.MathUtils.lerp(current.x, desired.x, 0.08),
      y: current.y,
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
