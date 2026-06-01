export type StructureVoxelSpec = {
  x: number;
  y: number;
  z: number;
  block: string;
};

export type StructureTemplate = {
  name: string;
  bodyType: "fixed" | "dynamic";
  position: [number, number, number];
  rotation: [number, number, number, number];
  voxels: StructureVoxelSpec[];
};
