import { describe, it, expect, beforeEach } from "vitest";
import { VoxelWorldEngine } from "../engine/world";
import { applyGravityAndBuoyancy, buildStaticSurface } from "./buoyancy";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEngine() {
  return new VoxelWorldEngine();
}

/** Create a single dynamic voxel entity at the given Y position. */
function makeDynamicVoxel(engine: VoxelWorldEngine, id: string, y: number) {
  engine.createEntity({
    id,
    kind: "voxel",
    physics: "dynamic",
    voxels: [{ x: 0, y: 0, z: 0, value: "wood_block" }],
    transform: { position: { x: 0, y, z: 0 } }
  });
}

/** Create a static floor entity made of a flat layer of voxels at worldY. */
function makeStaticFloor(engine: VoxelWorldEngine, id: string, worldY: number, size = 3) {
  const voxels = [];
  for (let x = -size; x <= size; x++)
    for (let z = -size; z <= size; z++)
      voxels.push({ x, y: 0, z, value: "stone_block" });
  engine.createEntity({
    id,
    kind: "voxel",
    physics: "static",
    voxels,
    transform: { position: { x: 0, y: worldY, z: 0 } }
  });
}

const WATER_LEVEL = 0;
const opts = (extra?: object) => ({
  waterLevel: WATER_LEVEL,
  gravityEnabled: true,
  ...extra
});

// ---------------------------------------------------------------------------
// Gravity
// ---------------------------------------------------------------------------

describe("gravity", () => {
  it("applies a downward force when gravityEnabled=true", () => {
    const engine = makeEngine();
    makeDynamicVoxel(engine, "e", 5);
    engine.clearAllForces();
    applyGravityAndBuoyancy(engine, opts());
    const forces = engine.getIntrospection("e").forces;
    const gravity = forces.find((f) => f.label === "gravity");
    expect(gravity).toBeDefined();
    expect(gravity!.vector.y).toBeLessThan(0);
  });

  it("does not apply gravity when gravityEnabled=false", () => {
    const engine = makeEngine();
    makeDynamicVoxel(engine, "e", 5);
    engine.clearAllForces();
    applyGravityAndBuoyancy(engine, { waterLevel: WATER_LEVEL, gravityEnabled: false });
    const forces = engine.getIntrospection("e").forces;
    expect(forces.find((f) => f.label === "gravity")).toBeUndefined();
  });

  it("heavier block receives proportionally larger gravity force", () => {
    const heavy = makeEngine();
    const light = makeEngine();
    makeDynamicVoxel(heavy, "e", 5);
    makeDynamicVoxel(light, "e", 5);
    for (const [eng, mass] of [[heavy, 10], [light, 1]] as const) {
      eng.clearAllForces();
      applyGravityAndBuoyancy(eng, opts({ resolveBlockMass: () => mass }));
    }
    const heavyG = heavy.getIntrospection("e").forces.find((f) => f.label === "gravity")!.vector.y;
    const lightG = light.getIntrospection("e").forces.find((f) => f.label === "gravity")!.vector.y;
    expect(heavyG / lightG).toBeCloseTo(10, 1);
  });
});

// ---------------------------------------------------------------------------
// Buoyancy
// ---------------------------------------------------------------------------

describe("buoyancy", () => {
  it("applies upward buoyancy force when voxel is below water", () => {
    const engine = makeEngine();
    makeDynamicVoxel(engine, "e", -2); // voxel centre at ~-1.5, below waterLevel=0
    engine.clearAllForces();
    applyGravityAndBuoyancy(engine, opts());
    const forces = engine.getIntrospection("e").forces;
    const buoyancy = forces.find((f) => f.label === "buoyancy");
    expect(buoyancy).toBeDefined();
    expect(buoyancy!.vector.y).toBeGreaterThan(0);
  });

  it("does not apply buoyancy force when voxel is fully above water", () => {
    const engine = makeEngine();
    makeDynamicVoxel(engine, "e", 5); // well above waterLevel=0
    engine.clearAllForces();
    applyGravityAndBuoyancy(engine, opts());
    const forces = engine.getIntrospection("e").forces;
    expect(forces.find((f) => f.label === "buoyancy")).toBeUndefined();
  });

  it("buoyancy force is greater for deeper submersion", () => {
    const shallow = makeEngine();
    const deep = makeEngine();
    makeDynamicVoxel(shallow, "e", -0.1);
    makeDynamicVoxel(deep, "e", -5);
    for (const eng of [shallow, deep]) {
      eng.clearAllForces();
      applyGravityAndBuoyancy(eng, opts());
    }
    const shallowB = shallow.getIntrospection("e").forces.find((f) => f.label === "buoyancy")?.vector.y ?? 0;
    const deepB = deep.getIntrospection("e").forces.find((f) => f.label === "buoyancy")?.vector.y ?? 0;
    expect(deepB).toBeGreaterThan(shallowB);
  });
});

