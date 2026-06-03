import { useState, useEffect, useMemo, useCallback } from "react";
import { Outliner } from "./components/Outliner";
import { Viewport } from "./components/Viewport";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { Toolbar, BLOCK_PALETTE } from "./components/Toolbar";
import { fetchManifest, loadAsset, resolveAsset, setEditedAsset, hasEditedAsset, getEditedAssets } from "./assetLoader";
import { defaultSymmetryState, generateSymmetricPositions } from "./symmetryTypes";
import type { SymmetryState } from "./symmetryTypes";
import { downloadJson, downloadZip } from "./exportUtils";
import { saveLevel, loadSavedLevel, listSavedLevels } from "../storage";
import type { AssetFile, AssetManifestEntry, ResolvedAsset, ResolvedCell, WorldAsset } from "./types";

export function App() {
  const [manifest, setManifest] = useState<AssetManifestEntry[] | null>(null);
  const [manifestError, setManifestError] = useState<string | null>(null);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);

  const [loadedAsset, setLoadedAsset] = useState<ResolvedAsset | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // In-memory edits to the raw asset file (null = no edits, use original)
  const [editedRaw, setEditedRaw] = useState<AssetFile | null>(null);

  // Active block for voxel placement
  const [activePlaceBlock, setActivePlaceBlock] = useState<typeof BLOCK_PALETTE[number]>(BLOCK_PALETTE[5]); // wood_plank_block

  // Symmetry state
  const [symmetry, setSymmetry] = useState<SymmetryState>(defaultSymmetryState);

  // localStorage save tracking
  const [savedLevelId, setSavedLevelId] = useState<string | null>(null);
  const [saveFlash, setSaveFlash] = useState(false);

  // ---- Load manifest once ----
  useEffect(() => {
    fetchManifest()
      .then((m) => setManifest(m.assets))
      .catch((e) => setManifestError(String(e)));
  }, []);

  // ---- URL param: ?asset=<path> to pre-select an asset ----
  useEffect(() => {
    if (!manifest) return;
    const params = new URLSearchParams(window.location.search);
    const assetParam = params.get("asset");
    const localParam = params.get("localLevel");

    if (localParam) {
      const bundle = loadSavedLevel(localParam);
      if (bundle) {
        // Inject bundled library assets into the edit cache so the editor
        // resolves them locally instead of fetching from the public server.
        for (const [path, asset] of Object.entries(bundle.assets)) {
          setEditedAsset(path, asset);
        }
        const fakePath = `local:${localParam}`;
        setEditedAsset(fakePath, bundle.world);
        setSelectedPath(fakePath);
        setSavedLevelId(localParam);
      }
    } else if (assetParam && manifest.some((m) => m.path === assetParam)) {
      setSelectedPath(assetParam);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest]);

  // ---- Load original asset when path changes ----
  useEffect(() => {
    setSelectedEntity(null);
    if (!selectedPath) { setEditedRaw(null); setLoadedAsset(null); return; }
    setLoading(true);
    setLoadError(null);
    // loadAsset checks _editCache first, so previously edited assets load their edited version
    loadAsset(selectedPath)
      .then((asset) => {
        setLoadedAsset(asset);
        setLoading(false);
        // Restore editedRaw badge if this asset was previously edited in this session
        if (hasEditedAsset(selectedPath)) {
          setEditedRaw(asset.raw);
        } else {
          setEditedRaw(null);
        }
      })
      .catch((e) => { setLoadError(String(e)); setLoading(false); });
  }, [selectedPath]);

  // ---- Re-resolve when in-memory edits change ----
  useEffect(() => {
    if (!editedRaw || !selectedPath) return;
    let cancelled = false;
    // Persist to shared edit cache so other assets that reference this one see the edit
    setEditedAsset(selectedPath, editedRaw);
    resolveAsset(editedRaw, selectedPath)
      .then((asset) => { if (!cancelled) setLoadedAsset(asset); })
      .catch((e) => { if (!cancelled) setLoadError(String(e)); });
    return () => { cancelled = true; };
  }, [editedRaw, selectedPath]);

  // ---- Derived: cells shown in viewport ----
  const viewportCells = useMemo((): ResolvedCell[] => {
    if (!loadedAsset) return [];
    if (selectedEntity) return loadedAsset.entityCells.get(selectedEntity) ?? [];
    return loadedAsset.allCells;
  }, [loadedAsset, selectedEntity]);

  // ---- Derived: which originPaths can be erased ----
  const editableOriginPaths = useMemo(() => {
    if (!selectedPath) return new Set<string>();
    if (loadedAsset?.raw.kind === "library") return new Set([selectedPath]);
    if (selectedEntity) return new Set([selectedPath]); // only entity own cells
    return new Set<string>(); // no editing without entity selection in world
  }, [selectedPath, loadedAsset?.raw.kind, selectedEntity]);

  // ---- Derived: whether the current context has editable voxels ----
  const canEditVoxels = editableOriginPaths.size > 0;

  // ---- Helpers ----
  function currentRaw(): AssetFile | null {
    return editedRaw ?? loadedAsset?.raw ?? null;
  }

  // ---- Voxel add / remove ----
  const handleAddVoxel = useCallback((x: number, y: number, z: number) => {
    const raw = currentRaw();
    if (!raw || !selectedPath) return;
    const value = activePlaceBlock;

    // Generate all symmetry copies (includes the original position)
    const positions = generateSymmetricPositions(x, y, z, symmetry);

    if (raw.kind === "library") {
      const cells = [...(raw.cells ?? [])];
      for (const [px, py, pz] of positions) {
        if (!cells.some((c) => c.x === px && c.y === py && c.z === pz))
          cells.push({ x: px, y: py, z: pz, value });
      }
      setEditedRaw({ ...raw, cells });
    } else if (raw.kind === "world" && selectedEntity) {
      const entity = raw.entities[selectedEntity];
      const cells = [...(entity.cells ?? [])];
      for (const [px, py, pz] of positions) {
        if (!cells.some((c) => c.x === px && c.y === py && c.z === pz))
          cells.push({ x: px, y: py, z: pz, value });
      }
      setEditedRaw({
        ...raw,
        entities: {
          ...raw.entities,
          [selectedEntity]: { ...entity, cells },
        },
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editedRaw, loadedAsset, selectedPath, selectedEntity, activePlaceBlock, symmetry]);

  const handleRemoveVoxel = useCallback((x: number, y: number, z: number) => {
    const raw = currentRaw();
    if (!raw || !selectedPath) return;

    if (raw.kind === "library") {
      setEditedRaw({ ...raw, cells: (raw.cells ?? []).filter((c) => !(c.x === x && c.y === y && c.z === z)) });
    } else if (raw.kind === "world" && selectedEntity) {
      const entity = raw.entities[selectedEntity];
      setEditedRaw({
        ...raw,
        entities: {
          ...raw.entities,
          [selectedEntity]: {
            ...entity,
            cells: (entity.cells ?? []).filter((c) => !(c.x === x && c.y === y && c.z === z)),
          },
        },
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editedRaw, loadedAsset, selectedPath, selectedEntity]);

  const handleCycleBlock = useCallback((delta: number) => {
    setActivePlaceBlock((cur) => {
      const idx = BLOCK_PALETTE.indexOf(cur as typeof BLOCK_PALETTE[number]);
      const next = (idx + delta + BLOCK_PALETTE.length) % BLOCK_PALETTE.length;
      return BLOCK_PALETTE[next];
    });
  }, []);

  // ---- Symmetry: auto-center a plane on the bounding box ----
  const handleSymmetryAutoCenter = useCallback((axis: "x" | "y" | "z") => {
    if (!viewportCells.length) return;
    const vals = viewportCells.map((c) => c[axis]);
    const center = (Math.min(...vals) + Math.max(...vals) + 1) / 2;
    setSymmetry((prev) => ({ ...prev, [axis]: { ...prev[axis], pos: center } }));
  }, [viewportCells]);

  // ---- Save to localStorage ----
  const triggerSaveFlash = useCallback(() => {
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 2000);
  }, []);

  /** Collect all edited library assets to bundle alongside the world when saving. */
  const collectLibAssets = useCallback((): Record<string, AssetFile> => {
    const result: Record<string, AssetFile> = {};
    for (const [path, asset] of getEditedAssets()) {
      if (!path.startsWith("local:") && asset.kind === "library") {
        result[path] = asset;
      }
    }
    return result;
  }, []);

  const handleSaveAs = useCallback(() => {
    const raw = editedRaw ?? loadedAsset?.raw;
    if (!raw || raw.kind !== "world") return;
    const defaultName = (raw as WorldAsset).name ?? "My Level";
    const name = window.prompt("Save level as:", defaultName);
    if (!name) return;
    const id = `level_${Date.now()}`;
    saveLevel(id, name.trim(), raw, collectLibAssets());
    setSavedLevelId(id);
    triggerSaveFlash();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editedRaw, loadedAsset, triggerSaveFlash, collectLibAssets]);

  const handleSave = useCallback(() => {
    const raw = editedRaw ?? loadedAsset?.raw;
    if (!raw || raw.kind !== "world") return;
    if (savedLevelId) {
      const existing = listSavedLevels().find((l) => l.id === savedLevelId);
      const name = existing?.name ?? (raw as WorldAsset).name ?? "My Level";
      saveLevel(savedLevelId, name, raw, collectLibAssets());
      triggerSaveFlash();
    } else {
      handleSaveAs();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editedRaw, loadedAsset, savedLevelId, handleSaveAs, triggerSaveFlash, collectLibAssets]);

  // ---- Ctrl+S shortcut ----
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSave]);

  // ---- Export ----
  const handleExportCurrent = useCallback(() => {
    const raw = editedRaw ?? loadedAsset?.raw;
    if (!raw || !selectedPath) return;
    const filename = selectedPath.split("/").pop() ?? "asset.json";
    downloadJson(filename, raw);
  }, [editedRaw, loadedAsset, selectedPath]);

  const handleExportAll = useCallback(async () => {
    const edited = getEditedAssets();
    if (!edited.size) return;
    const files = Array.from(edited.entries()).map(([path, data]) => ({ path, data }));
    await downloadZip(files);
  }, []);

  // ---- Play ----
  const handlePlay = useCallback(() => {
    const raw = editedRaw ?? loadedAsset?.raw;
    if (!raw) return;
    if (raw.kind === "world") {
      // Reuse existing saved id, or derive one from path, or generate a new one
      let id = savedLevelId;
      if (!id) {
        id = selectedPath
          ? selectedPath.replace(/[^a-z0-9]/gi, "_").replace(/^_+|_+$/g, "")
          : `level_${Date.now()}`;
      }
      const existing = listSavedLevels().find((l) => l.id === id);
      const name = existing?.name ?? (raw as WorldAsset).name ?? id;
      saveLevel(id!, name, raw, collectLibAssets());
      setSavedLevelId(id);
      window.open(`../?localLevel=${encodeURIComponent(id!)}`, "_blank");
    } else {
      // Library: open game with default level
      window.open("../", "_blank");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editedRaw, loadedAsset, savedLevelId, selectedPath, collectLibAssets]);

  // ---- Entity transform ----
  const handleTranslateEntity = useCallback((dx: number, dy: number, dz: number) => {
    const raw = currentRaw();
    if (!raw || raw.kind !== "world" || !selectedEntity) return;
    const entity = (raw as WorldAsset).entities[selectedEntity];
    setEditedRaw({
      ...raw,
      entities: {
        ...(raw as WorldAsset).entities,
        [selectedEntity]: {
          ...entity,
          cells: (entity.cells ?? []).map((c) => ({ ...c, x: c.x + dx, y: c.y + dy, z: c.z + dz })),
          _references: (entity._references ?? []).map((r) => {
            const [rx, ry, rz] = r.position ?? [0, 0, 0];
            return { ...r, position: [rx + dx, ry + dy, rz + dz] as [number, number, number] };
          }),
        },
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editedRaw, loadedAsset, selectedEntity]);

  const handleRotateEntityY = useCallback((clockwise: boolean) => {
    const raw = currentRaw();
    if (!raw || raw.kind !== "world" || !selectedEntity) return;

    // Find bounding center from resolved cells
    const entityCells = loadedAsset?.entityCells.get(selectedEntity) ?? [];
    if (!entityCells.length) return;
    const xs = entityCells.map((c) => c.x), zs = entityCells.map((c) => c.z);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cz = (Math.min(...zs) + Math.max(...zs)) / 2;

    function rotXZ(x: number, z: number): [number, number] {
      const lx = x - cx, lz = z - cz;
      // CW from above: (lx,lz) → (lz, -lx)  |  CCW: (-lz, lx)
      return clockwise
        ? [Math.round(cx + lz), Math.round(cz - lx)]
        : [Math.round(cx - lz), Math.round(cz + lx)];
    }

    // Quaternion for 90° rotation around Y: CW=[0,-0.7071,0,0.7071], CCW=[0,0.7071,0,0.7071]
    const s = clockwise ? -0.7071068 : 0.7071068;
    const yRot90: [number, number, number, number] = [0, s, 0, 0.7071068];

    function mulQuat(
      a: [number, number, number, number],
      b: [number, number, number, number],
    ): [number, number, number, number] {
      const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
      return [
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
      ];
    }

    const entity = (raw as WorldAsset).entities[selectedEntity];
    setEditedRaw({
      ...raw,
      entities: {
        ...(raw as WorldAsset).entities,
        [selectedEntity]: {
          ...entity,
          cells: (entity.cells ?? []).map((c) => {
            const [nx, nz] = rotXZ(c.x, c.z);
            return { ...c, x: nx, z: nz };
          }),
          _references: (entity._references ?? []).map((r) => {
            const [rx, ry, rz] = r.position ?? [0, 0, 0];
            const [nx, nz] = rotXZ(rx, rz);
            const newRot = mulQuat(yRot90, r.rotation ?? [0, 0, 0, 1]);
            return { ...r, position: [nx, ry, nz] as [number, number, number], rotation: newRot };
          }),
        },
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editedRaw, loadedAsset, selectedEntity]);

  // ---- Viewport metadata ----
  const viewportLabel = selectedEntity
    ? `${loadedAsset?.raw.id ?? ""} › ${selectedEntity}`
    : (loadedAsset?.raw.name ?? loadedAsset?.raw.id ?? "");

  // assetKey for camera re-center: changes when a new asset is loaded (not on edits)
  const assetKey = selectedPath ?? "";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* ---- Top bar ---- */}
      <header className="topbar">
        <span className="topbar-title">⚓ Pirate Game</span>
        <span className="topbar-subtitle">Asset Editor</span>
        <div className="topbar-spacer" />
        {loadError && <span style={{ color: "#f87171", fontSize: "12px" }}>⚠ {loadError}</span>}
        {manifestError && <span style={{ color: "#f87171", fontSize: "12px" }}>⚠ Manifest: {manifestError}</span>}
        {editedRaw && <span style={{ color: "#fbbf24", fontSize: "11px" }}>● unsaved changes</span>}
        {/* Save buttons (world assets only) */}
        {loadedAsset?.raw.kind === "world" && (
          <>
            <button className="topbar-link" onClick={handleSave} title={savedLevelId ? "Overwrite saved level" : "Save level to browser storage"}>
              {saveFlash ? "✓ Saved" : "💾 Save"}
            </button>
            <button className="topbar-link" onClick={handleSaveAs} title="Save as a new level">
              Save As…
            </button>
          </>
        )}
        {/* Export buttons */}
        {loadedAsset && (
          <button className="topbar-link" style={{ cursor: "pointer" }} onClick={handleExportCurrent} title="Download current file as JSON">
            ↓ Export
          </button>
        )}
        {getEditedAssets().size > 0 && (
          <button className="topbar-link" style={{ cursor: "pointer" }} onClick={handleExportAll} title="Download all edited files as ZIP">
            ↓ ZIP all
          </button>
        )}
        {/* Play button (only for world assets) */}
        {loadedAsset?.raw.kind === "world" && (
          <button className="topbar-link topbar-play" onClick={handlePlay} title="Save level and open in game">
            ▶ Play
          </button>
        )}
        <a className="topbar-link" href="../">← Back to game</a>
      </header>

      {/* ---- Three-panel layout ---- */}
      <div className="editor-layout" style={{ flex: 1, overflow: "hidden" }}>
        <Outliner
          manifest={manifest}
          selectedPath={selectedPath}
          onSelectAsset={setSelectedPath}
          loadedAsset={loadedAsset}
          selectedEntity={selectedEntity}
          onSelectEntity={setSelectedEntity}
        />

        <Viewport
          cells={viewportCells}
          loading={loading}
          label={viewportLabel}
          assetKey={assetKey}
          activePlaceBlock={activePlaceBlock}
          editableOriginPaths={editableOriginPaths}
          onAddVoxel={handleAddVoxel}
          onRemoveVoxel={handleRemoveVoxel}
          onCycleBlock={handleCycleBlock}
          symmetry={symmetry}
        />

        <PropertiesPanel
          asset={loadedAsset}
          selectedEntity={selectedEntity}
        />
      </div>

      {/* ---- Bottom toolbar ---- */}
      <Toolbar
        activePlaceBlock={activePlaceBlock}
        onPrevBlock={() => handleCycleBlock(-1)}
        onNextBlock={() => handleCycleBlock(1)}
        selectedEntity={selectedEntity}
        canEditVoxels={canEditVoxels}
        onTranslate={handleTranslateEntity}
        onRotateY={handleRotateEntityY}
        symmetry={symmetry}
        onSymmetryChange={setSymmetry}
        onSymmetryAutoCenter={handleSymmetryAutoCenter}
      />
    </div>
  );
}
