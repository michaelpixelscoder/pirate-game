import "./style.css";
import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { VoxelWorldEngine } from "./engine";
import { createDefaultBlockRegistry, BlockPlacementSystem } from "./building";
import { DebugVectorRenderer, clearGroup } from "./rendering/debugVectors";
import { applyGravityAndBuoyancy } from "./gameplay/buoyancy";
import { updatePlayerMotion } from "./gameplay/playerController";
import { createWaterMaterial } from "./rendering/water";
import { createBoatTemplate, createCatamaranTemplate, createPenicheTemplate } from "./worlds/boat";
import { createIslandTemplate } from "./worlds/island";
import { templateVoxels } from "./worlds/utils.ts";
import type { EntityId, VoxelCell } from "./engine";

type EntityView = {
  group: THREE.Group;
  voxelCount: number;
};

const BLOCK_COLORS: Record<string, number> = {
  stone: 0x87919a,
  dirt: 0x7b5535,
  sand: 0xd9c47c,
  wood_trunk: 0x6b4629,
  foliage: 0x3f8f4d,
  wood_plank: 0xb8824c,
  rudder: 0x6e4024,
  sail: 0xf1e4c4,
  keel: 0x51351f
};

const textureLoader = new THREE.TextureLoader();
const base = import.meta.env.BASE_URL;
const atlasTexture = textureLoader.load(`${base}textures/block-atlas.png`);
atlasTexture.wrapS = THREE.RepeatWrapping;
atlasTexture.wrapT = THREE.RepeatWrapping;
atlasTexture.magFilter = THREE.NearestFilter;
atlasTexture.minFilter = THREE.NearestMipmapNearestFilter;
atlasTexture.colorSpace = THREE.SRGBColorSpace;

const rudderTexture = textureLoader.load(`${base}textures/rudder.png`);
rudderTexture.wrapS = THREE.RepeatWrapping;
rudderTexture.wrapT = THREE.RepeatWrapping;
rudderTexture.magFilter = THREE.NearestFilter;
rudderTexture.minFilter = THREE.NearestMipmapNearestFilter;
rudderTexture.colorSpace = THREE.SRGBColorSpace;

const blockMaterialCache = new Map<string, THREE.MeshStandardMaterial>();

type AtlasTile = { col: number; row: number };
const ATLAS_GRID_COLS = 3;
const ATLAS_GRID_ROWS = 2;
const atlasTiles: Record<string, AtlasTile> = {
  stone: { col: 0, row: 0 },
  dirt: { col: 1, row: 0 },
  sand: { col: 2, row: 0 },
  wood_trunk: { col: 0, row: 1 },
  foliage: { col: 1, row: 1 },
  wood_plank: { col: 2, row: 1 }
};

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app container");

app.innerHTML = `
  <div class="hud">
    <div class="panel">
      <div class="title">Voxel Engine Prototype</div>
      <div class="meta">Agnostic engine pass: parented entities, world/local transforms, force introspection, and a bottom toolbar for core tools.</div>
    </div>
    <div class="panel entity-list"></div>
  </div>
  <div class="info"></div>
  <div class="forces panel"></div>
  <div class="block-toolbar panel"></div>
  <div class="toolbar panel"></div>
  <div class="destroy-progress"></div>
  <div class="reticle"></div>
`;

const entityListEl = document.querySelector<HTMLDivElement>(".entity-list");
const infoEl = document.querySelector<HTMLDivElement>(".info");
const forcesEl = document.querySelector<HTMLDivElement>(".forces");
const blockToolbarEl = document.querySelector<HTMLDivElement>(".block-toolbar");
const toolbarEl = document.querySelector<HTMLDivElement>(".toolbar");
const destroyProgressEl = document.querySelector<HTMLDivElement>(".destroy-progress");
const WATER_LEVEL = -0.1;

const engine = new VoxelWorldEngine();
const blockRegistry = createDefaultBlockRegistry();
const blockPlacement = new BlockPlacementSystem(engine, blockRegistry, () =>
  engine.listEntities().filter((entity) => entity.kind === "voxel" && entity.id !== engine.rootId).map((entity) => entity.id)
);
const debugVectorRenderer = new DebugVectorRenderer(engine);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x88c8df);
scene.fog = new THREE.FogExp2(0x88c8df, 0.018);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.tabIndex = 0;
renderer.domElement.style.outline = "none";
app.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(0, 4, 10);
const controls = new PointerLockControls(camera, renderer.domElement);
scene.add(controls.object);

