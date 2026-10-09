import {test, describe} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';

import {AvrConnection} from '../lib/avr.js';

const log = {info() {}, warn() {}, debug() {}, error() {}};

class FakeSocket extends EventEmitter {
    constructor(world) {
        super();
        this.world = world;
        this.written = [];
        world.sockets.push(this);
        if (world.refuse) {
            setImmediate(() => this.emit('error', new Error('ECONNREFUSED')));
        } else {
            setImmediate(() => this.emit('connect'));
        }
    }
    setEncoding() {}
    write(s) {
        this.written.push(s);
        this.world.written.push(s);
    }
    destroy() {
        this.destroyed = true;
    }
}

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

function connection(world, extra = {}) {
    const events = [];
    const c = new AvrConnection({
        host: '10.0.0.1',
        label: 'avr',
        log,
        queries: ['PW?', 'MV?'],
        reconnectMs: 10,
        pollMs: 0,
        createSocket: () => new FakeSocket(world),
        ...extra,
    });
    for (const ev of ['online', 'offline', 'line']) {
        c.on(ev, (p) => events.push([ev, p]));
    }
    return {c, events};
}

describe('receiver connection', () => {
    test('connects, asks for the state with a pause between the lines, splits what comes back', async () => {
        const world = {sockets: [], written: [], refuse: false};
        const {c, events} = connection(world);
        c.connect();
        await tick();
        assert.equal(c.connected, true);
        assert.deepEqual(events[0], ['online', undefined]);
        assert.deepEqual(world.written, ['PW?\r'], 'one line at a time');
        await tick(70);
        assert.deepEqual(world.written, ['PW?\r', 'MV?\r']);
        world.sockets[0].emit('data', 'PWON\rMV3');
        world.sockets[0].emit('data', '85\rMVMAX 98\r\n');
        assert.deepEqual(
            events.filter((e) => e[0] === 'line').map((e) => e[1]),
            ['PWON', 'MV385', 'MVMAX 98'],
        );
        c.stop();
        assert.equal(world.sockets[0].destroyed, true);
    });

    test('a closed connection comes back, a refused one keeps trying quietly, a stopped one does not', async () => {
        const world = {sockets: [], written: [], refuse: false};
        const {c, events} = connection(world);
        c.connect();
        await tick();
        world.sockets[0].emit('close');
        assert.equal(c.connected, false);
        assert.equal(events.at(-1)[0], 'offline');
        await tick(30);
        assert.equal(world.sockets.length, 2);
        assert.equal(c.connected, true);
        c.stop();
        await tick(30);
        assert.equal(world.sockets.length, 2, 'no reconnect after stop');

        const refused = {sockets: [], written: [], refuse: true};
        const {c: c2, events: e2} = connection(refused);
        c2.connect();
        await tick(60);
        assert.ok(refused.sockets.length >= 3);
        assert.equal(e2.length, 0);
        c2.stop();
    });

    test('a command needs a connection; the poll asks again', async () => {
        const world = {sockets: [], written: [], refuse: false};
        const {c} = connection(world, {pollMs: 40});
        assert.throws(() => c.send('PWON'), /not connected/);
        c.connect();
        await tick(150);
        const queries = world.written.filter((w) => w === 'PW?\r').length;
        assert.ok(queries >= 2, `polled: ${queries}`);
        c.send('MV40');
        await tick(250);
        assert.ok(world.written.includes('MV40\r'));
        c.stop();
    });
});
