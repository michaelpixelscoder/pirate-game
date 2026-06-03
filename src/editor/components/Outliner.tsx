import type { AssetManifestEntry } from "../types";
import type { ResolvedAsset } from "../types";

interface OutlinerProps {
  manifest: AssetManifestEntry[] | null;
  selectedPath: string | null;
  onSelectAsset: (path: string) => void;
  loadedAsset: ResolvedAsset | null;
  selectedEntity: string | null;
  onSelectEntity: (id: string | null) => void;
}

const KIND_ICON: Record<string, string> = { world: "🌐", library: "📦" };

export function Outliner({
  manifest,
  selectedPath,
  onSelectAsset,
  loadedAsset,
  selectedEntity,
  onSelectEntity,
}: OutlinerProps) {
  const worlds = manifest?.filter((a) => a.kind === "world") ?? [];
  const libs = manifest?.filter((a) => a.kind === "library") ?? [];

  return (
    <aside className="panel outliner">
      <div className="panel-header">
        <span>📁</span>
        <span>Outliner</span>
      </div>

      {/* ---- Asset file list ---- */}
      <div className="panel-body" style={{ maxHeight: "45%", borderBottom: "1px solid var(--border)" }}>
        {manifest === null ? (
          <div className="state-loading" style={{ padding: "20px" }}>Loading…</div>
        ) : (
          <div className="asset-list">
            {worlds.length > 0 && (
              <>
                <div className="asset-list-group-label">Worlds</div>
                {worlds.map((a) => (
                  <AssetRow
                    key={a.path}
                    entry={a}
                    selected={selectedPath === a.path}
                    onSelect={() => { onSelectAsset(a.path); onSelectEntity(null); }}
                  />
                ))}
              </>
            )}
            {libs.length > 0 && (
              <>
                <div className="asset-list-group-label">Library</div>
                {libs.map((a) => (
                  <AssetRow
                    key={a.path}
                    entry={a}
                    selected={selectedPath === a.path}
                    onSelect={() => { onSelectAsset(a.path); onSelectEntity(null); }}
                  />
                ))}
              </>
            )}
            {manifest.length === 0 && (
              <div style={{ padding: "12px", color: "var(--text2)", fontSize: "12px" }}>
                No assets found.
              </div>
            )}
          </div>
        )}
      </div>

      {/* ---- Entity / structure tree ---- */}
      <div className="panel-header" style={{ fontSize: "10px" }}>
        <span>🗂</span>
        <span>Structure</span>
      </div>
      <div className="panel-body">
        {!loadedAsset ? (
          <div style={{ padding: "12px", color: "var(--text2)", fontSize: "12px" }}>
            Select an asset above.
          </div>
        ) : loadedAsset.raw.kind === "library" ? (
          <LibraryTree asset={loadedAsset} />
        ) : (
          <WorldTree
            asset={loadedAsset}
            selectedEntity={selectedEntity}
            onSelectEntity={onSelectEntity}
          />
        )}
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------

function AssetRow({
  entry,
  selected,
  onSelect,
}: {
  entry: AssetManifestEntry;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <div className={`asset-row ${selected ? "selected" : ""}`} onClick={onSelect}>
      <span className="asset-row-icon">{KIND_ICON[entry.kind] ?? "📄"}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="asset-row-name">{entry.name}</div>
        <div className="asset-row-path">{entry.path}</div>
      </div>
      <span className={`kind-badge ${entry.kind}`}>{entry.kind}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------

function LibraryTree({ asset }: { asset: ResolvedAsset }) {
  const raw = asset.raw as import("../types").LibraryAsset;
  const ownCount = raw.cells?.length ?? 0;
  const refs = raw._references ?? [];
  const total = asset.allCells.length;

  return (
    <div className="entity-tree">
      <div className="entity-row selected" style={{ cursor: "default" }}>
        <span className="entity-row-icon">◉</span>
        <span className="entity-row-name">{raw.id}</span>
        <span className="entity-row-count">{total} cells</span>
      </div>
      {ownCount > 0 && (
        <div className="entity-ref">
          <span className="entity-ref-icon">▫</span>
          <span>{ownCount} own cells</span>
        </div>
      )}
      {refs.map((ref, i) => (
        <div key={i} className="entity-ref">
          <span className="entity-ref-icon">↗</span>
          <span title={ref.path}>{shortPath(ref.path)}</span>
          {ref.position && (
            <span style={{ marginLeft: "auto", fontSize: "10px", color: "var(--text2)" }}>
              [{ref.position.join(", ")}]
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

function WorldTree({
  asset,
  selectedEntity,
  onSelectEntity,
}: {
  asset: ResolvedAsset;
  selectedEntity: string | null;
  onSelectEntity: (id: string | null) => void;
}) {
  const world = asset.raw as import("../types").WorldAsset;

  return (
    <div className="entity-tree">
      {Object.entries(world.entities).map(([id, spec]) => {
        const count = asset.entityCells.get(id)?.length ?? 0;
        const refs = spec._references ?? [];
        const isSelected = selectedEntity === id;
        return (
          <div key={id}>
            <div
              className={`entity-row ${isSelected ? "selected" : ""}`}
              onClick={() => onSelectEntity(isSelected ? null : id)}
            >
              <span className="entity-row-icon">{spec.physics === "dynamic" ? "⚓" : "🧱"}</span>
              <span className="entity-row-name">{id}</span>
              <span className="entity-row-count">{count}</span>
            </div>
            {refs.map((ref, i) => (
              <div key={i} className="entity-ref">
                <span className="entity-ref-icon">↗</span>
                <span title={ref.path}>{shortPath(ref.path)}</span>
                {ref.position && (
                  <span style={{ marginLeft: "auto", fontSize: "10px", color: "var(--text2)" }}>
                    [{ref.position.join(", ")}]
                  </span>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------

function shortPath(p: string) {
  return p.split("/").pop() ?? p;
}

// Re-export type used by parent
export type { OutlinerProps };