scene.add(new THREE.HemisphereLight(0xbdeeff, 0x245066, 1.8));
const sun = new THREE.DirectionalLight(0xfff3c7, 3.2);
sun.position.set(-25, 45, 28);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);

const waterMaterial = createWaterMaterial(WATER_LEVEL);
const water = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000, 200, 200), waterMaterial);
water.rotation.x = -Math.PI / 2;
water.position.y = WATER_LEVEL;
water.renderOrder = 1;
scene.add(water);

const underWater = new THREE.Mesh(
  new THREE.PlaneGeometry(2000, 2000, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x082739, roughness: 1, metalness: 0 })
);
underWater.rotation.x = -Math.PI / 2;
underWater.position.y = WATER_LEVEL - 0.4;
scene.add(underWater);

const entityViews = new Map<EntityId, EntityView>();
scene.add(debugVectorRenderer.group);
const ghostGroup = new THREE.Group();
ghostGroup.name = "block-ghost";
scene.add(ghostGroup);

const keys = new Set<string>();
let selectedEntityId: EntityId = "ship";
let gravityEnabled = true;
let cameraYaw = 0;
let cameraPitch = -0.1;
let draggingLook = false;
let movementForward = 0;
let movementStrafe = 0;
let movementVertical = 0;
let primaryMouseDown = false;

function focusGameInput() {
  renderer.domElement.focus();
}

function setMovementState(event: KeyboardEvent, isDown: boolean) {
  if (event.code === "KeyW") movementForward = isDown ? 1 : 0;
  if (event.code === "KeyS") movementForward = isDown ? -1 : 0;
  if (event.code === "KeyD") movementStrafe = isDown ? 1 : 0;
  if (event.code === "KeyA") movementStrafe = isDown ? -1 : 0;
  if (event.code === "Space") movementVertical = isDown ? 1 : 0;
  if (event.code === "KeyC") movementVertical = isDown ? -1 : 0;
}

function blockColor(block: string) {
  const registered = blockRegistry.getBlock(block);
  if (registered) return registered.color;
  if (block.includes("stone")) return BLOCK_COLORS.stone;
  if (block.includes("dirt")) return BLOCK_COLORS.dirt;
  if (block.includes("sand")) return BLOCK_COLORS.sand;
  if (block.includes("trunk")) return BLOCK_COLORS.wood_trunk;
  if (block.includes("foliage")) return BLOCK_COLORS.foliage;
  if (block.includes("plank")) return BLOCK_COLORS.wood_plank;
  if (block.includes("rudder")) return BLOCK_COLORS.rudder;
  if (block.includes("sail")) return BLOCK_COLORS.sail;
  if (block.includes("keel")) return BLOCK_COLORS.keel;
  return 0xb7c3cb;
}

function createAtlasTileTexture(tile: AtlasTile) {
  const texture = atlasTexture.clone();
  texture.needsUpdate = true;
  texture.repeat.set(1 / ATLAS_GRID_COLS, 1 / ATLAS_GRID_ROWS);
  texture.offset.set(tile.col / ATLAS_GRID_COLS, 1 - (tile.row + 1) / ATLAS_GRID_ROWS);
  return texture;
}

function blockTextureKey(block: string) {
  if (block.includes("stone")) return "stone";
  if (block.includes("dirt")) return "dirt";
  if (block.includes("sand")) return "sand";
  if (block.includes("trunk") || block.includes("mast")) return "wood_trunk";
  if (block.includes("foliage")) return "foliage";
  if (block.includes("plank") || block.includes("beam") || block.includes("bollard") || block.includes("keel")) return "wood_plank";
  if (block.includes("rudder")) return "rudder";
  return null;
}

