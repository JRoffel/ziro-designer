# Changelog

All notable changes to ZiroEDA Designer, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/): while ZiroEDA is in beta the major
version is 0, and every minor version is a milestone. Each version is a git tag
(`v0.9.0`, ...) on the commit it describes.

Each entry says what changed for someone using ZiroEDA. The commit history has
the engineering detail (3,700+ commits since 29 June 2026).

## [Unreleased]

## [0.9.0] - 2026-10-20

KiCad's own outputs, GitHub projects, and a faster board editor.

### Added
- **Open any public KiCad project on GitHub** straight from its address:
  `designer.ziroeda.com/gh/<owner>/<repo>`, read-only, with "Save a copy" to
  make it yours. An "Open in ZiroEDA" badge for repository READMEs.
- **Gerber and PDF output through KiCad's own plotters**, so fabrication and
  documentation files come out the way KiCad writes them.
- **Electrical Rules Check runs KiCad's full ERC tester**, including library,
  footprint-link, text-variable and simulation-model checks.
- **Zone fills run in the background** with KiCad's progress dialogs, and the
  board can draw in a background worker, so a large board no longer freezes
  the window.
- Anonymous usage counts (which kind of screen is open and for how long, never
  which project), opt-out, off under Do Not Track.

### Fixed
- Accounts created before end-to-end encryption (10 September) were refused
  with their correct password and told nothing. Sign-in now explains the
  one-time upgrade: use "Forgot password?" once; no recovery key is needed.
- ERC no longer flags every title-block field of a correct schematic.
- Toolbar toggles and zone display switches no longer repaint the whole board.

## [0.8.0] - 2026-09-27 - Public beta

### Added
- **Live multiplayer in the schematic editor**: edit a schematic together in
  real time, with everyone's cursor and selection, **end-to-end encrypted**
  like the projects themselves. Contributed by
  [@kaminaris](https://github.com/kaminaris) (#638).
- **KiCad's graphics engine on WebGL2**: the board editor now draws through a
  port of KiCad's own GAL renderer, shaders, antialiasing and bitmap font.
- Public beta opened at designer.ziroeda.com.

## [0.7.0] - 2026-09-13 - End-to-end encryption

### Added
- **End-to-end encrypted cloud projects.** Every project has its own key and is
  encrypted in the browser before upload; the server stores ciphertext only.
  Board files, schematics, file names and project metadata are all covered.
- A **recovery key**, shown once at sign-up, that is the only way back into
  encrypted projects if the password is forgotten.
- Your password never reaches the server; it is used to derive the keys.

## [0.6.0] - 2026-09-06 - Sharing

### Added
- **Share a project by link or invite**, so someone else opens the real
  project in their browser instead of a zip file or screenshots.
- Project version history in the cloud, with compare-and-swap saves so two
  devices cannot silently overwrite each other.

## [0.5.0] - 2026-08-16 - Routing

### Added
- **KiCad's interactive router (PNS)**: route tracks with push-and-shove, the
  same router KiCad uses, including interactive differential-pair routing.
- **Design Rules Check** in the board editor, including copper-sliver checks.
- Netlist exports, among them the PADS, CadStar and Cadence Allegro formats.

## [0.4.0] - 2026-08-02 - Zones and schematic-to-board

### Added
- **Copper zones**: pour, refill and hatch-pattern fills that KiCad reads back
  unchanged.
- **Update PCB from Schematic**, the step that turns a schematic into a board.

## [0.3.0] - 2026-07-19 - The KiCad tools

### Added
- **Gerber Viewer**. Contributed by [@gcoenwebber](https://github.com/gcoenwebber).
- **PCB Calculator** and the **Image Converter**.
- The Plugin and Content Manager.

## [0.2.0] - 2026-07-12 - Accounts and cloud

### Added
- **Accounts and cloud projects**: sign in and open your projects from any
  device.
- **Symbol Editor** and **Footprint Editor**.
- Demo projects that open with no sign-up.
- Click selection and a Properties readout in the PCB editor.

## [0.1.0] - 2026-07-06 - First editors

### Added
- **Schematic editor** reading and writing `.kicad_sch` losslessly: symbols
  from KiCad's libraries, wires, selection, move, undo and redo, save.
- **PCB editor**, first version: reads `.kicad_pcb` and draws it like KiCad.
- **3D viewer** for boards.
- The KiCad-style project manager home screen.

[Unreleased]: https://github.com/ZiroEDA/ziro-designer/compare/v0.9.0...HEAD
[0.9.0]: https://github.com/ZiroEDA/ziro-designer/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/ZiroEDA/ziro-designer/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/ZiroEDA/ziro-designer/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/ZiroEDA/ziro-designer/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/ZiroEDA/ziro-designer/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/ZiroEDA/ziro-designer/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/ZiroEDA/ziro-designer/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/ZiroEDA/ziro-designer/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ZiroEDA/ziro-designer/releases/tag/v0.1.0
