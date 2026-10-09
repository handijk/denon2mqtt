/**
 * Home Assistant discovery: every receiver as a device with power, volume, mute, input and
 * sound mode for the main zone, and power, volume, mute and input per extra zone. Pure.
 */

import {availability, discoveryId, entity} from 'mqtt-interfaces-core';

const ADAPTER = 'denon2mqtt';

const list = (s) =>
    String(s || '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);

/**
 * @param {object} m
 * @param {string} m.name instance name / topic prefix
 * @param {boolean} m.jsonPayloads
 * @param {Array<{key: string, name: string, host?: string}>} m.devices
 * @param {number} [m.zones]
 * @param {number} [m.volumeMax]
 * @param {string} [m.inputs] comma separated
 * @param {string} [m.soundModes] comma separated
 */
export function discoveryModel({
    name,
    jsonPayloads = true,
    devices = [],
    zones = 2,
    volumeMax = 98,
    inputs,
    soundModes,
}) {
    const base = discoveryId(ADAPTER, name);
    const inputOptions = list(inputs);
    const modeOptions = list(soundModes);
    return devices.map((device) => {
        const id = `${base}_${device.key}`;
        const e = (item, platform, label, more = {}) =>
            entity({id, name, item: `${device.key}/${item}`, platform, label, jsonPayloads, ...more});
        const onOff = (item, label, icon, more = {}) =>
            e(item, 'switch', label, {
                command: true,
                icon,
                extra: {pl_on: 'on', pl_off: 'off', stat_on: 'ON', stat_off: 'OFF', ...more},
            });
        const components = {
            power: onOff('power', 'Power', 'mdi:power', {pl_off: 'standby', stat_off: 'STANDBY'}),
            main_power: onOff('main_power', 'Main zone', 'mdi:speaker'),
            volume: e('volume', 'number', 'Volume', {
                command: true,
                icon: 'mdi:volume-high',
                extra: {min: 0, max: volumeMax, step: 0.5, mode: 'slider'},
            }),
            muted: e('muted', 'switch', 'Mute', {
                command: true,
                icon: 'mdi:volume-off',
                extra: {pl_on: 'true', pl_off: 'false', stat_on: true, stat_off: false},
            }),
            input: e('input', 'select', 'Input', {command: true, icon: 'mdi:import', extra: {ops: inputOptions}}),
            sound_mode: e('sound_mode', 'select', 'Sound mode', {
                command: true,
                icon: 'mdi:surround-sound',
                extra: {ops: modeOptions},
            }),
            address: e('address', 'sensor', 'Address', {category: 'diagnostic', icon: 'mdi:ip-network'}),
        };
        for (let z = 2; z <= zones; z++) {
            const zone = `zone${z}`;
            components[`${zone}_power`] = onOff(`${zone}/power`, `Zone ${z}`, 'mdi:speaker-multiple');
            components[`${zone}_volume`] = e(`${zone}/volume`, 'number', `Zone ${z} volume`, {
                command: true,
                icon: 'mdi:volume-high',
                extra: {min: 0, max: volumeMax, step: 1, mode: 'slider'},
            });
            components[`${zone}_muted`] = e(`${zone}/muted`, 'switch', `Zone ${z} mute`, {
                command: true,
                icon: 'mdi:volume-off',
                extra: {pl_on: 'true', pl_off: 'false', stat_on: true, stat_off: false},
            });
            components[`${zone}_input`] = e(`${zone}/input`, 'select', `Zone ${z} input`, {
                command: true,
                icon: 'mdi:import',
                extra: {ops: inputOptions},
            });
        }
        return {
            id,
            device: {mf: 'Denon / Marantz', name: device.name},
            availability: [
                ...availability(name, 1),
                {
                    t: `${name}/status/${device.key}/online`,
                    avty_tpl: jsonPayloads
                        ? "{{ 'online' if value_json.val else 'offline' }}"
                        : "{{ 'online' if value == 'true' else 'offline' }}",
                },
            ],
            components,
        };
    });
}
