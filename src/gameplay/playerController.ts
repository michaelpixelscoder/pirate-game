import * as THREE from "three";
import type { VoxelWorldEngine } from "../engine";

export type PlayerMotionInput = {
  playerId: string;
  cameraYaw: number;
  cameraPitch: number;
  movementForward: number;
  movementStrafe: number;
  movementVertical: number;
  sprint: boolean;
};

export function updatePlayerMotion(engine: VoxelWorldEngine, input: PlayerMotionInput) {
  const player = engine.getEntity(input.playerId);
  if (!player) return;
  const parentId = player.parentId ?? engine.rootId;
  const parent = engine.getEntity(parentId);
  const parentWorld = parent ? engine.getIntrospection(parent.id).worldTransform : engine.getIntrospection(engine.rootId).worldTransform;
  const parentQuat = new THREE.Quaternion(parentWorld.rotation.x, parentWorld.rotation.y, parentWorld.rotation.z, parentWorld.rotation.w);
  const forward = new THREE.Vector3();
  const viewQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(input.cameraPitch, input.cameraYaw, 0, "YXZ"));
  forward.set(0, 0, -1).applyQuaternion(viewQuat);
  forward.y = 0;
  if (forward.lengthSq() > 0) forward.normalize();
  const right = new THREE.Vector3(1, 0, 0);
  if (forward.lengthSq() > 0) right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const move = new THREE.Vector3();
  if (input.movementForward > 0) move.add(forward);
  if (input.movementForward < 0) move.sub(forward);
  if (input.movementStrafe > 0) move.add(right);
  if (input.movementStrafe < 0) move.sub(right);
  if (input.movementVertical > 0) move.y += 1;
  if (input.movementVertical < 0) move.y -= 1;
  if (move.lengthSq() > 0) move.normalize();
  const desiredWorldVelocity = move.multiplyScalar(input.sprint ? 6.5 : 4.2);
  const localVelocity = desiredWorldVelocity.clone().applyQuaternion(parentQuat.clone().invert());
  engine.setLocalVelocity(input.playerId, { x: localVelocity.x, y: localVelocity.y, z: localVelocity.z });
}