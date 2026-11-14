# Vendored Rune patch crates

These crates are copied from [anomalyco/rune](https://github.com/anomalyco/rune) at
`4970cffe6a4e90c7d613796be8ce39eb3dcb281b` (branch `dev`).

Rune is pre-release and its README requires apps that build it to apply the same
`[patch.crates-io]` entries the Rune workspace uses:

- `wgpu-hal` — `dx12::Instance::expose_adapter`, FXC first-compile, partial presents
- `winit` — Windows taskbar/creation fixes
- `parley_engine` — UAX #9 L1 and shaping caches
- `accesskit_windows` — heading and landmark support

`tiny-skia-path` is a path dependency inside the Rune git checkout, so it does not
need a local copy here.

Keep these in sync with the Rune rev in `rust/Cargo.toml`.
