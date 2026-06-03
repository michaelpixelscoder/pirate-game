/**
 * Generates a 256×192 cross-layout block texture template.
 *
 * Layout (4×3 grid, 64 px per cell):
 *
 *         col0   col1   col2   col3
 *  row0          [TOP ]
 *  row1  [LEFT ] [FRNT] [RGHT] [BACK]
 *  row2          [BOT ]
 *
 * Usage:
 *   node scripts/gen-block-template.mjs [block_name]
 *   node scripts/gen-block-template.mjs grass_block
 *
 * Output:
 *   public/textures/blocks/<block_name>/albedo.png
 *   public/textures/blocks/<block_name>/normal.png
 *   public/textures/blocks/<block_name>/specular.png
 */

import { createCanvas } from "@napi-rs/canvas";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const CELL = 64;          // px per face
const COLS = 4;
const ROWS = 3;
const W = CELL * COLS;    // 256
const H = CELL * ROWS;    // 192

const blockName = process.argv[2] ?? "block_template";
const outDir = join("public", "textures", "blocks", blockName);
mkdirSync(outDir, { recursive: true });

// Face layout: [col, row, label, hue (0-360)]
const FACES = [
  { col: 1, row: 0, label: "TOP",   hue: 200 },
  { col: 0, row: 1, label: "LEFT",  hue: 30  },
  { col: 1, row: 1, label: "FRONT", hue: 0   },
  { col: 2, row: 1, label: "RIGHT", hue: 30  },
  { col: 3, row: 1, label: "BACK",  hue: 0   },
  { col: 1, row: 2, label: "BOT",   hue: 20  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function hsl(h, s, l) {
  return `hsl(${h}, ${s}%, ${l}%)`;
}

function drawFaceEdges(ctx, x, y, size, color, thickness = 2) {
  ctx.strokeStyle = color;
  ctx.lineWidth = thickness;

  // Outer border
  ctx.strokeRect(x + thickness / 2, y + thickness / 2, size - thickness, size - thickness);

  // Corner L-markers (8 px)
  const m = 10;
  ctx.lineWidth = 3;
  for (const [cx, cy] of [[x, y], [x + size, y], [x, y + size], [x + size, y + size]]) {
    const dx = cx === x ? 1 : -1;
    const dy = cy === y ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(cx + dx * m, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + dy * m);
    ctx.stroke();
  }

  // Center crosshair
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(x + size / 2, y + 4);
  ctx.lineTo(x + size / 2, y + size - 4);
  ctx.moveTo(x + 4, y + size / 2);
  ctx.lineTo(x + size - 4, y + size / 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Half-cell grid (32 px divisions)
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.18;
  for (let d = CELL / 4; d < size; d += CELL / 4) {
    ctx.beginPath();
    ctx.moveTo(x + d, y);
    ctx.lineTo(x + d, y + size);
    ctx.moveTo(x, y + d);
    ctx.lineTo(x + size, y + d);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawLabel(ctx, x, y, size, text) {
  ctx.save();
  ctx.font = `bold ${size / 4}px monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillText(text, x + size / 2 + 1, y + size / 2 + 1);

  // Text
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillText(text, x + size / 2, y + size / 2);
  ctx.restore();
}

// UV coordinate labels at each corner
function drawUVLabels(ctx, x, y, size, col, row) {
  const uLeft  = (col * CELL / W).toFixed(2);
  const uRight = ((col + 1) * CELL / W).toFixed(2);
  const vBot   = (row * CELL / H).toFixed(2);
  const vTop   = ((row + 1) * CELL / H).toFixed(2);

  ctx.save();
  ctx.font = "9px monospace";
  ctx.fillStyle = "rgba(255,255,180,0.85)";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(`U${uLeft} V${vTop}`, x + 3, y + 3);
  ctx.textAlign = "right";
  ctx.fillText(`U${uRight} V${vTop}`, x + size - 3, y + 3);
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillText(`U${uLeft} V${vBot}`, x + 3, y + size - 3);
  ctx.textAlign = "right";
  ctx.fillText(`U${uRight} V${vBot}`, x + size - 3, y + size - 3);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Albedo template
// ---------------------------------------------------------------------------
function buildAlbedo() {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Background: dark checkerboard (indicates transparent / unused area)
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const isUsed = FACES.some((f) => f.col === c && f.row === r);
      if (!isUsed) {
        // Transparent-indicating checkerboard
        for (let ty = 0; ty < CELL; ty += 8) {
          for (let tx = 0; tx < CELL; tx += 8) {
            ctx.fillStyle = ((tx + ty) / 8) % 2 === 0 ? "#555" : "#444";
            ctx.fillRect(c * CELL + tx, r * CELL + ty, 8, 8);
          }
        }
      }
    }
  }

  for (const { col, row, label, hue } of FACES) {
    const x = col * CELL;
    const y = row * CELL;

    // Face fill — subtle gradient
    const grad = ctx.createLinearGradient(x, y, x + CELL, y + CELL);
    grad.addColorStop(0, hsl(hue, 18, 30));
    grad.addColorStop(1, hsl(hue, 14, 22));
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, CELL, CELL);

    drawFaceEdges(ctx, x, y, CELL, hsl(hue, 55, 70));
    drawLabel(ctx, x, y, CELL, label);
    drawUVLabels(ctx, x, y, CELL, col, row);
  }

  // Global border
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1);

  // Watermark
  ctx.save();
  ctx.font = "10px monospace";
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillText(`${blockName} · albedo · 256×192 · 64px/face`, W - 4, H - 3);
  ctx.restore();

  return canvas.toBuffer("image/png");
}

// ---------------------------------------------------------------------------
// Normal map template (flat surface — all faces point outward = 128,128,255)
// ---------------------------------------------------------------------------
function buildNormal() {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Default flat tangent-space normal: R=128 G=128 B=255
  ctx.fillStyle = "rgb(128,128,255)";
  ctx.fillRect(0, 0, W, H);

  // Each face has a slightly different tint to indicate the face direction
  // Using standard tangent-space conventions per face:
  const faceNormals = {
    TOP:   "rgb(128,128,255)",  // up  — straight up in tangent space
    BOT:   "rgb(128,128,255)",
    FRONT: "rgb(128,128,255)",
    BACK:  "rgb(128,128,255)",
    LEFT:  "rgb(128,128,255)",
    RIGHT: "rgb(128,128,255)",
  };

  // Unused cells — black
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const face = FACES.find((f) => f.col === c && f.row === r);
      if (!face) {
        ctx.fillStyle = "#000";
        ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
      } else {
        ctx.fillStyle = faceNormals[face.label] ?? "rgb(128,128,255)";
        ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
        // Edge normal gradient hint (darker at border = slight inward bevel)
        const bevelGrad = ctx.createRadialGradient(
          c * CELL + CELL / 2, r * CELL + CELL / 2, CELL * 0.2,
          c * CELL + CELL / 2, r * CELL + CELL / 2, CELL * 0.72
        );
        bevelGrad.addColorStop(0, "rgba(128,128,255,0)");
        bevelGrad.addColorStop(1, "rgba(100,100,210,0.55)");
        ctx.fillStyle = bevelGrad;
        ctx.fillRect(c * CELL, r * CELL, CELL, CELL);

        drawFaceEdges(ctx, c * CELL, r * CELL, CELL, "rgba(255,255,255,0.3)");
        drawLabel(ctx, c * CELL, r * CELL, CELL, face.label);
      }
    }
  }

  ctx.save();
  ctx.font = "10px monospace";
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillText(`${blockName} · normal · 256×192`, W - 4, H - 3);
  ctx.restore();

  return canvas.toBuffer("image/png");
}

// ---------------------------------------------------------------------------
// Specular / roughness template (mid-grey = 0.5 roughness, 0 metallic)
// ---------------------------------------------------------------------------
function buildSpecular() {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);

  for (const { col, row, label } of FACES) {
    const x = col * CELL;
    const y = row * CELL;
    // Mid-grey = roughness 0.5
    ctx.fillStyle = "rgb(128,128,128)";
    ctx.fillRect(x, y, CELL, CELL);
    drawFaceEdges(ctx, x, y, CELL, "rgba(255,255,255,0.4)");
    drawLabel(ctx, x, y, CELL, label);
  }

  ctx.save();
  ctx.font = "10px monospace";
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillText(`${blockName} · specular/roughness · 256×192`, W - 4, H - 3);
  ctx.restore();

  return canvas.toBuffer("image/png");
}

// ---------------------------------------------------------------------------
// Write files
// ---------------------------------------------------------------------------
writeFileSync(join(outDir, "albedo.png"), buildAlbedo());
writeFileSync(join(outDir, "normal.png"), buildNormal());
writeFileSync(join(outDir, "specular.png"), buildSpecular());

console.log(`✓ Written to ${outDir}/`);
console.log(`  albedo.png   — 256×192 cross layout template`);
console.log(`  normal.png   — flat tangent-space (128,128,255) with bevel hint`);
console.log(`  specular.png — mid-grey roughness (0.5)`);
console.log();
console.log(`UV face offsets (0-1 range, V=0 at bottom):`);
for (const { col, row, label } of FACES) {
  const uMin = (col / COLS).toFixed(4);
  const uMax = ((col + 1) / COLS).toFixed(4);
  const vMin = (row / ROWS).toFixed(4);
  const vMax = ((row + 1) / ROWS).toFixed(4);
  console.log(`  ${label.padEnd(5)}  U[${uMin}–${uMax}]  V[${vMin}–${vMax}]`);
}
