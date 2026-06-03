import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { ResolvedCell } from "../types";
import { blockHexColor } from "../blockColors";
import type { SymmetryState } from "../symmetryTypes";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ViewportProps {
  cells: ResolvedCell[];
  loading: boolean;
  /** Unique key for the loaded asset – camera re-centers when this changes */
  assetKey?: string;
  /** Block id currently selected for placement */
  activePlaceBlock: string;
  /** originPaths that are own cells (can be erased via LMB) */
  editableOriginPaths: Set<string>;
  onAddVoxel?: (x: number, y: number, z: number) => void;
  onRemoveVoxel?: (x: number, y: number, z: number) => void;
  /** Shift+scroll: +1 = next block, -1 = prev block */
  onCycleBlock?: (delta: number) => void;
  /** Name shown in the info bar */
  label?: string;
  symmetry?: SymmetryState;
}

export function Viewport({
  cells,
  loading,
  label,
  assetKey,
  activePlaceBlock,
  editableOriginPaths,
  onAddVoxel,
  onRemoveVoxel,
  onCycleBlock,
  symmetry,
}: ViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneHandle | null>(null);

  // Create / destroy renderer on mount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handle = createScene(container);
    sceneRef.current = handle;
    return () => { handle.dispose(); sceneRef.current = null; };
  }, []);

  // Rebuild instanced meshes when cells / editability changes
  useEffect(() => {
    sceneRef.current?.setCells(cells, editableOriginPaths);
  }, [cells, editableOriginPaths]);

  // Re-center camera only when a new asset is loaded
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (assetKey) sceneRef.current?.centerCamera(); }, [assetKey]);

  // Update ghost block color
  useEffect(() => {
    sceneRef.current?.setPlaceColor(blockHexColor(activePlaceBlock));
  }, [activePlaceBlock]);

  // Update callbacks (keeps scene closures fresh)
  useEffect(() => {
    sceneRef.current?.setCallbacks(onAddVoxel, onRemoveVoxel, onCycleBlock);
  }, [onAddVoxel, onRemoveVoxel, onCycleBlock]);

  // Update symmetry planes
  useEffect(() => {
    sceneRef.current?.setSymmetry(symmetry ?? null);
  }, [symmetry]);

  return (
    <div className="viewport">
      {/* Always mounted – Three.js attaches here on first render */}
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {cells.length === 0 && !loading && (
        <div className="viewport-empty">
          <div className="viewport-empty-icon">🗺</div>
          <div className="viewport-empty-text">Select an asset to preview</div>
        </div>
      )}

      {cells.length > 0 && (
        <div className="viewport-info">
          {label && <span>{label} · </span>}
          <span>{cells.length.toLocaleString()} cells</span>
          <span style={{ marginLeft: 10, opacity: 0.5 }}>
            LMB orbit · RMB pan · Shift+scroll block · F frame
          </span>
        </div>
      )}

      {loading && (
        <div className="viewport-loading">
          <span>⟳</span>
          <span>Resolving references…</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Three.js scene (imperative, outside React render cycle)
// ---------------------------------------------------------------------------

interface CellEntry { x: number; y: number; z: number; originPath: string }

interface SceneHandle {
  setCells: (cells: ResolvedCell[], editablePaths: Set<string>) => void;
  centerCamera: () => void;
  setPlaceColor: (hex: number) => void;
  setCallbacks: (
    onAdd: ViewportProps["onAddVoxel"],
    onRemove: ViewportProps["onRemoveVoxel"],
    onCycle: ViewportProps["onCycleBlock"],
  ) => void;
  setSymmetry: (state: SymmetryState | null) => void;
  dispose: () => void;
}

const SHARED_BOX = new THREE.BoxGeometry(1, 1, 1);
const DUMMY = new THREE.Object3D();

function createScene(container: HTMLElement): SceneHandle {
  // ---- Renderer ----
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.setClearColor(0x1a1c1e);
  container.appendChild(renderer.domElement);

  // ---- Scene ----
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x1a1c1e, 0.008);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);
  camera.position.set(30, 25, 30);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.4);
  sun.position.set(40, 80, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(1024);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 400;
  sun.shadow.camera.left = sun.shadow.camera.bottom = -80;
  sun.shadow.camera.right = sun.shadow.camera.top = 80;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x6699cc, 0x4a5540, 0.4));

  const grid = new THREE.GridHelper(200, 40, 0x333840, 0x2a2f35);
  grid.position.y = -0.01;
  scene.add(grid);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };

  const meshGroup = new THREE.Group();
  scene.add(meshGroup);

  // ---- Ghost block (placement preview) ----
  const ghostMat = new THREE.MeshLambertMaterial({
    color: 0x4488ff, transparent: true, opacity: 0.38, depthWrite: false,
  });
  const ghostMesh = new THREE.Mesh(new THREE.BoxGeometry(1.002, 1.002, 1.002), ghostMat);
  ghostMesh.visible = false;
  scene.add(ghostMesh);

  // ---- Erase highlight (wireframe box) ----
  const hlMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.06, 1.06, 1.06),
    new THREE.MeshBasicMaterial({ color: 0xff3333, wireframe: true }),
  );
  hlMesh.visible = false;
  scene.add(hlMesh);

  // ---- Symmetry planes (one per axis) ----
  // Each is a semi-transparent quad shown when that axis is enabled
  function makeSymPlane(color: number) {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.visible = false;
    scene.add(mesh);
    // Edge outline using LineSegments
    const edgeMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5 });
    const edgeGeo = new THREE.EdgesGeometry(mesh.geometry);
    const edge = new THREE.LineSegments(edgeGeo, edgeMat);
    mesh.add(edge);
    return mesh;
  }
  const symPlaneX = makeSymPlane(0xff4444); // Red: YZ plane
  const symPlaneY = makeSymPlane(0x44dd44); // Green: XZ plane
  const symPlaneZ = makeSymPlane(0x4488ff); // Blue: XY plane

  // Rotate so each plane is perpendicular to its axis
  symPlaneX.rotation.y = Math.PI / 2;
  symPlaneY.rotation.x = -Math.PI / 2;
  // symPlaneZ needs no rotation (default PlaneGeometry lies in XY)

  // ---- F key to frame (listens on document, fires when mouse is inside viewport) ----
  let mouseInViewport = false;
  container.addEventListener("mouseenter", () => { mouseInViewport = true; });
  container.addEventListener("mouseleave", () => { mouseInViewport = false; });
  function onDocKeyDown(e: KeyboardEvent) {
    if (!mouseInViewport) return;
    if (e.code === "KeyF") { e.preventDefault(); centerCamera(); }
  }
  document.addEventListener("keydown", onDocKeyDown);

  // ---- Raycaster + per-instance cell map ----
  const raycaster = new THREE.Raycaster();
  const meshCellMap = new Map<THREE.InstancedMesh, CellEntry[]>();
  const occupiedSet = new Set<string>();
  let editablePaths = new Set<string>();
  let cachedCells: ResolvedCell[] = [];

  // Mutable callback refs (avoids stale closures without React deps)
  let cbAdd: ViewportProps["onAddVoxel"];
  let cbRemove: ViewportProps["onRemoveVoxel"];
  let cbCycle: ViewportProps["onCycleBlock"];

  // Hover state
  let hoveredCell: CellEntry | null = null;
  let placeTarget: { x: number; y: number; z: number } | null = null;

  // Drag detection
  let pdX = 0, pdY = 0;
  const CLICK_PX = 4;

  // ---- Material cache ----
  const matCache = new Map<number, THREE.MeshLambertMaterial>();
  function getMat(hex: number) {
    let m = matCache.get(hex);
    if (!m) { m = new THREE.MeshLambertMaterial({ color: hex }); matCache.set(hex, m); }
    return m;
  }

  function cellKey(x: number, y: number, z: number) { return `${x},${y},${z}`; }

  // ---- Hit test ----
  function hitTest(clientX: number, clientY: number) {
    const rect = container.getBoundingClientRect();
    const mx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const my = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(new THREE.Vector2(mx, my), camera);

    const meshes = Array.from(meshCellMap.keys()) as THREE.Object3D[];
    const hits = raycaster.intersectObjects(meshes, false);
    if (!hits.length || hits[0].instanceId === undefined || !hits[0].face) return null;

    const hit = hits[0];
    const cells = meshCellMap.get(hit.object as THREE.InstancedMesh);
    if (!cells) return null;
    const cell = cells[hit.instanceId!];

    // Face normal in world space → rounded to axis-aligned direction
    const norm = hit.face!.normal.clone()
      .applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld))
      .round();

    return { cell, normal: norm };
  }

  // ---- Event handlers ----
  function onMouseMove(e: MouseEvent) {
    const result = hitTest(e.clientX, e.clientY);
    if (!result) {
      ghostMesh.visible = false; hlMesh.visible = false;
      hoveredCell = null; placeTarget = null;
      return;
    }
    const { cell, normal } = result;
    hoveredCell = cell;
    placeTarget = { x: cell.x + normal.x, y: cell.y + normal.y, z: cell.z + normal.z };

    // Ghost at unoccupied target
    if (!occupiedSet.has(cellKey(placeTarget.x, placeTarget.y, placeTarget.z))) {
      ghostMesh.position.set(placeTarget.x + 0.5, placeTarget.y + 0.5, placeTarget.z + 0.5);
      ghostMesh.visible = true;
    } else { ghostMesh.visible = false; }

    // Erase highlight only for editable (own) cells
    if (editablePaths.has(cell.originPath)) {
      hlMesh.position.set(cell.x + 0.5, cell.y + 0.5, cell.z + 0.5);
      hlMesh.visible = true;
    } else { hlMesh.visible = false; }
  }

  function onPointerDown(e: PointerEvent) { pdX = e.clientX; pdY = e.clientY; }

  function onPointerUp(e: PointerEvent) {
    const dx = e.clientX - pdX, dy = e.clientY - pdY;
    if (Math.sqrt(dx * dx + dy * dy) > CLICK_PX) return; // drag → orbit/pan

    if (e.button === 0) {
      // Left click → erase own cell
      if (hoveredCell && editablePaths.has(hoveredCell.originPath)) {
        cbRemove?.(hoveredCell.x, hoveredCell.y, hoveredCell.z);
      }
    } else if (e.button === 2) {
      // Right click → place block adjacent to hovered face
      if (placeTarget && !occupiedSet.has(cellKey(placeTarget.x, placeTarget.y, placeTarget.z))) {
        cbAdd?.(placeTarget.x, placeTarget.y, placeTarget.z);
      }
    }
  }

  function onContextMenu(e: MouseEvent) { e.preventDefault(); }

  function onWheel(e: WheelEvent) {
    if (e.shiftKey) {
      e.preventDefault();
      e.stopImmediatePropagation(); // prevent OrbitControls from zooming
      cbCycle?.(e.deltaY > 0 ? 1 : -1);
    }
  }

  container.addEventListener("mousemove", onMouseMove);
  container.addEventListener("pointerdown", onPointerDown);
  container.addEventListener("pointerup", onPointerUp);
  container.addEventListener("contextmenu", onContextMenu);
  // Capture phase on the canvas so this fires before OrbitControls' bubble-phase listener
  renderer.domElement.addEventListener("wheel", onWheel, { passive: false, capture: true });

  // ---- Resize ----
  const ro = new ResizeObserver(() => {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  });
  ro.observe(container);

  // ---- Animation loop ----
  let rafId = 0;
  function animate() {
    rafId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  // ---- Scene API ----
  function clearMeshes() {
    for (let i = meshGroup.children.length - 1; i >= 0; i--) {
      const child = meshGroup.children[i];
      meshGroup.remove(child);
      if (child instanceof THREE.InstancedMesh) child.instanceMatrix.dispose();
    }
    meshCellMap.clear();
  }

  function setCells(cells: ResolvedCell[], newEditablePaths: Set<string>) {
    editablePaths = newEditablePaths;
    cachedCells = cells;
    clearMeshes();
    occupiedSet.clear();
    ghostMesh.visible = false; hlMesh.visible = false;
    hoveredCell = null; placeTarget = null;
    if (cells.length === 0) return;

    for (const c of cells) occupiedSet.add(cellKey(c.x, c.y, c.z));

    // Group by block value → one InstancedMesh per block type
    const byValue = new Map<string, ResolvedCell[]>();
    for (const c of cells) {
      const arr = byValue.get(c.value);
      if (arr) arr.push(c); else byValue.set(c.value, [c]);
    }

    for (const [value, group] of byValue) {
      const mat = getMat(blockHexColor(value));
      const mesh = new THREE.InstancedMesh(SHARED_BOX, mat, group.length);
      mesh.castShadow = true; mesh.receiveShadow = true;
      const entries: CellEntry[] = [];
      for (let i = 0; i < group.length; i++) {
        const c = group[i];
        DUMMY.position.set(c.x + 0.5, c.y + 0.5, c.z + 0.5);
        DUMMY.updateMatrix();
        mesh.setMatrixAt(i, DUMMY.matrix);
        entries.push({ x: c.x, y: c.y, z: c.z, originPath: c.originPath });
      }
      mesh.instanceMatrix.needsUpdate = true;
      meshGroup.add(mesh);
      meshCellMap.set(mesh, entries);
    }
  }

  function centerCamera() {
    if (!cachedCells.length) return;
    const box = new THREE.Box3().setFromObject(meshGroup);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 1);
    const dist = maxDim * 1.5;
    controls.target.copy(center);
    camera.position.set(center.x + dist, center.y + dist * 0.65, center.z + dist);
    camera.lookAt(center);
    controls.update();
    grid.position.y = box.min.y - 0.01;
    sun.shadow.camera.left = sun.shadow.camera.bottom = -maxDim;
    sun.shadow.camera.right = sun.shadow.camera.top = maxDim;
    sun.shadow.camera.far = dist * 4;
    sun.shadow.camera.updateProjectionMatrix();
    // Resize symmetry planes to fit new bounding box
    updateSymPlanes(box);
  }

  // ---- Symmetry plane helpers ----
  let lastBox = new THREE.Box3();

  function updateSymPlanes(box: THREE.Box3) {
    lastBox = box.clone();
    const size = box.getSize(new THREE.Vector3());
    const pad = 2;
    // X plane (YZ): width=Z-span, height=Y-span
    symPlaneX.scale.set(size.z + pad * 2, size.y + pad * 2, 1);
    // Y plane (XZ): width=X-span, height=Z-span
    symPlaneY.scale.set(size.x + pad * 2, size.z + pad * 2, 1);
    // Z plane (XY): width=X-span, height=Y-span
    symPlaneZ.scale.set(size.x + pad * 2, size.y + pad * 2, 1);
    const ctr = box.getCenter(new THREE.Vector3());
    // Position each plane at its current saved pos (will be overwritten by setSymmetry)
    symPlaneX.position.set(symPlaneX.position.x, ctr.y, ctr.z);
    symPlaneY.position.set(ctr.x, symPlaneY.position.y, ctr.z);
    symPlaneZ.position.set(ctr.x, ctr.y, symPlaneZ.position.z);
  }

  function setSymmetry(state: SymmetryState | null) {
    if (!state) {
      symPlaneX.visible = false;
      symPlaneY.visible = false;
      symPlaneZ.visible = false;
      return;
    }
    const box = lastBox.isEmpty() ? new THREE.Box3().setFromObject(meshGroup) : lastBox;
    const size = box.getSize(new THREE.Vector3());
    const pad = 2;
    const ctr = box.getCenter(new THREE.Vector3());

    function updatePlane(
      plane: THREE.Mesh,
      axisPlane: SymmetryState["x"],
      axisPos: number,
      wSize: number, hSize: number,
    ) {
      plane.visible = axisPlane.enabled;
      if (axisPlane.enabled) {
        // w/h dimensions
        plane.scale.set(wSize + pad * 2, hSize + pad * 2, 1);
      }
      // Array planes: show multiple transparent slabs
      // (handled via plane.visible; position always set)
      return axisPos;
    }

    // X plane: position.x = plane.pos, center on Y/Z
    const xEnabled = state.x.enabled;
    symPlaneX.visible = xEnabled;
    if (xEnabled) {
      symPlaneX.scale.set(size.z + pad * 2, size.y + pad * 2, 1);
      symPlaneX.position.set(state.x.pos, ctr.y, ctr.z);
    }

    // Y plane: position.y = plane.pos, center on X/Z
    const yEnabled = state.y.enabled;
    symPlaneY.visible = yEnabled;
    if (yEnabled) {
      symPlaneY.scale.set(size.x + pad * 2, size.z + pad * 2, 1);
      symPlaneY.position.set(ctr.x, state.y.pos, ctr.z);
    }

    // Z plane: position.z = plane.pos, center on X/Y
    const zEnabled = state.z.enabled;
    symPlaneZ.visible = zEnabled;
    if (zEnabled) {
      symPlaneZ.scale.set(size.x + pad * 2, size.y + pad * 2, 1);
      symPlaneZ.position.set(ctr.x, ctr.y, state.z.pos);
    }

    void updatePlane; // suppress unused warning
  }

  function dispose() {
    cancelAnimationFrame(rafId);
    ro.disconnect();
    container.removeEventListener("mousemove", onMouseMove);
    container.removeEventListener("pointerdown", onPointerDown);
    container.removeEventListener("pointerup", onPointerUp);
    container.removeEventListener("contextmenu", onContextMenu);
    renderer.domElement.removeEventListener("wheel", onWheel, { capture: true });
    document.removeEventListener("keydown", onDocKeyDown);
    clearMeshes();
    ghostMat.dispose();
    for (const m of matCache.values()) m.dispose();
    controls.dispose();
    renderer.dispose();
    container.removeChild(renderer.domElement);
  }

  return {
    setCells,
    centerCamera,
    setPlaceColor: (hex: number) => { ghostMat.color.setHex(hex); },
    setCallbacks: (onAdd, onRemove, onCycle) => { cbAdd = onAdd; cbRemove = onRemove; cbCycle = onCycle; },
    setSymmetry,
    dispose,
  };
}
