# Engine

This folder holds the new agnostic game engine layer.

Goals:

- no ship / water / island terms in the core
- entity tree with a root world entity
- static and dynamic entities
- optional collision
- local and global transforms / velocities
- debug force and debug velocity vectors per entity or globally
- pluggable voxel rendering backend

Renderer candidates researched:

- `@use-gpu/voxel`: modern, actively maintained, browser-native WebGPU voxel loader + layer
- `voxel-mesh`: older but simple Three.js mesh generator bridge for incremental migration

The current engine skeleton is intentionally renderer-agnostic so we can swap backends without rewriting the simulation model.

