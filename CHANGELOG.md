# Changelog

## 0.1.0

### Added

- Receivers from `--devices`, each with a telnet connection that is kept open and reconnected;
  the receiver's own state events become items the moment they happen, a full query at connect
  and every `--poll-interval`.
- Status items per receiver: `online`, `address`, `power`, `main_power`, `volume`, `volume_max`,
  `muted`, `input`, `video_input`, `sound_mode`, and `zone2/power`, `zone2/volume`,
  `zone2/muted`, `zone2/input` (zone 3 alike with `--zones 3`).
- Commands: `set/<device>/power`, `main_power`, `volume` (a number, `up`, `down`), `muted`,
  `input`, `video_input`, `sound_mode`, the same per zone, and `raw` with `--raw-set`.
- Home Assistant discovery: one device per receiver with switches, a volume slider and selects
  for input and sound mode (the options from `--inputs` and `--sound-modes`), per zone too.
- Docker image (`ghcr.io/handijk/denon2mqtt`), systemd installer (`--install`).
