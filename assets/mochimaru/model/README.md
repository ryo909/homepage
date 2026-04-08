Place the web-converted Gemma model file in this directory.

Expected runtime file name:

- `gemma-web.task`

The fetch script currently tries these sources in order:

- `litert-community/gemma-3-270m-it` / `gemma3-270m-it-q8-web.task` when `HF_TOKEN` has gated access
- `0x3/gemma3-1b-it-int4.task` / `gemma3-1b-it-int4.task` as a public fallback

The runtime reads this path from:

- `assets/mochimaru/mochimaru-config.js`

If you switch to another web-converted Gemma model, update only:

- `GEMMA_CONFIG.modelAssetPath` in `assets/mochimaru/mochimaru-config.js`
