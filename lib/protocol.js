/**
 * The Denon/Marantz telnet protocol (port 23): short ASCII commands ended by CR, the same
 * strings coming back as events whenever the state changes. This module is the item table:
 * a line from the receiver becomes a status item, a set/... topic becomes a command line.
 *
 *   PWON / PWSTANDBY        the unit            power
 *   ZMON / ZMOFF            the main zone       main_power
 *   MV38 / MV385 / MVMAX 98 volume, half steps  volume, volume_max
 *   MUON / MUOFF            mute                muted
 *   SIMPLAY                 input source        input
 *   SVOFF                   video source        video_input
 *   MSSTEREO                sound mode          sound_mode
 *   Z2ON / Z2OFF / Z250 / Z2NET / Z2MUON        zone2/power, volume, input, muted (Z3 alike)
 *
 * Pure functions.
 */

import {toBoolean} from 'mqtt-interfaces-core';

export const QUERIES = {
    1: ['PW?', 'ZM?', 'MV?', 'MU?', 'SI?', 'SV?', 'MS?'],
    2: ['PW?', 'ZM?', 'MV?', 'MU?', 'SI?', 'SV?', 'MS?', 'Z2?', 'Z2MU?'],
    3: ['PW?', 'ZM?', 'MV?', 'MU?', 'SI?', 'SV?', 'MS?', 'Z2?', 'Z2MU?', 'Z3?', 'Z3MU?'],
};

/** "38" → 38, "385" → 38.5 (a third digit is the half step). */
export function parseVolume(digits) {
    if (!/^\d{2,3}$/.test(digits)) {
        return null;
    }
    return digits.length === 3 ? Number(digits.slice(0, 2)) + Number(digits[2]) / 10 : Number(digits);
}

/** 38 → "38", 38.5 → "385", 7 → "07"; clamped to 0..max, rounded to half steps. */
export function formatVolume(value, max = 98) {
    const n = Math.max(0, Math.min(max, Math.round(Number(value) * 2) / 2));
    const whole = Math.floor(n);
    const base = String(whole).padStart(2, '0');
    return n - whole >= 0.5 ? `${base}5` : base;
}

/**
 * One line from the receiver → {item, value}, or null for lines that are not items (PS..., NS...).
 * Zone items are `zone2/<item>`; the main zone's are at the top.
 */
export function parseLine(raw) {
    const line = String(raw).trim();
    if (!line) {
        return null;
    }
    let m;
    if ((m = /^PW(ON|STANDBY)$/.exec(line))) {
        return {item: 'power', value: m[1]};
    }
    if ((m = /^ZM(ON|OFF)$/.exec(line))) {
        return {item: 'main_power', value: m[1]};
    }
    if ((m = /^MVMAX\s*(\d{2,3})$/.exec(line))) {
        return {item: 'volume_max', value: parseVolume(m[1])};
    }
    if ((m = /^MV(\d{2,3})$/.exec(line))) {
        return {item: 'volume', value: parseVolume(m[1])};
    }
    if ((m = /^MU(ON|OFF)$/.exec(line))) {
        return {item: 'muted', value: m[1] === 'ON'};
    }
    if ((m = /^SI(.+)$/.exec(line))) {
        return {item: 'input', value: m[1]};
    }
    if ((m = /^SV(.+)$/.exec(line))) {
        return {item: 'video_input', value: m[1]};
    }
    if ((m = /^MS(.+)$/.exec(line))) {
        return {item: 'sound_mode', value: m[1]};
    }
    if ((m = /^Z([23])(.*)$/.exec(line))) {
        const zone = `zone${m[1]}`;
        const rest = m[2];
        if (rest === 'ON' || rest === 'OFF') {
            return {item: `${zone}/power`, value: rest};
        }
        if (rest === 'MUON' || rest === 'MUOFF') {
            return {item: `${zone}/muted`, value: rest === 'MUON'};
        }
        if (/^\d{2,3}$/.test(rest)) {
            return {item: `${zone}/volume`, value: parseVolume(rest)};
        }
        if (/^[A-Z][A-Z0-9/ ]*$/.test(rest) && !/^(CS|CV|HPF|PS|SLP|QUICK|SMART)/.test(rest)) {
            return {item: `${zone}/input`, value: rest};
        }
        return null;
    }
    return null;
}

function onOff(value, item) {
    const on = toBoolean(value);
    if (on === undefined) {
        const v = String(value).trim().toUpperCase();
        if (v === 'STANDBY') {
            return false;
        }
        throw new Error(`${item} must be on or off, not "${value}"`);
    }
    return on;
}

function code(value, item) {
    const v = String(value).trim().toUpperCase();
    if (!/^[A-Z0-9/ .+-]{1,20}$/.test(v)) {
        throw new Error(`${item}: "${value}" is not a source or mode code`);
    }
    return v;
}

/**
 * A command from `set/<device>/<item...>` → the lines to send.
 *
 *   power            on | off | standby          PWON / PWSTANDBY
 *   main_power       on | off                    ZMON / ZMOFF
 *   volume           38.5 | up | down            MV385 / MVUP / MVDOWN
 *   muted            true | false                MUON / MUOFF
 *   input            MPLAY, BD, "CBL/SAT", ...   SIMPLAY
 *   video_input      OFF, BD, ...                SVOFF
 *   sound_mode       STEREO, "PURE DIRECT", ...  MSSTEREO
 *   zone2/power, zone2/volume, zone2/muted, zone2/input     Z2ON, Z250, Z2MUON, Z2NET (zone3 alike)
 *   raw              any line (only with --raw-set)
 *
 * @param {string[]} parts the levels after set/<device>/
 * @param {*} value the parsed payload
 * @param {{volumeMax?: number, rawSet?: boolean}} [options]
 * @returns {string[]}
 */
export function commandLines(parts, value, {volumeMax = 98, rawSet = false} = {}) {
    const path = parts.join('/');
    let zone = '';
    let item = path;
    const z = /^zone([23])\/(.+)$/.exec(path);
    if (z) {
        zone = `Z${z[1]}`;
        item = z[2];
    }
    switch (item) {
        case 'power':
            if (zone) {
                return [`${zone}${onOff(value, path) ? 'ON' : 'OFF'}`];
            }
            return [onOff(value, path) ? 'PWON' : 'PWSTANDBY'];
        case 'main_power':
            if (zone) {
                break;
            }
            return [`ZM${onOff(value, path) ? 'ON' : 'OFF'}`];
        case 'volume': {
            const prefix = zone || 'MV';
            const v = String(value).trim().toLowerCase();
            if (v === 'up' || v === 'down') {
                return [`${prefix}${v.toUpperCase()}`];
            }
            const n = Number(String(value).replace(',', '.'));
            if (!Number.isFinite(n)) {
                throw new Error(`${path}: "${value}" is not a volume`);
            }
            // zones take whole steps only
            return [
                `${prefix}${zone ? formatVolume(Math.round(n), volumeMax).slice(0, 2) : formatVolume(n, volumeMax)}`,
            ];
        }
        case 'muted':
            return [`${zone || ''}MU${onOff(value, path) ? 'ON' : 'OFF'}`];
        case 'input':
            return [`${zone || 'SI'}${code(value, path)}`];
        case 'video_input':
            if (zone) {
                break;
            }
            return [`SV${code(value, path)}`];
        case 'sound_mode':
            if (zone) {
                break;
            }
            return [`MS${code(value, path)}`];
        case 'raw':
            if (!rawSet) {
                throw new Error('raw commands are off (--raw-set turns them on)');
            }
            return [String(value).trim()];
    }
    throw new Error(`unknown item ${path}`);
}
