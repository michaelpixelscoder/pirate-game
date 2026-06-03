import type { ResolvedAsset } from "../types";
import type { LibraryAsset, WorldAsset, EntitySpec } from "../types";
import { blockCssColor } from "../blockColors";

interface PropertiesPanelProps {
  asset: ResolvedAsset | null;
  selectedEntity: string | null;
}

export function PropertiesPanel({ asset, selectedEntity }: PropertiesPanelProps) {
  return (
    <aside className="panel properties">
      <div className="panel-header">
        <span>⚙</span>
        <span>Properties</span>
      </div>
      <div className="panel-body">
        {!asset ? (
          <div style={{ padding: "12px", color: "var(--text2)", fontSize: "12px" }}>
            No asset loaded.
          </div>
        ) : selectedEntity && asset.raw.kind === "world" ? (
          <EntityProperties
            entityId={selectedEntity}
            spec={(asset.raw as WorldAsset).entities[selectedEntity]}
            cells={asset.entityCells.get(selectedEntity) ?? []}
          />
        ) : (
          <AssetProperties asset={asset} />
        )}
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------

function AssetProperties({ asset }: { asset: ResolvedAsset }) {
  const raw = asset.raw;

  const physics =
    raw.kind === "library" ? (raw as LibraryAsset).physics ?? "static" : "—";

  return (
    <>
      <div className="prop-section">
        <div className="prop-section-label">Asset</div>
        <div className="prop-row">
          <span className="prop-key">id</span>
          <span className="prop-val accent">{raw.id}</span>
        </div>
        {raw.name && (
          <div className="prop-row">
            <span className="prop-key">name</span>
            <span className="prop-val">{raw.name}</span>
          </div>
        )}
        <div className="prop-row">
          <span className="prop-key">kind</span>
          <span className="prop-val">{raw.kind}</span>
        </div>
        {raw.kind === "library" && (
          <div className="prop-row">
            <span className="prop-key">physics</span>
            <span className="prop-val">{physics}</span>
          </div>
        )}
      </div>

      <div className="prop-section">
        <div className="prop-section-label">Stats</div>
        <div className="prop-stat">
          <span className="prop-stat-label">Total cells</span>
          <span className="prop-stat-value">{asset.allCells.length.toLocaleString()}</span>
        </div>
        {raw.kind === "world" && (
          <div className="prop-stat">
            <span className="prop-stat-label">Entities</span>
            <span className="prop-stat-value">
              {Object.keys((raw as WorldAsset).entities).length}
            </span>
          </div>
        )}
        {raw.kind === "library" && (raw as LibraryAsset)._references && (
          <div className="prop-stat">
            <span className="prop-stat-label">References</span>
            <span className="prop-stat-value">
              {(raw as LibraryAsset)._references!.length}
            </span>
          </div>
        )}
      </div>

      <BlockBreakdown cells={asset.allCells} />
    </>
  );
}

// ---------------------------------------------------------------------------

function EntityProperties({
  entityId,
  spec,
  cells,
}: {
  entityId: string;
  spec: EntitySpec;
  cells: import("../types").ResolvedCell[];
}) {
  return (
    <>
      <div className="prop-section">
        <div className="prop-section-label">Entity</div>
        <div className="prop-row">
          <span className="prop-key">id</span>
          <span className="prop-val accent">{entityId}</span>
        </div>
        {spec.name && (
          <div className="prop-row">
            <span className="prop-key">name</span>
            <span className="prop-val">{spec.name}</span>
          </div>
        )}
        <div className="prop-row">
          <span className="prop-key">physics</span>
          <span className="prop-val">{spec.physics ?? "static"}</span>
        </div>
        {spec.transform?.position && (
          <div className="prop-row">
            <span className="prop-key">position</span>
            <span className="prop-val">[{spec.transform.position.join(", ")}]</span>
          </div>
        )}
      </div>

      <div className="prop-section">
        <div className="prop-section-label">Stats</div>
        <div className="prop-stat">
          <span className="prop-stat-label">Total cells</span>
          <span className="prop-stat-value">{cells.length.toLocaleString()}</span>
        </div>
        <div className="prop-stat">
          <span className="prop-stat-label">Own cells</span>
          <span className="prop-stat-value">{(spec.cells?.length ?? 0).toLocaleString()}</span>
        </div>
        {spec._references && (
          <div className="prop-stat">
            <span className="prop-stat-label">References</span>
            <span className="prop-stat-value">{spec._references.length}</span>
          </div>
        )}
      </div>

      {spec._references && spec._references.length > 0 && (
        <div className="prop-section">
          <div className="prop-section-label">References</div>
          {spec._references.map((ref, i) => (
            <div key={i} style={{ marginBottom: 6 }}>
              <div className="prop-row">
                <span className="prop-key">path</span>
                <span className="prop-val" style={{ fontSize: 10 }}>{ref.path}</span>
              </div>
              {ref.position && (
                <div className="prop-row">
                  <span className="prop-key">pos</span>
                  <span className="prop-val">[{ref.position.join(", ")}]</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <BlockBreakdown cells={cells} />
    </>
  );
}

// ---------------------------------------------------------------------------

function BlockBreakdown({ cells }: { cells: import("../types").ResolvedCell[] }) {
  const counts = new Map<string, number>();
  for (const c of cells) counts.set(c.value, (counts.get(c.value) ?? 0) + 1);
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);

  if (sorted.length === 0) return null;

  return (
    <div className="prop-section">
      <div className="prop-section-label">Block types ({sorted.length})</div>
      {sorted.map(([id, count]) => (
        <div key={id} className="prop-stat">
          <span className="prop-stat-label" style={{ display: "flex", alignItems: "center" }}>
            <span
              className="color-swatch"
              style={{ background: blockCssColor(id) }}
            />
            {id}
          </span>
          <span className="prop-stat-value">{count}</span>
        </div>
      ))}
    </div>
  );
}
