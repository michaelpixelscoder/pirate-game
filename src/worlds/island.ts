import * as THREE from "three";
import type { StructureTemplate } from "./types";

export function createIslandTemplate(): StructureTemplate {
  const voxels: StructureTemplate["voxels"] = [];
  const add = (x: number, y: number, z: number, block: string) => voxels.push({ x, y, z, block });

  for (let x = -14; x <= 16; x++) {
    for (let z = -13; z <= 13; z++) {
      const dx = x / 14;
      const dz = z / 12;
      const distance = Math.sqrt(dx * dx + dz * dz);
      if (distance > 1.08) continue;

      const cliffFactor = THREE.MathUtils.clamp((x - 8) / 8, 0, 1);
      const baseHeight = Math.max(2, Math.floor(6 - distance * 5.2));
      const cliffDrop = Math.floor(cliffFactor * (4 + Math.max(0, 3 - Math.abs(z) * 0.22)));
      const height = Math.max(2, baseHeight - cliffDrop);

      for (let y = 0; y < height; y++) {
        const isCore = y < 2 || distance < 0.52;
        const isBorder = distance > 0.84;
        if (isBorder && y === height - 1) add(x, y, z, "sand_block");
        else if (isCore) add(x, y, z, y === 0 ? "stone_block" : "stone_block");
        else add(x, y, z, y < height - 2 ? "dirt_block" : "sand_block");
      }
    }
  }

  for (let x = 7; x <= 12; x++) {
    for (let z = -3; z <= 2; z++) {
      if (Math.abs(x - 9) + Math.abs(z + 1) < 5) {
        add(x, 4, z, "wood_plank_block");
        add(x, 5, z, "wood_plank_block");
      }
    }
  }

  for (let x = 8; x <= 12; x++) {
    for (let y = 4; y <= 7; y++) add(x, y, -2, "wood_plank_block");
  }
  for (let z = -2; z <= 1; z++) {
    add(12, 4, z, "wood_plank_block");
    add(12, 5, z, "wood_plank_block");
  }
  add(10, 5, -2, "bollard_block_north");
  add(11, 5, -2, "bollard_block_north");

  for (let x = 8; x <= 11; x++) {
    for (let z = -1; z <= 1; z++) {
      add(x, 6, z, "wood_plank_block");
    }
  }
  add(9, 7, 0, "wood_plank_block");
  add(10, 7, 0, "wood_plank_block");
  add(9, 8, 0, "wood_plank_block");
  add(10, 8, 0, "wood_plank_block");
  add(8, 7, 0, "wood_plank_side_wall_west");
  add(11, 7, 0, "wood_plank_side_wall_east");
  add(9, 7, -1, "wood_plank_side_wall_south");
  add(9, 7, 1, "wood_plank_side_wall_north");
  add(10, 7, -1, "wood_plank_side_wall_south");
  add(10, 7, 1, "wood_plank_side_wall_north");

  for (let y = 2; y <= 7; y++) add(2, y, -2, "wood_trunk_block");
  for (let x = 0; x <= 5; x++) {
    for (let y = 7; y <= 9; y++) {
      for (let z = -5; z <= -1; z++) {
        if (Math.abs(x - 2) + Math.abs(y - 8) + Math.abs(z + 2) < 6) add(x, y, z, "foliage_block");
      }
    }
  }

  return {
    name: "island",
    bodyType: "fixed",
    position: [-10, -2, -12],
    rotation: [0, 0, 0, 1],
    voxels
  };
}
