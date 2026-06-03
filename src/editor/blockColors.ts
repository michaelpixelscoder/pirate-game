/** Maps block IDs to hex colours for the editor viewport */
const BLOCK_COLOR_MAP: Record<string, number> = {
  stone_block: 0x87919a,
  dirt_block: 0x7b5535,
  sand_block: 0xd9c47c,
  grass_block: 0x4a9e3f,
  wood_trunk_block: 0x6b4629,
  foliage_block: 0x3f8f4d,
  wood_plank_block: 0xb8824c,
  keel_block: 0x51351f,
  sail_block: 0xf1e4c4,
  glass_block: 0x99ccee,
  water_block: 0x3478b5,
};

const FALLBACK_COLORS: Array<[RegExp, number]> = [
  [/stone/, 0x87919a],
  [/dirt/, 0x7b5535],
  [/sand/, 0xd9c47c],
  [/grass/, 0x4a9e3f],
  [/trunk|mast/, 0x6b4629],
  [/foliage|leaf/, 0x3f8f4d],
  [/plank|beam|bollard|keel/, 0xb8824c],
  [/sail/, 0xf1e4c4],
  [/glass/, 0x99ccee],
  [/water/, 0x3478b5],
];

export function blockHexColor(blockId: string): number {
  if (BLOCK_COLOR_MAP[blockId] !== undefined) return BLOCK_COLOR_MAP[blockId];
  for (const [pattern, color] of FALLBACK_COLORS) {
    if (pattern.test(blockId)) return color;
  }
  return 0xb7c3cb; // default grey
}

export function blockCssColor(blockId: string): string {
  return `#${blockHexColor(blockId).toString(16).padStart(6, "0")}`;
}

/** Ordered list of blocks available for placement in the editor */
export const BLOCK_PALETTE = [
  "grass_block",
  "dirt_block",
  "sand_block",
  "stone_block",
  "wood_trunk_block",
  "wood_plank_block",
  "foliage_block",
  "keel_block",
  "sail_block",
  "water_block",
] as const;
