export type Vec3 = {
  x: number;
  y: number;
  z: number;
};

export type Quat = {
  x: number;
  y: number;
  z: number;
  w: number;
};

export type Transform = {
  position: Vec3;
  rotation: Quat;
  scale: Vec3;
};

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function quat(x = 0, y = 0, z = 0, w = 1): Quat {
  return { x, y, z, w };
}

export function normalizeQuat(q: Quat): Quat {
  const len = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
  if (len < 1e-8) return quat();
  return { x: q.x / len, y: q.y / len, z: q.z / len, w: q.w / len };
}

export function multiplyQuat(a: Quat, b: Quat): Quat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
  };
}

export function conjugateQuat(q: Quat): Quat {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

export function rotateVec3ByQuat(v: Vec3, q: Quat): Vec3 {
  const u = { x: q.x, y: q.y, z: q.z };
  const s = q.w;
  const uv = {
    x: u.y * v.z - u.z * v.y,
    y: u.z * v.x - u.x * v.z,
    z: u.x * v.y - u.y * v.x
  };
  const uuv = {
    x: u.y * uv.z - u.z * uv.y,
    y: u.z * uv.x - u.x * uv.z,
    z: u.x * uv.y - u.y * uv.x
  };
  return {
    x: v.x + 2 * (uv.x * s + uuv.x),
    y: v.y + 2 * (uv.y * s + uuv.y),
    z: v.z + 2 * (uv.z * s + uuv.z)
  };
}

export function cloneVec3(v: Vec3): Vec3 {
  return { x: v.x, y: v.y, z: v.z };
}

export function addVec3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function subVec3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function crossVec3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}

export function mulVec3(v: Vec3, scalar: number): Vec3 {
  return { x: v.x * scalar, y: v.y * scalar, z: v.z * scalar };
}

export function dotVec3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function lengthVec3(v: Vec3): number {
  return Math.sqrt(dotVec3(v, v));
}

export function normalizeVec3(v: Vec3): Vec3 {
  const len = lengthVec3(v);
  if (len < 1e-8) return vec3(0, 0, 0);
  return mulVec3(v, 1 / len);
}

export function identityTransform(): Transform {
  return {
    position: vec3(),
    rotation: quat(),
    scale: vec3(1, 1, 1)
  };
}
