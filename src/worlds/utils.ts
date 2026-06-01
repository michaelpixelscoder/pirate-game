import type { VoxelCell } from "../engine";

export function templateVoxels(voxels: { x: number; y: number; z: number; block: string }[]): VoxelCell[] {
  return voxels.map((voxel) => ({ x: voxel.x, y: voxel.y, z: voxel.z, value: voxel.block }));
}