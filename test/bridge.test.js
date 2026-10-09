import {test, describe} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';

import {AvrBridge} from '../lib/bridge.js';
import {parsePinned, slugify} from '../lib/devices.js';

const log = {info() {}, warn() {}, debug() {}, error() {}};

class FakeConnection extends EventEmitter {
    constructor(device, queries, calls) {
        super();
        this.device = device;
        this.queries = queries;
        this.calls = calls;
    }
    connect() {
        this.calls.push(`${this.device.key}: connect ${this.device.host}:${this.device.port}`);
    }
    send(line) {
        this.calls.push(`${this.device.key}: > ${line}`);
    }
    stop() {
        this.calls.push(`${this.device.key}: stop`);
    }
}

function fakeAdapter() {
    const status = new Map();
    return {
        log,
        status,
        connected: null,
        pubStatus(item, value) {
            status.set(item, value);
        },
        setDeviceConnected(v) {
            this.connected = v;
        },
    };
}

function makeBridge(config = {}) {
    const adapter = fakeAdapter();
    const calls = [];
    const connections = new Map();
    const bridge = new AvrBridge({
        adapter,
        config: {
            devices: parsePinned('living_room=10.0.0.1, kitchen=10.0.0.2:2323'),
            zones: 2,
            volumeMax: 98,
            rawSet: false,
            ...config,
        },
        createConnection: (device, queries) => {
            const c = new FakeConnection(device, queries, calls);
            connections.set(device.key, c);
            return c;
        },
        log,
    });
    return {bridge, adapter, calls, connections};
}

describe('bridge', () => {
    test('pinned receivers connect and their lines become items', () => {
        const {bridge, adapter, calls, connections} = makeBridge();
        bridge.start();
        assert.deepEqual(calls, ['living_room: connect 10.0.0.1:23', 'kitchen: connect 10.0.0.2:2323']);
        assert.equal(adapter.status.get('living_room/online'), false);
        assert.equal(adapter.status.get('kitchen/address'), '10.0.0.2');
        assert.equal(adapter.connected, false);
        assert.deepEqual(connections.get('kitchen').queries, [
            'PW?',
            'ZM?',
            'MV?',
            'MU?',
            'SI?',
            'SV?',
            'MS?',
            'Z2?',
            'Z2MU?',
        ]);
        const lr = connections.get('living_room');
        lr.emit('online');
        assert.equal(adapter.status.get('living_room/online'), true);
        assert.equal(adapter.connected, true);
        lr.emit('line', 'PWON');
        lr.emit('line', 'MV385');
        lr.emit('line', 'PSBAS 50');
        lr.emit('line', 'Z2NET');
        assert.equal(adapter.status.get('living_room/power'), 'ON');
        assert.equal(adapter.status.get('living_room/volume'), 38.5);
        assert.equal(adapter.status.get('living_room/zone2/input'), 'NET');
        assert.equal(adapter.status.has('living_room/PSBAS'), false);
        lr.emit('offline');
        assert.equal(adapter.connected, false);
        assert.deepEqual(
            bridge.deviceList().map((d) => [d.key, d.name, d.online]),
            [
                ['living_room', 'living_room', false],
                ['kitchen', 'kitchen', false],
            ],
        );
    });

    test('commands become protocol lines on the right receiver', async () => {
        const {bridge, calls} = makeBridge();
        bridge.start();
        await bridge.handleSet(['kitchen', 'power'], 'on');
        await bridge.handleSet(['living_room', 'volume'], 40.5);
        await bridge.handleSet(['living_room', 'zone2', 'input'], 'net');
        assert.deepEqual(calls.slice(2), ['kitchen: > PWON', 'living_room: > MV405', 'living_room: > Z2NET']);
        await assert.rejects(bridge.handleSet(['garage', 'power'], 'on'), /unknown device/);
        await assert.rejects(bridge.handleSet(['kitchen', 'raw'], 'PWON'), /--raw-set/);
        bridge.stop();
        assert.ok(calls.includes('kitchen: stop'));
    });

    test('slugs and the device list', () => {
        assert.equal(slugify('Denon AVR-X2500H'), 'denon_avr_x2500h');
        assert.deepEqual(parsePinned('a=1.2.3.4'), [{name: 'a', host: '1.2.3.4', port: 23}]);
        assert.throws(() => parsePinned('1.2.3.4'), /not <name>=<host>/);
    });
});