// ---------------------------------------------------------------------------
// Fluid drag
// ---------------------------------------------------------------------------

describe("fluid drag", () => {
  it("applies drag opposing the direction of motion", () => {
    const engine = makeEngine();
    makeDynamicVoxel(engine, "e", -2);
    engine.setWorldVelocity("e", { x: 0, y: 5, z: 0 }); // moving up
    engine.clearAllForces();
    applyGravityAndBuoyancy(engine, opts());
    const drag = engine.getIntrospection("e").forces.find((f) => f.label === "fluid-drag");
    expect(drag).toBeDefined();
    expect(drag!.vector.y).toBeLessThan(0); // opposes upward motion
  });

  it("no drag force at zero velocity", () => {
    const engine = makeEngine();
    makeDynamicVoxel(engine, "e", -2);
    // velocity is already zero by default
    engine.clearAllForces();
    applyGravityAndBuoyancy(engine, opts());
    const drag = engine.getIntrospection("e").forces.find((f) => f.label === "fluid-drag");
    expect(drag).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Static surface collision support
// ---------------------------------------------------------------------------

describe("buildStaticSurface / collision support", () => {
  it("buildStaticSurface returns a non-empty map for entities with static voxels", () => {
    const engine = makeEngine();
    makeStaticFloor(engine, "floor", 0);
    const surface = buildStaticSurface(engine);
    expect(surface.size).toBeGreaterThan(0);
  });

  it("applies collision-support force when dynamic entity penetrates static surface", () => {
    const engine = makeEngine();
    makeStaticFloor(engine, "floor", 0);     // floor top near y=0.5 in world space
    makeDynamicVoxel(engine, "boat", -0.3);  // boat centre below surface top
    const surface = buildStaticSurface(engine);
    engine.clearAllForces();
    applyGravityAndBuoyancy(engine, opts({ staticSurface: surface }));
    const support = engine.getIntrospection("boat").forces.find((f) => f.label === "collision-support");
    expect(support).toBeDefined();
    expect(support!.vector.y).toBeGreaterThan(0);
  });

  it("no collision-support when well above static surface", () => {
    const engine = makeEngine();
    makeStaticFloor(engine, "floor", 0);
    makeDynamicVoxel(engine, "boat", 10); // high above floor
    const surface = buildStaticSurface(engine);
    engine.clearAllForces();
    applyGravityAndBuoyancy(engine, opts({ staticSurface: surface }));
    const support = engine.getIntrospection("boat").forces.find((f) => f.label === "collision-support");
    expect(support).toBeUndefined();
  });

  it("pre-built static surface gives same result as on-the-fly surface", () => {
    const engine = makeEngine();
    makeStaticFloor(engine, "floor", -5);
    makeDynamicVoxel(engine, "e1", -5);

    const prebuilt = buildStaticSurface(engine);
    engine.clearAllForces();
    applyGravityAndBuoyancy(engine, opts({ staticSurface: prebuilt }));
    const withCache = engine.getIntrospection("e1").forces.map((f) => ({ label: f.label, vy: f.vector.y }));

    engine.clearAllForces();
    applyGravityAndBuoyancy(engine, opts()); // no cache — rebuilt internally
    const withoutCache = engine.getIntrospection("e1").forces.map((f) => ({ label: f.label, vy: f.vector.y }));

    expect(withCache).toEqual(withoutCache);
  });
});

// ---------------------------------------------------------------------------
// Performance benchmark — many voxels, many frames with pre-built surface
// ---------------------------------------------------------------------------

describe("performance", () => {
  it("1000 voxel entity × 60 frames with static surface under 2000ms", () => {
    const engine = makeEngine();
    const voxels = [];
    for (let i = 0; i < 1000; i++) voxels.push({ x: i % 10, y: Math.floor(i / 100), z: (i / 10) % 10 | 0, value: "wood_block" });
    makeStaticFloor(engine, "floor", -10, 15);
    engine.createEntity({ id: "big", kind: "voxel", physics: "dynamic", voxels, transform: { position: { x: 0, y: -8, z: 0 } } });
    const surface = buildStaticSurface(engine);

    const start = performance.now();
    for (let frame = 0; frame < 60; frame++) {
      engine.clearAllForces();
      applyGravityAndBuoyancy(engine, opts({ staticSurface: surface }));
      engine.step(1 / 60);
    }
    expect(performance.now() - start).toBeLessThan(2000);
  });
});
