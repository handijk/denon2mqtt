/**
 * The bridge: the receivers from --devices, one connection each, their lines as status items
 * under `status/<device>/...`, the commands from `set/<device>/...`. MQTT only through the
 * adapter, the connection through a factory, so a test runs it with fakes.
 */

import {commandLines, parseLine, QUERIES} from './protocol.js';
import {slugify} from './devices.js';

export class AvrBridge {
    /**
     * @param {object} a
     * @param {object} a.adapter from createAdapter (log, pubStatus, setDeviceConnected)
     * @param {object} a.config devices (parsed: [{name, host, port}]), zones, volumeMax, rawSet
     * @param {(device: {key: string, name: string, host: string, port: number}, queries: string[]) => import('./avr.js').AvrConnection} a.createConnection
     * @param {object} [a.log]
     */
    constructor({adapter, config, createConnection, log}) {
        this.adapter = adapter;
        this.config = config;
        this.createConnection = createConnection;
        this.log = log || adapter.log;
        this.devices = new Map(); // key → {key, name, host, port, connection, online}
    }

    deviceList() {
        return [...this.devices.values()].map(({key, name, host, online}) => ({key, name, host, online}));
    }

    start() {
        const queries = QUERIES[this.config.zones] || QUERIES[2];
        for (const pinned of this.config.devices) {
            const key = slugify(pinned.name);
            if (this.devices.has(key)) {
                this.log.warn(`two receivers would share the topic ${key}; the second is skipped`);
                continue;
            }
            const device = {
                key,
                name: pinned.name,
                host: pinned.host,
                port: pinned.port,
                online: false,
                connection: null,
            };
            device.connection = this.createConnection(device, queries);
            this.devices.set(key, device);
            this.wire(device);
            this.adapter.pubStatus(`${key}/online`, false);
            this.adapter.pubStatus(`${key}/address`, device.host);
            this.log.info(`receiver "${device.name}" at ${device.host}:${device.port} → ${key}`);
            device.connection.connect();
        }
        this.updateConnected();
    }

    wire(device) {
        const {key, connection} = device;
        connection.on('online', () => {
            device.online = true;
            this.adapter.pubStatus(`${key}/online`, true);
            this.updateConnected();
        });
        connection.on('offline', () => {
            device.online = false;
            this.adapter.pubStatus(`${key}/online`, false);
            this.updateConnected();
        });
        connection.on('line', (line) => {
            const parsed = parseLine(line);
            if (parsed) {
                this.adapter.pubStatus(`${key}/${parsed.item}`, parsed.value);
            }
        });
    }

    updateConnected() {
        this.adapter.setDeviceConnected([...this.devices.values()].some((d) => d.online));
    }

    /** `set/<device>/<item...>` */
    async handleSet(parts, value) {
        const [key, ...rest] = parts;
        const device = this.devices.get(key);
        if (!device) {
            throw new Error(`unknown device ${key}`);
        }
        const lines = commandLines(rest, value, {volumeMax: this.config.volumeMax, rawSet: this.config.rawSet});
        for (const line of lines) {
            device.connection.send(line);
        }
        this.log.info(`${device.name}: ${rest.join('/')} ${JSON.stringify(value)} → ${lines.join(' ')}`);
    }

    stop() {
        for (const device of this.devices.values()) {
            device.connection.stop();
        }
    }
}
