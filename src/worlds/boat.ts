import type { StructureTemplate } from "./types";

function addHullSideWall(
  add: (x: number, y: number, z: number, block: string) => void,
  x: number,
  y: number,
  z: number
) {
  add(x, y, z, x < 0 ? "wood_plank_side_wall_west" : "wood_plank_side_wall_east");
}

export function createPirateShipTemplate(): StructureTemplate {
  const voxels: StructureTemplate["voxels"] = [];
  const add = (x: number, y: number, z: number, block: string) => voxels.push({ x, y, z, block });

  // Main hull: long tapered body with deep underbody for strong buoyancy.
  for (let x = -7; x <= 7; x++) {
    for (let z = -16; z <= 16; z++) {
      const beam = Math.max(2, 5 - Math.floor(Math.abs(z) / 4));
      if (Math.abs(x) <= beam) add(x, 0, z, "wood_plank_block");
      if (Math.abs(x) === beam) addHullSideWall(add, x, 1, z);

      if (Math.abs(x) <= beam - 1) add(x, -1, z, "wood_plank_block");
      if (Math.abs(x) <= beam - 2 && Math.abs(z) <= 14) add(x, -2, z, "wood_plank_block");
      if (Math.abs(x) <= beam - 3 && Math.abs(z) <= 10) add(x, -3, z, "wood_plank_block");
    }
  }

  // Raised deck rails.
  for (let z = -15; z <= 15; z++) {
    add(-6, 2, z, "wood_plank_side_wall_west");
    add(6, 2, z, "wood_plank_side_wall_east");
  }

  // Central mast and broad sail.
  for (let y = 1; y <= 6; y++) add(0, y, -2, "wood_trunk_block");
  for (let x = -3; x <= 3; x++) {
    add(x, 6, -2, "sail_block_north");
    add(x, 5, -2, "sail_block_north");
    if (Math.abs(x) <= 2) add(x, 4, -2, "sail_block_north");
  }

  // Stern captain cabin.
  for (let x = -3; x <= 3; x++) {
    for (let z = 8; z <= 14; z++) {
      add(x, 3, z, "wood_plank_block");
      if (x === -3 || x === 3 || z === 8 || z === 14) add(x, 4, z, "wood_plank_block");
    }
  }
  for (let x = -2; x <= 2; x++) {
    for (let z = 9; z <= 13; z++) {
      add(x, 5, z, "wood_plank_block");
    }
  }

  // Long keel for directional stability.
  for (let z = -14; z <= 14; z++) add(0, -3, z, "keel_block_north");

  add(0, 1, -14, "wood_plank_stairs_north");
  add(0, 1, 14, "wood_plank_stairs_south");
  add(0, 1, 16, "rudder_block_south");
  add(0, 2, 16, "wood_plank_center_wall");
  add(-4, 1, 12, "bollard_block_north");
  add(4, 1, 12, "bollard_block_north");
  add(-5, 1, 9, "bollard_block_north");
  add(5, 1, 9, "bollard_block_north");

  return {
    name: "ship",
    bodyType: "dynamic",
    position: [-16, 1.35, 40],
    rotation: [0, 0, 0, 1],
    voxels
  };
}

export function createCatamaranTemplate(): StructureTemplate {
  const voxels: StructureTemplate["voxels"] = [];
  const add = (x: number, y: number, z: number, block: string) => voxels.push({ x, y, z, block });

  // Twin narrow hulls with deep centerlines and a connecting deck.
  for (let z = -14; z <= 14; z++) {
    for (const hullX of [-5, 5]) {
      add(hullX, 0, z, "wood_plank_block");
      add(hullX + Math.sign(hullX), 0, z, "wood_plank_block");
      add(hullX, -1, z, "wood_plank_block");
      if (Math.abs(z) <= 10) add(hullX, -2, z, "keel_block_north");
      add(hullX + Math.sign(hullX), 1, z, hullX < 0 ? "wood_plank_side_wall_west" : "wood_plank_side_wall_east");
    }

    if (z % 3 === 0 || Math.abs(z) <= 3) {
      for (let x = -4; x <= 4; x++) add(x, 1, z, "wood_plank_block");
    }
  }

  for (let y = 2; y <= 5; y++) add(0, y, -1, "wood_trunk_block");
  for (let x = -2; x <= 2; x++) {
    add(x, 5, -1, "sail_block_north");
    if (Math.abs(x) <= 1) add(x, 4, -1, "sail_block_north");
  }

  add(0, 1, 14, "rudder_block_south");
  add(-4, 1, 10, "bollard_block_north");
  add(4, 1, 10, "bollard_block_north");

  return {
    name: "catamaran",
    bodyType: "dynamic",
    position: [45, 0.25, 4],
    rotation: [0, 0, 0, 1],
    voxels
  };
}

export function createPenicheTemplate(): StructureTemplate {
  const voxels: StructureTemplate["voxels"] = [];
  const add = (x: number, y: number, z: number, block: string) => voxels.push({ x, y, z, block });

  // Wide flat-bottom canal-style hull with low freeboard.
  for (let x = -5; x <= 5; x++) {
    for (let z = -12; z <= 12; z++) {
      const taper = Math.floor(Math.abs(z) / 6);
      const beam = 5 - taper;
      if (Math.abs(x) <= beam) add(x, 0, z, "wood_plank_block");
      if (Math.abs(x) <= beam - 1) add(x, -1, z, "wood_plank_block");
      if (Math.abs(x) === beam) addHullSideWall(add, x, 1, z);
    }
  }

  // Low stern wheelhouse/cabin.
  for (let x = -2; x <= 2; x++) {
    for (let z = 5; z <= 10; z++) {
      add(x, 2, z, "wood_plank_block");
      if (x === -2 || x === 2 || z === 5 || z === 10) add(x, 3, z, "wood_plank_block");
    }
  }
  add(0, 1, 12, "rudder_block_south");
  add(0, 2, 12, "wood_plank_center_wall");
  add(-3, 1, 8, "bollard_block_north");
  add(3, 1, 8, "bollard_block_north");

  return {
    name: "peniche",
    bodyType: "dynamic",
    position: [20, 0.2, 18],
    rotation: [0, 0, 0, 1],
    voxels
  };
}

export function createBoatTemplate(): StructureTemplate {
  return createPirateShipTemplate();
}
