import { BuildRegistry, type BlockDefinition } from "./registry";

function cubeCells(sizeX = 1, sizeY = 1, sizeZ = 1) {
  const cells = [] as BlockDefinition["cells"];
  for (let x = 0; x < sizeX; x++) {
    for (let y = 0; y < sizeY; y++) {
      for (let z = 0; z < sizeZ; z++) {
        cells.push({ x, y, z });
      }
    }
  }
  return cells;
}

function sailCells() {
  return [
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 0, y: 2, z: 0 },
    { x: 0, y: 3, z: 0 },
    { x: 1, y: 1, z: 0 },
    { x: 1, y: 2, z: 0 },
    { x: 2, y: 1, z: 0 },
    { x: 2, y: 2, z: 0 },
    { x: 3, y: 1, z: 0 },
    { x: 3, y: 2, z: 0 }
  ];
}

export function createDefaultBlockRegistry() {
  const registry = new BuildRegistry();

  registry.registerBlock({ id: "stone_block", name: "Stone", icon: "■", color: 0x87919a, mass: 2.4, cells: cubeCells() }, true);
  registry.registerBlock({ id: "dirt_block", name: "Dirt", icon: "▩", color: 0x7b5535, mass: 1.5, cells: cubeCells() }, true);
  registry.registerBlock({ id: "sand_block", name: "Sand", icon: "▨", color: 0xd9c47c, mass: 1.65, cells: cubeCells() }, true);
  registry.registerBlock({ id: "wood_trunk_block", name: "Trunk", icon: "│", color: 0x6b4629, mass: 0.72, cells: cubeCells() }, true);
  registry.registerBlock({ id: "foliage_block", name: "Foliage", icon: "✿", color: 0x3f8f4d, mass: 0.18, cells: cubeCells() }, true);
  registry.registerBlock({ id: "wood_plank_block", name: "Plank", icon: "▤", color: 0xb8824c, mass: 0.58, cells: cubeCells() }, true);
  registry.registerBlock({ id: "beam_block", name: "Beam", icon: "═", color: 0xa46b3a, mass: 0.62, cells: cubeCells(3, 1, 1) }, true);
  registry.registerBlock({ id: "mast_block", name: "Mast", icon: "║", color: 0x6b4629, mass: 0.68, cells: cubeCells(1, 4, 1) }, true);
  registry.registerBlock({ id: "sail_block", name: "Sail", icon: "⛵", color: 0xf1e4c4, mass: 0.12, cells: sailCells() }, true);
  registry.registerBlock({ id: "keel_block", name: "Keel", icon: "▂", color: 0x51351f, mass: 0.95, cells: cubeCells(1, 1, 5) }, true);

  return registry;
}
