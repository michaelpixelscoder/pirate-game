// ---------------------------------------------------------------------------
// Symmetry / Array plane types shared between App and Viewport
// ---------------------------------------------------------------------------

export type SymMode = "mirror" | "array";

export interface SymPlane {
  enabled: boolean;
  /** World-space position of the plane on its axis */
  pos: number;
  mode: SymMode;
  /** Array mode: total number of copies (including original). min=2 */
  count: number;
  /** Array mode: world-unit step between copies */
  step: number;
}

export interface SymmetryState {
  x: SymPlane;
  y: SymPlane;
  z: SymPlane;
}

export function defaultSymPlane(): SymPlane {
  return { enabled: false, pos: 0, mode: "mirror", count: 3, step: 8 };
}

export function defaultSymmetryState(): SymmetryState {
  return { x: defaultSymPlane(), y: defaultSymPlane(), z: defaultSymPlane() };
}

// ---------------------------------------------------------------------------
// Mirror math
// Cell c occupies world space [c, c+1]; center at c+0.5
// Mirror across plane at world position p: mirroredCenter = 2*p - (c+0.5)
// ---------------------------------------------------------------------------
export function mirrorCoord(c: number, p: number): number {
  return Math.floor(2 * p - c - 0.5);
}

// ---------------------------------------------------------------------------
// Generate all symmetric copies of position (x, y, z) for given state
// ---------------------------------------------------------------------------
export function generateSymmetricPositions(
  x: number,
  y: number,
  z: number,
  sym: SymmetryState,
): Array<[number, number, number]> {
  let positions: Array<[number, number, number]> = [[x, y, z]];

  const axes: Array<["x" | "y" | "z", 0 | 1 | 2]> = [
    ["x", 0],
    ["y", 1],
    ["z", 2],
  ];

  for (const [axis, axisIdx] of axes) {
    const plane = sym[axis];
    if (!plane.enabled) continue;

    const extras: Array<[number, number, number]> = [];

    for (const pos of positions) {
      if (plane.mode === "mirror") {
        const c = pos[axisIdx];
        const mc = mirrorCoord(c, plane.pos);
        if (mc !== c) {
          const mirrored = [...pos] as [number, number, number];
          mirrored[axisIdx] = mc;
          extras.push(mirrored);
        }
      } else {
        // array mode
        for (let i = 1; i < plane.count; i++) {
          const copy = [...pos] as [number, number, number];
          copy[axisIdx] = pos[axisIdx] + plane.step * i;
          extras.push(copy);
        }
      }
    }

    positions = [...positions, ...extras];
  }

  return positions;
}