function textureSwatchStyle(textureKey: string) {
  if (textureKey === "rudder") {
    return "background-image:url('/textures/rudder.png');background-size:cover;background-position:center;";
  }
  const tile = atlasTiles[textureKey];
  if (!tile) return "";
  const xPercent = (tile.col / Math.max(1, ATLAS_GRID_COLS - 1)) * 100;
  const yPercent = (tile.row / Math.max(1, ATLAS_GRID_ROWS - 1)) * 100;
  return `background-image:url('/textures/block-atlas.png');background-size:${ATLAS_GRID_COLS * 100}% ${ATLAS_GRID_ROWS * 100}%;background-position:${xPercent}% ${yPercent}%;`;
}

function buildToolbarSwatch(entry: { icon: string; blockId?: string }, index: number) {
  if (index === 0) return `<span class="swatch">${entry.icon}</span>`;
  if (!entry.blockId) return `<span class="swatch">${entry.icon}</span>`;
  const key = blockTextureKey(entry.blockId);
  if (!key) return `<span class="swatch">${entry.icon}</span>`;
  return `<span class="swatch swatch--texture" style="${textureSwatchStyle(key)}"></span>`;
}

function blockMaterial(block: string) {
  const textureKey = blockTextureKey(block);
  const cacheKey = textureKey ?? `color:${block}`;
  const cached = blockMaterialCache.get(cacheKey);
  if (cached) return cached;

  let material: THREE.MeshStandardMaterial;
  if (textureKey === "rudder") {
    material = new THREE.MeshStandardMaterial({
      map: rudderTexture,
      color: 0xffffff,
      roughness: 0.86,
      metalness: 0.03
    });
  } else if (textureKey && atlasTiles[textureKey]) {
    material = new THREE.MeshStandardMaterial({
      map: createAtlasTileTexture(atlasTiles[textureKey]),
      color: 0xffffff,
      roughness: 0.88,
      metalness: 0.02
    });
  } else {
    material = new THREE.MeshStandardMaterial({
      color: blockColor(block),
      roughness: 0.9,
      metalness: 0.02
    });
  }

  blockMaterialCache.set(cacheKey, material);
  return material;
}

function vecToString(v: { x: number; y: number; z: number }, digits = 2) {
  return `${v.x.toFixed(digits)}, ${v.y.toFixed(digits)}, ${v.z.toFixed(digits)}`;
}

function quatToString(v: { x: number; y: number; z: number; w: number }, digits = 2) {
  return `${v.x.toFixed(digits)}, ${v.y.toFixed(digits)}, ${v.z.toFixed(digits)}, ${v.w.toFixed(digits)}`;
}

