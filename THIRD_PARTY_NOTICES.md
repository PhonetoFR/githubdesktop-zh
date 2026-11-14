# Third-party notices

This application is MIT licensed. It embeds or depends on the following works:

## Rune

- Project: https://github.com/anomalyco/rune
- License: MIT
- Copyright: Anomaly and Rune contributors

Rune is used as a git dependency pinned to a specific `dev` revision. The
official patch crates required by Rune are vendored under `rust/vendor/` with
their original licenses.

## Inter

- Project: https://github.com/rsms/inter
- License: SIL Open Font License 1.1
- Copyright: The Inter Project Authors

The Inter variable font is embedded through `rune-theme-opencode`.

## IBM Plex Mono

- Project: https://github.com/IBM/plex
- License: SIL Open Font License 1.1
- Copyright: IBM Corp.

IBM Plex Mono Regular/Medium are embedded through `rune-theme-opencode`.

## Other Rust crates

The full dependency graph and versions are recorded in `rust/Cargo.lock`.
License texts for vendored crates are kept in their respective directories.
