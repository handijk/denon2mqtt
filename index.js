#!/usr/bin/env node
/**
 * denon2mqtt — Denon and Marantz AV receivers (the telnet protocol on port 23) to MQTT.
 *
 * One connection per receiver, kept open: the receiver sends every state change on it, so
 * power, volume, mute, input and sound mode are retained status items the moment they change,
 * for the main zone and the extra zones. Commands set them.
 */

import {createAdapter} from 'mqtt-interfaces-core';
import config from './config.js';
import pkg from './package.json' with {type: 'json'};
import {handle as handleInstall} from './lib/install.js';
import {AvrConnection} from './lib/avr.js';
import {AvrBridge} from './lib/bridge.js';
import {parsePinned} from './lib/devices.js';
import {discoveryModel} from './lib/hadiscovery.js';

handleInstall(config);

let bridge = null;
const devices = parsePinned(config.devices);

const adapter = createAdapter({
    pkg,
    config,
    deviceLabel: 'avr',
    info: () => ({devices: devices.map((d) => d.name), zones: config.zones}),
    discovery: () =>
        discoveryModel({
            name: config.name,
            jsonPayloads: config.jsonPayloads,
            devices: bridge ? bridge.deviceList() : [],
            zones: config.zones,
            volumeMax: config.volumeMax,
            inputs: config.inputs,
            soundModes: config.soundModes,
        }),
    onSet: (parts, value) => bridge.handleSet(parts, value),
    onShutdown: () => bridge.stop(),
});

bridge = new AvrBridge({
    adapter,
    config: {devices, zones: config.zones, volumeMax: config.volumeMax, rawSet: config.rawSet},
    createConnection: (device, queries) =>
        new AvrConnection({
            host: device.host,
            port: device.port,
            label: device.name,
            log: adapter.log,
            queries,
            reconnectMs: config.reconnectInterval * 1000,
            pollMs: config.pollInterval * 1000,
        }),
});

adapter.start();
bridge.start();
