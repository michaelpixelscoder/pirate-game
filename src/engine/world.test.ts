import { describe, it, expect } from "vitest";
import { VoxelWorldEngine } from "./world";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBox(n: number) {
  const voxels = [];
  for (let x = 0; x < n; x++)
    for (let y = 0; y < n; y++)
      for (let z = 0; z < n; z++)
        voxels.push({ x, y, z, value: "stone_block" });
  return voxels;
}

// ---------------------------------------------------------------------------
// createEntity
// ---------------------------------------------------------------------------

describe("createEntity", () => {
  it("creates an entity with the given id", () => {
    const engine = new VoxelWorldEngine();
    engine.createEntity({ id: "foo", kind: "generic", physics: "static" });
    expect(engine.getEntity("foo")).not.toBeNull();
  });

  it("throws on duplicate id", () => {
    const engine = new VoxelWorldEngine();
    engine.createEntity({ id: "foo", kind: "generic", physics: "static" });
    expect(() => engine.createEntity({ id: "foo", kind: "generic", physics: "static" })).toThrow();
  });

  it("auto-generates an id when none is supplied", () => {
    const engine = new VoxelWorldEngine();
    const id = engine.createEntity({ kind: "generic", physics: "static" });
    expect(typeof id).toBe("string");
    expect(engine.getEntity(id)).not.toBeNull();
  });

  it("stores provided voxels on the entity", () => {
    const engine = new VoxelWorldEngine();
    engine.createEntity({ id: "box", kind: "voxel", physics: "static", voxels: makeBox(2) });
    expect(engine.getEntity("box")?.voxels?.size).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// World transforms
// ---------------------------------------------------------------------------

describe("world transforms", () => {
  it("world position equals local position for root-parented entity", () => {
    const engine = new VoxelWorldEngine();
    engine.createEntity({ id: "e", kind: "generic", physics: "static", transform: { position: { x: 5, y: 3, z: -2 } } });
    const world = engine.getIntrospection("e").worldTransform;
    expect(world.position.x).toBeCloseTo(5);
    expect(world.position.y).toBeCloseTo(3);
    expect(world.position.z).toBeCloseTo(-2);
  });

  it("child world position = parent world position + child local position", () => {
    const engine = new VoxelWorldEngine();
    engine.createEntity({ id: "parent", kind: "generic", physics: "static", transform: { position: { x: 10, y: 0, z: 0 } } });
    engine.createEntity({ id: "child", kind: "generic", physics: "static", parentId: "parent", transform: { position: { x: 3, y: 0, z: 0 } } });
    engine.step(0);
    const child = engine.getIntrospection("child").worldTransform;
    expect(child.position.x).toBeCloseTo(13);
  });
});

// ---------------------------------------------------------------------------
// removeEntity
// ---------------------------------------------------------------------------

describe("removeEntity", () => {
  it("removes entity by id", () => {
    const engine = new VoxelWorldEngine();
    engine.createEntity({ id: "e", kind: "generic", physics: "static" });
    engine.removeEntity("e");
    expect(engine.getEntity("e")).toBeNull();
  });

  it("does not remove root", () => {
    const engine = new VoxelWorldEngine();
    engine.removeEntity(engine.rootId);
    expect(engine.getEntity(engine.rootId)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Voxel CRUD
// ---------------------------------------------------------------------------

describe("voxels", () => {
  it("addVoxel increases voxel count", () => {
    const engine = new VoxelWorldEngine();
    engine.createEntity({ id: "v", kind: "voxel", physics: "static" });
    engine.addVoxel("v", { x: 0, y: 0, z: 0, value: "stone_block" });
    expect(engine.getEntity("v")?.voxels?.size).toBe(1);
  });

  it("removeVoxel decreases voxel count", () => {
    const engine = new VoxelWorldEngine();
    engine.createEntity({ id: "v", kind: "voxel", physics: "static", voxels: [{ x: 0, y: 0, z: 0, value: "stone_block" }] });
    engine.removeVoxel("v", 0, 0, 0);
    expect(engine.getEntity("v")?.voxels?.size).toBe(0);
  });

  it("setVoxels replaces existing voxels", () => {
    const engine = new VoxelWorldEngine();
    engine.createEntity({ id: "v", kind: "voxel", physics: "static", voxels: makeBox(3) });
    engine.setVoxels("v", makeBox(2));
    expect(engine.getEntity("v")?.voxels?.size).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// step — position update from velocity
// ---------------------------------------------------------------------------

describe("step", () => {
  it("moves a dynamic entity according to applied force", () => {
    const engine = new VoxelWorldEngine();
    engine.createEntity({
      id: "ball",
      kind: "voxel",
      physics: "dynamic",
      voxels: [{ x: 0, y: 0, z: 0, value: "stone_block" }],
      transform: { position: { x: 0, y: 0, z: 0 } }
    });
    // Apply upward force each frame for 10 frames
    for (let i = 0; i < 10; i++) {
      engine.clearAllForces();
      engine.addForce("ball", { label: "up", vector: { x: 0, y: 100, z: 0 } });
      engine.step(1 / 60);
    }
    const pos = engine.getIntrospection("ball").worldTransform.position;
    expect(pos.y).toBeGreaterThan(0);
  });

  it("static entity does not move under force", () => {
    const engine = new VoxelWorldEngine();
    engine.createEntity({ id: "rock", kind: "voxel", physics: "static", voxels: [{ x: 0, y: 0, z: 0, value: "stone_block" }] });
    engine.addForce("rock", { label: "push", vector: { x: 0, y: 1000, z: 0 } });
    engine.step(1);
    const pos = engine.getIntrospection("rock").worldTransform.position;
    expect(pos.y).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// addForce / clearAllForces
// ---------------------------------------------------------------------------

describe("forces", () => {
  it("addForce accumulates on entity", () => {
    const engine = new VoxelWorldEngine();
    engine.createEntity({ id: "e", kind: "voxel", physics: "dynamic", voxels: [{ x: 0, y: 0, z: 0, value: "stone_block" }] });
    engine.addForce("e", { label: "test", vector: { x: 1, y: 2, z: 3 } });
    const forces = engine.getIntrospection("e").forces;
    expect(forces.length).toBe(1);
    expect(forces[0].vector.y).toBe(2);
  });

  it("clearAllForces removes accumulated forces", () => {
    const engine = new VoxelWorldEngine();
    engine.createEntity({ id: "e", kind: "voxel", physics: "dynamic", voxels: [{ x: 0, y: 0, z: 0, value: "stone_block" }] });
    engine.addForce("e", { label: "test", vector: { x: 0, y: 99, z: 0 } });
    engine.clearAllForces();
    expect(engine.getIntrospection("e").forces.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// setParentPreserveWorld
// ---------------------------------------------------------------------------

describe("setParentPreserveWorld", () => {
  it("keeps world position when re-parenting", () => {
    const engine = new VoxelWorldEngine();
    engine.createEntity({ id: "parent", kind: "generic", physics: "static", transform: { position: { x: 10, y: 0, z: 0 } } });
    engine.createEntity({ id: "child", kind: "generic", physics: "static", transform: { position: { x: 7, y: 0, z: 0 } } });
    engine.step(0);
    const worldBefore = engine.getIntrospection("child").worldTransform.position;
    engine.setParentPreserveWorld("child", "parent");
    engine.step(0);
    const worldAfter = engine.getIntrospection("child").worldTransform.position;
    expect(worldAfter.x).toBeCloseTo(worldBefore.x);
  });
});

// ---------------------------------------------------------------------------
// Performance benchmark — large entity, many frames
// ---------------------------------------------------------------------------

describe("performance", () => {
  it("steps 22x22x22 voxel entity 60 frames under 500ms", () => {
    const engine = new VoxelWorldEngine();
    const voxels = makeBox(22); // 10648 voxels
    engine.createEntity({ id: "big", kind: "voxel", physics: "dynamic", voxels });
    const start = performance.now();
    for (let i = 0; i < 60; i++) {
      engine.clearAllForces();
      engine.step(1 / 60);
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(500);
  });
});
