import type { SymmetryState, SymPlane, SymMode } from "../symmetryTypes";

interface SymmetryPanelProps {
  symmetry: SymmetryState;
  onChange: (next: SymmetryState) => void;
  onAutoCenter: (axis: "x" | "y" | "z") => void;
}

const AXIS_COLORS: Record<"x" | "y" | "z", string> = {
  x: "#ff6666",
  y: "#66cc66",
  z: "#6699ff",
};

const AXIS_LABELS: Record<"x" | "y" | "z", string> = {
  x: "X  (left-right)",
  y: "Y  (bottom-top)",
  z: "Z  (front-back)",
};

function patchAxis(
  prev: SymmetryState,
  axis: "x" | "y" | "z",
  patch: Partial<SymPlane>,
): SymmetryState {
  return { ...prev, [axis]: { ...prev[axis], ...patch } };
}

export function SymmetryPanel({ symmetry, onChange, onAutoCenter }: SymmetryPanelProps) {
  return (
    <div className="sym-panel">
      {(["x", "y", "z"] as const).map((axis) => {
        const plane = symmetry[axis];
        const color = AXIS_COLORS[axis];
        return (
          <div key={axis} className={`sym-axis ${plane.enabled ? "sym-axis--on" : ""}`}>
            {/* Header row */}
            <div className="sym-axis-header">
              <span className="sym-axis-dot" style={{ background: color }} />
              <span className="sym-axis-label">{AXIS_LABELS[axis]}</span>

              <button
                className={`sym-toggle ${plane.enabled ? "sym-toggle--on" : ""}`}
                style={plane.enabled ? { borderColor: color, color } : {}}
                onClick={() => onChange(patchAxis(symmetry, axis, { enabled: !plane.enabled }))}
              >
                {plane.enabled ? "ON" : "OFF"}
              </button>
            </div>

            {/* Controls – only when enabled */}
            {plane.enabled && (
              <div className="sym-axis-body">
                {/* Mode toggle */}
                <div className="sym-row">
                  <span className="sym-label">Mode</span>
                  <div className="toolbar-btn-group">
                    {(["mirror", "array"] as SymMode[]).map((m) => (
                      <button
                        key={m}
                        className={`toolbar-btn ${plane.mode === m ? "sym-mode-active" : ""}`}
                        style={plane.mode === m ? { borderColor: color, color } : {}}
                        onClick={() => onChange(patchAxis(symmetry, axis, { mode: m }))}
                      >
                        {m === "mirror" ? "⊞ Mirror" : "⊠ Array"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Position */}
                <div className="sym-row">
                  <span className="sym-label">Pos</span>
                  <input
                    className="sym-input"
                    type="number"
                    step="0.5"
                    value={plane.pos}
                    onChange={(e) =>
                      onChange(patchAxis(symmetry, axis, { pos: parseFloat(e.target.value) || 0 }))
                    }
                  />
                  <button
                    className="toolbar-btn"
                    title="Auto-center on bounding box"
                    onClick={() => onAutoCenter(axis)}
                  >
                    ⊙
                  </button>
                </div>

                {/* Array options */}
                {plane.mode === "array" && (
                  <>
                    <div className="sym-row">
                      <span className="sym-label">Count</span>
                      <input
                        className="sym-input"
                        type="number"
                        min={2}
                        max={20}
                        value={plane.count}
                        onChange={(e) =>
                          onChange(
                            patchAxis(symmetry, axis, {
                              count: Math.max(2, parseInt(e.target.value) || 2),
                            }),
                          )
                        }
                      />
                    </div>
                    <div className="sym-row">
                      <span className="sym-label">Step</span>
                      <input
                        className="sym-input"
                        type="number"
                        step="1"
                        value={plane.step}
                        onChange={(e) =>
                          onChange(
                            patchAxis(symmetry, axis, {
                              step: parseInt(e.target.value) || 1,
                            }),
                          )
                        }
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
