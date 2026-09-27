# PixiJS agent skills (vendored)

The `pixijs*` folders here are the official PixiJS v8 skills from
https://github.com/pixijs/pixijs-skills (MIT, see `PIXIJS-SKILLS-LICENSE`),
copied unchanged and pinned to commit `df555b8fbc12acec1e1cfae942bef417f2579169`
(2026-09-17). They teach coding agents correct PixiJS v8 usage.

To update: clone that repo, check the diff against these folders, copy
`skills/*` over them, and update the commit above.

Neon Storm specifics the skills don't know about (see CLAUDE.md):
- The game uses the PixiJS 8.18.1 global build (`vendor/pixi.min.js`), so
  everything is `PIXI.Sprite`, `PIXI.filters.*` etc. — no `import`s.
- pixi-filters is pinned to v6.1.5 (the PixiJS v8 line) and exposed as
  `PIXI.filters`; filter centres are in play-area pixels.
- Custom shaders are WebGL (GLSL) only; the renderer is not WebGPU.
