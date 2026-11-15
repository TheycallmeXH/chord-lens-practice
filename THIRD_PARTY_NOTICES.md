# Third-Party Notices

- **Tonal**: MIT, vendored in `midi-chords/vendor/tonal.min.js`. Full license: `midi-chords/vendor/tonal-LICENSE.txt`. https://github.com/tonaljs/tonal
- **Lucide**: ISC, vendored in `assets/lucide.min.js`. Full license: `assets/lucide-LICENSE.txt`. https://github.com/lucide-icons/lucide
- **Jost**: SIL Open Font License 1.1. Copyright 2020 The Jost Project Authors. Full license: `assets/Jost-LICENSE.txt`. https://github.com/indestructible-type/Jost
- **Electron and Chromium**: Electron is MIT; the packaged runtime includes `LICENSE` and `LICENSES.chromium.html` covering its components. https://github.com/electron/electron
- **Build and test dependencies**: Sharp, ResEdit and Playwright retain their own licenses in their npm packages. These development packages are not shipped as application dependencies.
- **SpessaSynth lib 4.4.8 / core 4.4.10**: Apache-2.0. Offline AudioWorklet SoundFont engine under `assets/synth/` and standard MIDI parser under `assets/midi/`. Licenses are included under `assets/synth/`. https://github.com/spessasus/spessasynth_lib
- **fflate / stb-vorbis**: MIT / Apache-2.0, bundled dependencies of SpessaSynth. Full licenses: `assets/synth/fflate-LICENSE.txt`, `assets/synth/stb-vorbis-LICENSE.txt`. Embedded OpenMPT and stb notices are preserved in the engine bundles.
- **Akai-SteinwayIII SoundFont**: `soundfonts/akai_steinway.sf2`, supplied by the application owner for distribution. Embedded credits: Denis / NazoMusic, June 26, 2002; source comment: “From Akai S5000/S6000 free samples.” Included unchanged. See `soundfonts/README.md`. This sample library is not covered by the application's MIT license.

The release includes Jost and does not redistribute Ableton font software. The optional `local("Ableton Sans")` CSS font source uses fonts already installed by the user.

The project MIT license covers original application code and artwork, not third-party components. This application is independent of Ableton.

The optional Equinox Grand Pianos SoundFont is for local self-use and is excluded from public builds and this repository.