function createVoxelMesh(voxel: VoxelCell) {
  const material = blockMaterial(voxel.value);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  mesh.position.set(voxel.x + 0.5, voxel.y + 0.5, voxel.z + 0.5);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createEntityView(id: EntityId) {
  const entity = engine.getEntity(id);
  if (!entity) return;
  const view: EntityView = { group: new THREE.Group(), voxelCount: -1 };
  view.group.name = `entity-${id}`;
  scene.add(view.group);
  entityViews.set(id, view);
  syncEntityView(id);
}

function syncEntityView(id: EntityId) {
  const entity = engine.getEntity(id);
  const view = entityViews.get(id);
  if (!entity || !view) return;

  if (entity.kind === "voxel") {
    const voxelCount = entity.voxels?.size ?? 0;
    if (view.voxelCount !== voxelCount) {
      clearGroup(view.group);
      for (const voxel of entity.voxels?.values() ?? []) view.group.add(createVoxelMesh(voxel));
      view.voxelCount = voxelCount;
    }
  }

  const world = engine.getIntrospection(id).worldTransform;
  view.group.position.set(world.position.x, world.position.y, world.position.z);
  view.group.quaternion.set(world.rotation.x, world.rotation.y, world.rotation.z, world.rotation.w);
  view.group.scale.set(world.scale.x, world.scale.y, world.scale.z);
}

function setSelectedEntity(id: EntityId) {
  if (!engine.getEntity(id)) return;
  selectedEntityId = id;
  renderEntityList();
}

function renderEntityList() {
  if (!entityListEl) return;
  entityListEl.innerHTML = engine
    .listEntities()
    .map((entity) => {
      const active = entity.id === selectedEntityId ? "active" : "";
      const parent = entity.parentId ?? "none";
      return `<button class="slot ${active}" data-entity="${entity.id}">
        <span class="swatch" style="background:#${entity.kind === "voxel" ? "8fb1c6" : "d6c67a"}"></span>
        <span>${entity.name} | ${parent}</span>
      </button>`;
    })
    .join("");
  entityListEl.querySelectorAll<HTMLButtonElement>("[data-entity]").forEach((button) => {
    button.addEventListener("click", () => setSelectedEntity(button.dataset.entity ?? selectedEntityId));
  });
}

let buildToolbarViewportEl: HTMLDivElement | null = null;
let buildToolbarTrackEl: HTMLDivElement | null = null;
let buildToolbarLeftEl: HTMLButtonElement | null = null;
let buildToolbarRightEl: HTMLButtonElement | null = null;

function syncBuildToolbarSelection() {
  if (!buildToolbarTrackEl) return;
  const buttons = Array.from(buildToolbarTrackEl.querySelectorAll<HTMLButtonElement>("[data-tool-index]"));
  buttons.forEach((button) => {
    const index = Number(button.dataset.toolIndex);
    button.classList.toggle("active", index === blockPlacement.selectionIndex);
  });

  const activeButton = buildToolbarTrackEl.querySelector<HTMLButtonElement>(`[data-tool-index="${blockPlacement.selectionIndex}"]`);
  activeButton?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  updateBuildToolbarOverflow();
  updateInfoPanel();
}

function updateBuildToolbarOverflow() {
  if (!buildToolbarViewportEl || !buildToolbarLeftEl || !buildToolbarRightEl) return;
  const canScrollLeft = buildToolbarViewportEl.scrollLeft > 2;
  const canScrollRight = buildToolbarViewportEl.scrollLeft + buildToolbarViewportEl.clientWidth < buildToolbarViewportEl.scrollWidth - 2;
  buildToolbarLeftEl.classList.toggle("visible", canScrollLeft);
  buildToolbarRightEl.classList.toggle("visible", canScrollRight);
}

function renderBuildToolbar() {
  if (!blockToolbarEl) return;
  blockToolbarEl.innerHTML = `
    <button class="toolbar-arrow toolbar-arrow--left" type="button" aria-label="Scroll blocks left">◀</button>
    <div class="block-toolbar__viewport">
      <div class="block-toolbar__track"></div>
    </div>
    <button class="toolbar-arrow toolbar-arrow--right" type="button" aria-label="Scroll blocks right">▶</button>
  `;
  buildToolbarViewportEl = blockToolbarEl.querySelector<HTMLDivElement>(".block-toolbar__viewport");
  buildToolbarTrackEl = blockToolbarEl.querySelector<HTMLDivElement>(".block-toolbar__track");
  buildToolbarLeftEl = blockToolbarEl.querySelector<HTMLButtonElement>(".toolbar-arrow--left");
  buildToolbarRightEl = blockToolbarEl.querySelector<HTMLButtonElement>(".toolbar-arrow--right");
  if (!buildToolbarTrackEl || !buildToolbarViewportEl || !buildToolbarLeftEl || !buildToolbarRightEl) return;

  buildToolbarTrackEl.innerHTML = blockPlacement.entries
    .map((entry, index) => {
      const active = index === blockPlacement.selectionIndex ? "active" : "";
      return `
        <button class="block-slot ${active}" type="button" data-tool-index="${index}">
          ${buildToolbarSwatch(entry, index)}
          <span class="slot-name">${index === 0 ? "Empty Hand" : entry.name}</span>
        </button>
      `;
    })
    .join("");

  buildToolbarTrackEl.querySelectorAll<HTMLButtonElement>("[data-tool-index]").forEach((button) => {
    button.addEventListener("click", () => {
      blockPlacement.selectIndex(Number(button.dataset.toolIndex));
      syncBuildToolbarSelection();
    });
  });

  buildToolbarLeftEl.addEventListener("click", () => {
    buildToolbarViewportEl?.scrollBy({ left: -240, behavior: "smooth" });
  });
  buildToolbarRightEl.addEventListener("click", () => {
    buildToolbarViewportEl?.scrollBy({ left: 240, behavior: "smooth" });
  });

  buildToolbarViewportEl.addEventListener("scroll", updateBuildToolbarOverflow);
  window.addEventListener("resize", updateBuildToolbarOverflow);
  updateBuildToolbarOverflow();
}

function updateInfoPanel(cursorBlockId: string | null = null) {
  const selected = engine.getIntrospection(selectedEntityId);
  const parent = selected.parentId ?? "world";
  const env = engine.getEnvironment();
  const globalDebug = engine.getGlobalDebug();
  const activeTool = blockPlacement.selectedTool;
  const activeBlock = blockPlacement.selectedBlock;
  const toolLabel = blockPlacement.selectionIndex === 0 ? "Empty Hand" : activeTool.name;
  const cursorBlockLabel = cursorBlockId
    ? (blockRegistry.getBlock(cursorBlockId)?.name ?? cursorBlockId)
    : "none";
  infoEl!.textContent = [
    `selected: ${selected.name} (${selected.kind})`,
    `parent: ${parent}`,
    `physics: ${selected.physics} | collides: ${selected.collides ? "yes" : "no"}`,
    `cursor block: ${cursorBlockLabel}`,
    `tool: ${toolLabel}`,
    `block: ${activeBlock ? activeBlock.name : "none"}`,
    `rotation: ${(blockPlacement.getRotationTurns() * 90) % 360}deg`,
    `local pos: ${vecToString(selected.localTransform.position)}`,
    `local rot: ${quatToString(selected.localTransform.rotation)}`,
    `world pos: ${vecToString(selected.worldTransform.position)}`,
    `world vel: ${vecToString(selected.worldVelocity)}`,
    `local vel: ${vecToString(selected.localVelocity)}`,
    `gravity: ${vecToString(env.gravity)}`,
    `wind: ${vecToString(env.wind)}`,
    `voxel count: ${selected.voxelCount}`
  ].join("\n");

  const net = selected.forces.reduce(
    (sum, force) => ({
      x: sum.x + force.vector.x,
      y: sum.y + force.vector.y,
      z: sum.z + force.vector.z
    }),
    { x: 0, y: 0, z: 0 }
  );
  const forceLines = selected.forces.length
    ? selected.forces.map((force) => `${force.label}: ${vecToString(force.vector)} @ ${vecToString(force.source)}`)
    : ["No forces applied to selected entity."];
  forcesEl!.textContent = [
    `Forces for ${selected.name}`,
    `global forces vectors: ${globalDebug.forces ? "on" : "off"}`,
    `global velocity vectors: ${globalDebug.velocity ? "on" : "off"}`,
    `environment gravity: ${vecToString(env.gravity)}`,
    `environment wind: ${vecToString(env.wind)}`,
    ...forceLines,
    `net: ${vecToString(net)}`
  ].join("\n");
}

function reparentEntityPreserveWorld(id: EntityId, parentId: EntityId | null) {
  const entity = engine.getEntity(id);
  const parent = parentId ? engine.getEntity(parentId) : engine.getEntity(engine.rootId);
  if (!entity || !parent) return;
  const world = engine.getIntrospection(id).worldTransform;
  const parentWorld = engine.getIntrospection(parent.id).worldTransform;
  const worldPos = new THREE.Vector3(world.position.x, world.position.y, world.position.z);
  const parentPos = new THREE.Vector3(parentWorld.position.x, parentWorld.position.y, parentWorld.position.z);
  const parentQuat = new THREE.Quaternion(parentWorld.rotation.x, parentWorld.rotation.y, parentWorld.rotation.z, parentWorld.rotation.w);
  const localPos = worldPos.clone().sub(parentPos).applyQuaternion(parentQuat.clone().invert());
  engine.setParent(id, parentId);
  engine.patchEntity(id, {
    transform: {
      position: { x: localPos.x, y: localPos.y, z: localPos.z }
    }
  });
}

function cycleSelectedEntity() {
  const entities = engine.listEntities().filter((entity) => entity.id !== engine.rootId);
  const index = entities.findIndex((entity) => entity.id === selectedEntityId);
  const next = entities[(index + 1) % entities.length];
  if (next) setSelectedEntity(next.id);
}

function updateToolbarLabels() {
  const gravityButton = toolbarEl?.querySelector<HTMLButtonElement>("[data-action='toggle-gravity']");
  const windButton = toolbarEl?.querySelector<HTMLButtonElement>("[data-action='toggle-wind']");
  const selected = engine.getEntity(selectedEntityId);
  const globalDebug = engine.getGlobalDebug();
  if (gravityButton) {
    gravityButton.textContent = engine.getEnvironment().gravity.y === 0 ? "Gravity Off" : "Gravity On";
  }
  if (windButton) {
    windButton.textContent = engine.getEnvironment().wind.x === 0 && engine.getEnvironment().wind.z === 0 ? "Wind Off" : "Wind On";
  }
  const forceButton = toolbarEl?.querySelector<HTMLButtonElement>("[data-action='global-forces']");
  const velocityButton = toolbarEl?.querySelector<HTMLButtonElement>("[data-action='global-velocity']");
  const gravityButtonState = toolbarEl?.querySelector<HTMLButtonElement>("[data-action='toggle-gravity']");
  const selForceButton = toolbarEl?.querySelector<HTMLButtonElement>("[data-action='debug-selected-forces']");
  const selVelocityButton = toolbarEl?.querySelector<HTMLButtonElement>("[data-action='debug-selected-velocity']");
  if (forceButton) forceButton.textContent = globalDebug.forces ? "Hide Force Vectors" : "Show Force Vectors";
  if (velocityButton) velocityButton.textContent = globalDebug.velocity ? "Hide Velocity Vectors" : "Show Velocity Vectors";
  if (gravityButtonState) gravityButtonState.textContent = gravityEnabled ? "Gravity On" : "Gravity Off";
  if (selForceButton) selForceButton.textContent = selected?.debug.forces ? "Sel Forces On" : "Sel Forces Off";
  if (selVelocityButton) selVelocityButton.textContent = selected?.debug.velocity ? "Sel Velocity On" : "Sel Velocity Off";
}

function setEnvironmentGravity(enabled: boolean) {
  gravityEnabled = enabled;
  engine.setEnvironment({ gravity: { x: 0, y: 0, z: 0 } });
  updateToolbarLabels();
}

function setEnvironmentWind(enabled: boolean) {
  engine.setEnvironment({ wind: enabled ? { x: 0.7, y: 0, z: 0.25 } : { x: 0, y: 0, z: 0 } });
  updateToolbarLabels();
}

const shipTemplate = createBoatTemplate();
const catamaranTemplate = createCatamaranTemplate();
const penicheTemplate = createPenicheTemplate();
const islandTemplate = createIslandTemplate();

engine.createEntity({
  id: "island",
  name: islandTemplate.name,
  kind: "voxel",
  physics: "static",
  collides: true,
  parentId: engine.rootId,
  transform: {
    position: { x: islandTemplate.position[0], y: islandTemplate.position[1], z: islandTemplate.position[2] },
    rotation: { x: islandTemplate.rotation[0], y: islandTemplate.rotation[1], z: islandTemplate.rotation[2], w: islandTemplate.rotation[3] }
  },
  voxels: templateVoxels(islandTemplate.voxels)
});

engine.createEntity({
  id: "ship",
  name: shipTemplate.name,
  kind: "voxel",
  physics: "dynamic",
  collides: true,
  parentId: engine.rootId,
  transform: {
    position: { x: shipTemplate.position[0], y: shipTemplate.position[1], z: shipTemplate.position[2] },
    rotation: { x: shipTemplate.rotation[0], y: shipTemplate.rotation[1], z: shipTemplate.rotation[2], w: shipTemplate.rotation[3] }
  },
  voxels: templateVoxels(shipTemplate.voxels),
  debug: { forces: true, velocity: true }
});

engine.createEntity({
  id: "catamaran",
  name: catamaranTemplate.name,
  kind: "voxel",
  physics: "dynamic",
  collides: true,
  parentId: engine.rootId,
  transform: {
    position: { x: catamaranTemplate.position[0], y: catamaranTemplate.position[1], z: catamaranTemplate.position[2] },
    rotation: {
      x: catamaranTemplate.rotation[0],
      y: catamaranTemplate.rotation[1],
      z: catamaranTemplate.rotation[2],
      w: catamaranTemplate.rotation[3]
    }
  },
  voxels: templateVoxels(catamaranTemplate.voxels)
});

engine.createEntity({
  id: "peniche",
  name: penicheTemplate.name,
  kind: "voxel",
  physics: "dynamic",
  collides: true,
  parentId: engine.rootId,
  transform: {
    position: { x: penicheTemplate.position[0], y: penicheTemplate.position[1], z: penicheTemplate.position[2] },
    rotation: {
      x: penicheTemplate.rotation[0],
      y: penicheTemplate.rotation[1],
      z: penicheTemplate.rotation[2],
      w: penicheTemplate.rotation[3]
    }
  },
  voxels: templateVoxels(penicheTemplate.voxels)
});

engine.createEntity({
  id: "player",
  name: "player",
  kind: "generic",
  physics: "dynamic",
  collides: false,
  parentId: "island",
  transform: {
    position: { x: 10, y: 7, z: -1 },
    rotation: { x: 0, y: 0, z: 0, w: 1 }
  },
  debug: { velocity: true }
});

createEntityView("island");
createEntityView("ship");
createEntityView("catamaran");
createEntityView("peniche");
createEntityView("player");
renderEntityList();
setSelectedEntity("ship");
renderBuildToolbar();

if (!toolbarEl) throw new Error("Missing toolbar panel");
  toolbarEl.innerHTML = `
  <button data-action="global-forces">Show Force Vectors</button>
  <button data-action="global-velocity">Show Velocity Vectors</button>
  <button data-action="toggle-gravity">Gravity Off</button>
  <button data-action="toggle-wind">Wind Off</button>
  <button data-action="attach-world">Parent World</button>
  <button data-action="attach-ship">Parent Ship</button>
  <button data-action="attach-island">Parent Island</button>
  <button data-action="debug-selected-forces">Sel Forces Off</button>
  <button data-action="debug-selected-velocity">Sel Velocity On</button>
  <button data-action="cycle-selected">Cycle Entity</button>
`;
const toolbarButtons = Array.from(toolbarEl.querySelectorAll<HTMLButtonElement>("button"));

document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.code === "KeyW") {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  keys.add(event.code);
  if (event.code === "KeyR" && !event.repeat) {
    blockPlacement.rotateSelection();
    syncBuildToolbarSelection();
  }
  if (event.key === "0") {
    blockPlacement.selectIndex(0);
    syncBuildToolbarSelection();
  }
  if (/^[1-9]$/.test(event.key)) {
    const index = Number(event.key);
    if (index < blockPlacement.entries.length) {
      blockPlacement.selectIndex(index);
      syncBuildToolbarSelection();
    }
  }
  setMovementState(event, true);
  if (["Space", "KeyC", "KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code)) event.preventDefault();
});

document.addEventListener("keyup", (event) => {
  keys.delete(event.code);
  setMovementState(event, false);
  if (["Space", "KeyC", "KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code)) event.preventDefault();
});

window.addEventListener("mousemove", (event) => {
  if (!controls.isLocked && !draggingLook) return;
  const dx = THREE.MathUtils.clamp(event.movementX, -50, 50);
  const dy = THREE.MathUtils.clamp(event.movementY, -50, 50);
  cameraYaw -= dx * 0.0022;
  cameraPitch = THREE.MathUtils.clamp(cameraPitch - dy * 0.0022, -1.45, 1.2);
});

renderer.domElement.addEventListener("pointerdown", (event) => {
  if (!controls.isLocked) {
    if (event.button === 0) renderer.domElement.requestPointerLock();
    focusGameInput();
    return;
  }
  if (event.button === 0) primaryMouseDown = true;
  if (event.button === 2) blockPlacement.place(camera);
  focusGameInput();
});

window.addEventListener("pointerup", (event) => {
  if (event.button === 0) primaryMouseDown = false;
  draggingLook = false;
});

renderer.domElement.addEventListener("wheel", (event) => {
  event.preventDefault();
  blockPlacement.cycleSelection(event.deltaY > 0 ? 1 : -1);
  syncBuildToolbarSelection();
}, { passive: false });

toolbarButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset.action;
    if (action === "global-forces") engine.setGlobalDebug({ forces: !engine.getGlobalDebug().forces });
    if (action === "global-velocity") engine.setGlobalDebug({ velocity: !engine.getGlobalDebug().velocity });
    if (action === "toggle-gravity") setEnvironmentGravity(engine.getEnvironment().gravity.y === 0);
    if (action === "toggle-wind") setEnvironmentWind(engine.getEnvironment().wind.x === 0 && engine.getEnvironment().wind.z === 0);
    if (action === "attach-world") engine.setParentPreserveWorld("player", engine.rootId);
    if (action === "attach-ship") engine.setParentPreserveWorld("player", "ship");
    if (action === "attach-island") engine.setParentPreserveWorld("player", "island");
    if (action === "debug-selected-forces") {
      const current = engine.getEntity(selectedEntityId);
      if (current) engine.setDebugFlags(selectedEntityId, { forces: !current.debug.forces });
    }
    if (action === "debug-selected-velocity") {
      const current = engine.getEntity(selectedEntityId);
      if (current) engine.setDebugFlags(selectedEntityId, { velocity: !current.debug.velocity });
    }
    if (action === "cycle-selected") cycleSelectedEntity();
    renderEntityList();
    updateToolbarLabels();
  });
});

