import * as THREE from "three";
import type { StructureTemplate } from "./types";

// Island world position offset. Floor at world Y = ISLAND_Y_OFFSET (= -2).
const ISLAND_Y_OFFSET = -2;

function noise2(x: number, z: number): number {
  // Simple deterministic pseudo-noise using sin
  return (Math.sin(x * 1.3 + z * 0.7) * 0.5 +
          Math.sin(x * 0.5 - z * 1.1) * 0.35 +
          Math.sin(x * 2.1 + z * 1.9) * 0.15);
}

export function createIslandTemplate(): StructureTemplate {
  const voxels: StructureTemplate["voxels"] = [];
  const add = (x: number, y: number, z: number, block: string) => voxels.push({ x, y, z, block });

  // ----- Ocean floor at local Y=2 (world Y = ISLAND_Y_OFFSET + 2 = 0) -----
  for (let x = -60; x <= 60; x++) {
    for (let z = -60; z <= 60; z++) {
      add(x, 0, z, "stone_block");
      add(x, 1, z, "sand_block");
    }
  }

  // ----- Island shape -----
  // Ellipse semi-axes: 38 along X, 32 along Z
  const RX = 38;
  const RZ = 32;
  // Max land height above local Y=2 (ocean floor surface)
  const LAND_BASE = 2; // local y where land starts

  for (let x = -RX - 2; x <= RX + 2; x++) {
    for (let z = -RZ - 2; z <= RZ + 2; z++) {
      const nx = x / RX;
      const nz = z / RZ;
      const dist = Math.sqrt(nx * nx + nz * nz);
      if (dist > 1.12) continue;

      // Noise-driven height variation
      const n = noise2(x * 0.18, z * 0.18);
      const n2 = noise2(x * 0.06, z * 0.06) * 0.5;

      // Island profile: tall center, tapering edges
      const profile = Math.max(0, 1 - dist * 0.92);
      const rawHeight = profile * profile * 18 + n * 2.5 + n2 * 3;
      const height = Math.max(0, Math.floor(rawHeight));

      if (height <= 0) continue;

      // Cliffside: steeper on +X edge (eastern cliff)
      const eastCliff = THREE.MathUtils.clamp((x - RX * 0.55) / (RX * 0.35), 0, 1);
      const cliffDrop = Math.floor(eastCliff * 8);
      const finalHeight = Math.max(1, LAND_BASE + height - cliffDrop);

      for (let y = LAND_BASE; y < finalHeight; y++) {
        const isTop = y === finalHeight - 1;
        const isSubTop = y === finalHeight - 2;
        const isBeach = dist > 0.82;
        const isCore = y < LAND_BASE + 3 || dist < 0.4;

        let block: string;
        if (isTop) {
          block = isBeach ? "sand_block" : "grass_block";
        } else if (isSubTop && !isBeach) {
          block = "dirt_block";
        } else if (isCore) {
          block = "stone_block";
        } else {
          block = "dirt_block";
        }
        add(x, y, z, block);
      }
    }
  }

  // ----- Rocky outcrops -----
  const outcrops = [
    { cx: 20, cz: 18, r: 5, extra: 4 },
    { cx: -22, cz: -14, r: 4, extra: 3 },
    { cx: 5, cz: -26, r: 3, extra: 2 },
    { cx: -15, cz: 20, r: 3, extra: 2 },
  ];
  for (const { cx, cz, r, extra } of outcrops) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const dist2 = Math.sqrt((dx / r) ** 2 + (dz / r) ** 2);
        if (dist2 > 1) continue;
        const nx = (cx + dx) / RX;
        const nz = (cz + dz) / RZ;
        if (Math.sqrt(nx * nx + nz * nz) > 1.08) continue;
        const top = LAND_BASE + Math.max(0, Math.floor((1 - dist2) * extra));
        for (let y = LAND_BASE; y <= top; y++) {
          add(cx + dx, y, cz + dz, "stone_block");
        }
      }
    }
  }

  // ----- Trees -----
  const trees: [number, number][] = [
    [2, -4], [-6, 8], [10, 12], [-12, -6], [6, -16], [-18, 4], [14, -8], [-4, 16], [0, 0], [-8, -18],
    [18, 6], [-14, 14], [4, 20], [-20, -2], [8, -20],
  ];
  for (const [tx, tz] of trees) {
    const nx = tx / RX; const nz = tz / RZ;
    if (Math.sqrt(nx * nx + nz * nz) > 0.88) continue;
    // Find surface Y
    const n = noise2(tx * 0.18, tz * 0.18) + noise2(tx * 0.06, tz * 0.06) * 0.5;
    const profile = Math.max(0, 1 - Math.sqrt(nx * nx + nz * nz) * 0.92);
    const trunkBase = LAND_BASE + Math.max(1, Math.floor(profile * profile * 18 + n * 2.5));
    const trunkH = 4 + Math.floor(Math.abs(noise2(tx, tz)) * 3);
    for (let y = trunkBase; y < trunkBase + trunkH; y++) add(tx, y, tz, "wood_trunk_block");
    // Foliage
    for (let dx = -3; dx <= 3; dx++) {
      for (let dz = -3; dz <= 3; dz++) {
        for (let dy = -1; dy <= 2; dy++) {
          if (Math.abs(dx) + Math.abs(dz) + Math.abs(dy) < 5) {
            add(tx + dx, trunkBase + trunkH + dy, tz + dz, "foliage_block");
          }
        }
      }
    }
  }

  // ----- Dock on +X coast -----
  const dockX = 30;
  const dockBaseY = LAND_BASE + 2;
  for (let dx = 0; dx <= 8; dx++) {
    for (let dz = -3; dz <= 3; dz++) {
      add(dockX + dx, dockBaseY, dz, "wood_plank_block");
    }
  }
  // Dock supports
  for (let dx = 0; dx <= 8; dx += 4) {
    for (let dz = -3; dz <= 3; dz += 3) {
      for (let dy = -3; dy < 0; dy++) add(dockX + dx, dockBaseY + dy, dz, "wood_trunk_block");
    }
  }
  // Railings
  for (let dx = 0; dx <= 8; dx++) {
    add(dockX + dx, dockBaseY + 1, -3, "wood_plank_side_wall_south");
    add(dockX + dx, dockBaseY + 1, 3, "wood_plank_side_wall_north");
  }
  // Bollards at end
  add(dockX + 8, dockBaseY + 1, -2, "bollard_block_north");
  add(dockX + 8, dockBaseY + 1, 2, "bollard_block_north");

  // ----- Small hut on the island -----
  const hutX = -8; const hutZ = 6; const hutY = LAND_BASE + 10;
  for (let dx = 0; dx <= 5; dx++) {
    for (let dz = 0; dz <= 4; dz++) {
      // Floor
      add(hutX + dx, hutY, hutZ + dz, "wood_plank_block");
      // Walls
      if (dx === 0 || dx === 5 || dz === 0 || dz === 4) {
        for (let dy = 1; dy <= 3; dy++) add(hutX + dx, hutY + dy, hutZ + dz, "wood_plank_block");
      }
      // Roof
      add(hutX + dx, hutY + 4, hutZ + dz, "wood_plank_block");
    }
  }

  return {
    name: "island",
    bodyType: "fixed",
    position: [0, ISLAND_Y_OFFSET, 0],
    rotation: [0, 0, 0, 1],
    voxels
  };
}

