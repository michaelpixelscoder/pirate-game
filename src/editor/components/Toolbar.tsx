import { useState } from "react";
import { BLOCK_PALETTE, blockCssColor } from "../blockColors";
import type { SymmetryState } from "../symmetryTypes";
import { SymmetryPanel } from "./SymmetryPanel";

export { BLOCK_PALETTE };

interface ToolbarProps {
  activePlaceBlock: string;
  onPrevBlock: () => void;
  onNextBlock: () => void;
  /** Set when an entity is selected in a world asset */
  selectedEntity?: string | null;
  /** Whether the selected entity (or library asset) has own editable cells */
  canEditVoxels: boolean;
  onTranslate?: (dx: number, dy: number, dz: number) => void;
  /** true = 90° CW, false = 90° CCW around Y axis */
  onRotateY?: (clockwise: boolean) => void;
  symmetry?: SymmetryState;
  onSymmetryChange?: (next: SymmetryState) => void;
  onSymmetryAutoCenter?: (axis: "x" | "y" | "z") => void;
}

export function Toolbar({
  activePlaceBlock,
  onPrevBlock,
  onNextBlock,
  selectedEntity,
  canEditVoxels,
  onTranslate,
  onRotateY,
  symmetry,
  onSymmetryChange,
  onSymmetryAutoCenter,
}: ToolbarProps) {
  const color = blockCssColor(activePlaceBlock);
  const label = activePlaceBlock.replace(/_block$/, "");
  const [showSym, setShowSym] = useState(false);

  const anySymEnabled = symmetry
    ? symmetry.x.enabled || symmetry.y.enabled || symmetry.z.enabled
    : false;

  return (
    <div className="toolbar-wrapper">
      {/* ---- Symmetry panel (floats above toolbar when open) ---- */}
      {showSym && symmetry && onSymmetryChange && onSymmetryAutoCenter && (
        <SymmetryPanel
          symmetry={symmetry}
          onChange={onSymmetryChange}
          onAutoCenter={onSymmetryAutoCenter}
        />
      )}

      <div className="editor-toolbar">
        {/* ---- Block selector (for RMB placement) ---- */}
        {canEditVoxels && (
          <div className="toolbar-section">
            <span className="toolbar-label">Place</span>
            <button className="toolbar-btn icon-btn" onClick={onPrevBlock} title="Previous block (Shift+↑)">
              ‹
            </button>
            <div className="toolbar-block-chip">
              <span
                className="color-swatch"
                style={{ background: color, width: 12, height: 12, flexShrink: 0 }}
              />
              <span className="toolbar-block-name">{label}</span>
            </div>
            <button className="toolbar-btn icon-btn" onClick={onNextBlock} title="Next block (Shift+↓)">
              ›
            </button>
          </div>
        )}

        {canEditVoxels && (
          <div className="toolbar-hint">
            <span className="toolbar-hint-item">RMB place</span>
            <span className="toolbar-hint-sep">·</span>
            <span className="toolbar-hint-item">LMB erase</span>
            <span className="toolbar-hint-sep">·</span>
            <span className="toolbar-hint-item">Shift+scroll cycle</span>
          </div>
        )}

        {/* ---- Symmetry toggle ---- */}
        {canEditVoxels && (
          <>
            <div className="toolbar-divider" />
            <div className="toolbar-section">
              <button
                className={`toolbar-btn ${showSym ? "sym-toggle--on" : ""} ${anySymEnabled ? "sym-active" : ""}`}
                title="Toggle symmetry / array tools"
                onClick={() => setShowSym((v) => !v)}
              >
                ◈ Sym{anySymEnabled ? " ●" : ""}
              </button>
            </div>
          </>
        )}

        {/* ---- Entity transform (world entities only) ---- */}
        {selectedEntity && (
          <>
            <div className="toolbar-divider" />

            <div className="toolbar-section">
              <span className="toolbar-label">Move</span>
              <div className="toolbar-btn-group">
                <button className="toolbar-btn" onClick={() => onTranslate?.(-1, 0, 0)} title="-X (←)">−X</button>
                <button className="toolbar-btn" onClick={() => onTranslate?.(1, 0, 0)}  title="+X (→)">+X</button>
                <button className="toolbar-btn" onClick={() => onTranslate?.(0, 0, -1)} title="-Z (↑)">−Z</button>
                <button className="toolbar-btn" onClick={() => onTranslate?.(0, 0, 1)}  title="+Z (↓)">+Z</button>
                <button className="toolbar-btn" onClick={() => onTranslate?.(0, 1, 0)}  title="+Y">↑Y</button>
                <button className="toolbar-btn" onClick={() => onTranslate?.(0, -1, 0)} title="-Y">↓Y</button>
              </div>
            </div>

            <div className="toolbar-divider" />

            <div className="toolbar-section">
              <span className="toolbar-label">Rotate</span>
              <div className="toolbar-btn-group">
                <button className="toolbar-btn" onClick={() => onRotateY?.(false)} title="Rotate 90° CCW">↺ 90°</button>
                <button className="toolbar-btn" onClick={() => onRotateY?.(true)}  title="Rotate 90° CW">↻ 90°</button>
              </div>
            </div>
          </>
        )}

        <div style={{ flex: 1 }} />

        {/* ---- Status ---- */}
        {!canEditVoxels && !selectedEntity && (
          <span className="toolbar-hint">
            <span className="toolbar-hint-item" style={{ opacity: 0.5 }}>
              Select an entity or library asset to edit
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