renderer.domElement.addEventListener("click", () => controls.lock());
renderer.domElement.addEventListener("click", () => focusGameInput());
renderer.domElement.addEventListener("contextmenu", (event) => event.preventDefault());
window.addEventListener("pointerlockchange", () => {
  draggingLook = false;
});
window.addEventListener("blur", () => {
  keys.clear();
  movementForward = 0;
  movementStrafe = 0;
  movementVertical = 0;
});

const clock = new THREE.Clock();

function updateCamera() {
  const player = engine.getIntrospection("player");
  const worldPos = new THREE.Vector3(player.worldTransform.position.x, player.worldTransform.position.y, player.worldTransform.position.z);
  controls.object.position.copy(worldPos.clone().add(new THREE.Vector3(0, 1.7, 0)));
  controls.object.quaternion.setFromEuler(new THREE.Euler(cameraPitch, cameraYaw, 0, "YXZ"));
}

function render() {
  const dt = Math.min(clock.getDelta(), 0.05);
  engine.clearAllForces();
  applyGravityAndBuoyancy(engine, {
    waterLevel: WATER_LEVEL,
    gravityEnabled,
    resolveBlockMass: (blockId) => blockRegistry.getBlock(blockId)?.mass ?? 1
  });
  updatePlayerMotion(engine, {
    playerId: "player",
    cameraYaw,
    cameraPitch,
    movementForward,
    movementStrafe,
    movementVertical,
    sprint: keys.has("ShiftLeft")
  });
  engine.step(dt);

  const destroyState = blockPlacement.update(camera, dt, performance.now(), primaryMouseDown);
  const cursorHit = blockPlacement.raycast(camera);

  for (const id of entityViews.keys()) syncEntityView(id);
  debugVectorRenderer.render();
  blockPlacement.createGhostMeshes(ghostGroup, camera);
  if (destroyProgressEl) {
    destroyProgressEl.style.setProperty("--progress", String(destroyState.progress ?? 0));
    destroyProgressEl.classList.toggle("visible", Boolean(primaryMouseDown && destroyState.hit));
  }
  updateInfoPanel(cursorHit?.blockId ?? null);
  updateToolbarLabels();
  updateCamera();

  waterMaterial.uniforms.uTime.value = clock.elapsedTime;

  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

setEnvironmentGravity(true);
setEnvironmentWind(false);
engine.setWorldVelocity("ship", { x: 0, y: 0, z: 0 });
engine.setWorldVelocity("catamaran", { x: 0, y: 0, z: 0 });
engine.setWorldVelocity("peniche", { x: 0, y: 0, z: 0 });
engine.setWorldVelocity("player", { x: 0, y: 0, z: 0 });
render();
