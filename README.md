# denon2mqtt

Interface between Denon and Marantz AV receivers and MQTT, following the
[mqtt-smarthome](https://github.com/mqtt-smarthome/mqtt-smarthome) convention, built on
[mqtt-interfaces-core](https://github.com/hobbyquaker/mqtt-interfaces-core).

It speaks the receivers' telnet protocol on port 23 (the one the Denon and Marantz control
documents describe, from the AVR-X and Marantz SR/NR series on): one connection per receiver
is kept open, and because the receiver sends every state change on that connection, power,
volume, mute, input and sound mode are on MQTT the moment someone touches the remote. Commands
set them, for the main zone and the extra zones. Home Assistant finds every receiver through
MQTT discovery.

Tested on a Denon AVR-X2500H. Other models speak the same protocol; the input and sound mode
codes differ per model and are configurable.

## Install

```
npm install -g denon2mqtt
denon2mqtt -u mqtt://broker -d living_room=192.168.1.30
sudo denon2mqtt --install -n denon -u mqtt://broker -d living_room=192.168.1.30   # systemd service denon2mqtt@denon
```

The receiver allows one telnet connection at a time: stop other telnet-based integrations
(Home Assistant's `denonavr` uses HTTP and is fine next to it).

## Docker

Multi-arch image (amd64, arm64, armv7):

```
docker run -d --name denon2mqtt --restart unless-stopped \
  -e DENON2MQTT_DEVICES=living_room=192.168.1.30 -e DENON2MQTT_MQTT_URL=mqtt://broker \
  ghcr.io/handijk/denon2mqtt
```

## Topics

Instance name `denon` (`--name`); status payloads are `{"val": ..., "ts": ..., "lc": ...}` unless
`--no-json-payloads`. `<device>` is the name from `--devices` as a slug.

| topic                                | retained | value                                                          |
| ------------------------------------ | -------- | -------------------------------------------------------------- |
| `denon/connected`                    | yes      | `0` gone, `1` broker only, `2` at least one receiver connected |
| `denon/status/<device>/online`       | yes      | `true` while the connection is up                              |
| `denon/status/<device>/address`      | yes      | the receiver's address                                         |
| `denon/status/<device>/power`        | yes      | `ON` or `STANDBY` (the unit)                                   |
| `denon/status/<device>/main_power`   | yes      | `ON` or `OFF` (the main zone)                                  |
| `denon/status/<device>/volume`       | yes      | `0`–`98` in half steps                                         |
| `denon/status/<device>/volume_max`   | yes      | the receiver's volume limit                                    |
| `denon/status/<device>/muted`        | yes      | `true` or `false`                                              |
| `denon/status/<device>/input`        | yes      | the input source code (`MPLAY`, `BD`, `CBL/SAT`, `NET`, ...)   |
| `denon/status/<device>/video_input`  | yes      | the video source code (`OFF` = follows the input)              |
| `denon/status/<device>/sound_mode`   | yes      | the sound mode code (`STEREO`, `MOVIE`, `PURE DIRECT`, ...)    |
| `denon/status/<device>/zone2/power`  | yes      | `ON` or `OFF`                                                  |
| `denon/status/<device>/zone2/volume` | yes      | `0`–`98`                                                       |
| `denon/status/<device>/zone2/muted`  | yes      | `true` or `false`                                              |
| `denon/status/<device>/zone2/input`  | yes      | the input source code                                          |

Zone 3 alike under `zone3/` with `--zones 3`; `--zones 1` leaves the zones out.

### Commands

| topic                                                        | payload                                                  |
| ------------------------------------------------------------ | -------------------------------------------------------- |
| `denon/set/<device>/power`                                   | `on`, `off` or `standby`                                 |
| `denon/set/<device>/main_power`                              | `on` or `off`                                            |
| `denon/set/<device>/volume`                                  | `38.5`, or `up`, `down`                                  |
| `denon/set/<device>/muted`                                   | `true` or `false`                                        |
| `denon/set/<device>/input`                                   | an input source code: `MPLAY`, `BD`, `CBL/SAT`, ...      |
| `denon/set/<device>/video_input`                             | `OFF` or a source code                                   |
| `denon/set/<device>/sound_mode`                              | a sound mode code: `STEREO`, `MOVIE`, `PURE DIRECT`, ... |
| `denon/set/<device>/zone2/power`, `volume`, `muted`, `input` | the same per zone (whole volume steps)                   |
| `denon/set/<device>/raw`                                     | any protocol line, with `--raw-set` only                 |

The status follows from the receiver's answer, not from the command.

## Home Assistant

Discovery is on by default (`--no-ha-discovery` turns it off and clears it). Every receiver is
a device with power and main zone switches, a volume slider, a mute switch, input and sound mode
selects, and the same per extra zone. The select options come from `--inputs` and
`--sound-modes`: set them to the codes your model has (the receiver's own list shows in the
`input` and `sound_mode` topics when you change them on the remote).

## Options

Run `denon2mqtt --help` for the full list; every option is also an environment variable
(`DENON2MQTT_DEVICES`, …), see `--config-schema`.

| option                 | default          |                                                            |
| ---------------------- | ---------------- | ---------------------------------------------------------- |
| `--devices`, `-d`      |                  | `<name>=<host>[:<port>],...` (required)                    |
| `--zones`              | `2`              | `1`, `2` or `3`                                            |
| `--poll-interval`      | `60`             | seconds between full state queries (`0` = at connect only) |
| `--reconnect-interval` | `10`             | seconds between connection attempts                        |
| `--volume-max`         | `98`             | the highest volume a command sends                         |
| `--inputs`             | the common codes | the input codes offered to Home Assistant                  |
| `--sound-modes`        | the common codes | the sound mode codes offered to Home Assistant             |
| `--raw-set`            | off              | accept `set/<device>/raw`                                  |

Shared options: `--mqtt-url/-u`, `--mqtt-username`, `--mqtt-password`, `--mqtt-tls-ca`, `--name/-n`,
`--json-payloads`, `--ha-discovery`, `--ha-prefix`, `--maintenance`, `--stats-interval`,
`--verbosity/-v`, `--install`, `--uninstall`, `--config-schema`.

## License

MIT
