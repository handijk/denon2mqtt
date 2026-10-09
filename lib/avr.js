/**
 * One receiver over telnet: a connection that is kept open (the receiver sends every state
 * change on it) and reconnected, lines split on CR, commands written with a pause between
 * them (the receivers drop commands that come too fast), the full state asked for at connect
 * and every poll interval. The socket factory is injectable for the tests.
 */

import {EventEmitter} from 'node:events';
import net from 'node:net';

const COMMAND_GAP_MS = 60;

export class AvrConnection extends EventEmitter {
    /**
     * @param {object} a
     * @param {string} a.host
     * @param {number} [a.port]
     * @param {string} a.label for log lines
     * @param {object} a.log
     * @param {string[]} a.queries the lines that ask for the full state
     * @param {number} [a.reconnectMs]
     * @param {number} [a.pollMs] 0 = never
     * @param {(opts: {host: string, port: number}) => import('node:net').Socket} [a.createSocket]
     */
    constructor({
        host,
        port = 23,
        label,
        log,
        queries,
        reconnectMs = 10_000,
        pollMs = 60_000,
        createSocket = net.connect,
    }) {
        super();
        this.host = host;
        this.port = port;
        this.label = label;
        this.log = log;
        this.queries = queries;
        this.reconnectMs = reconnectMs;
        this.pollMs = pollMs;
        this.createSocket = createSocket;
        this.socket = null;
        this.connected = false;
        this.stopped = false;
        this.buffer = '';
        this.queue = [];
        this.writing = false;
        this.timer = null;
        this.pollTimer = null;
        this.failures = 0;
    }

    connect() {
        if (this.stopped || this.socket) {
            return;
        }
        let socket;
        try {
            socket = this.createSocket({host: this.host, port: this.port});
        } catch (err) {
            this.log.warn(`${this.label}: ${err.message}`);
            this.lost();
            return;
        }
        this.socket = socket;
        this.buffer = '';
        this.log.debug(`${this.label} < connecting ${this.host}:${this.port}`);
        socket.setEncoding?.('ascii');
        socket.on('connect', () => {
            if (this.socket !== socket) {
                return;
            }
            this.failures = 0;
            this.connected = true;
            this.log.info(`${this.label} connected (${this.host})`);
            this.emit('online');
            this.query();
            this.startPoll();
        });
        socket.on('data', (data) => {
            if (this.socket === socket) {
                this.onData(String(data));
            }
        });
        socket.on('error', (err) => {
            if (this.socket !== socket) {
                return;
            }
            if (this.failures === 0) {
                this.log.warn(`${this.label}: ${err.message}`);
            }
            this.failures++;
            this.lost();
        });
        socket.on('close', () => {
            if (this.socket === socket) {
                this.lost();
            }
        });
    }

    onData(text) {
        this.buffer += text;
        const lines = this.buffer.split(/\r\n?|\n/);
        this.buffer = lines.pop() || '';
        for (const line of lines) {
            if (line.trim()) {
                this.log.debug(`${this.label} < ${line.trim()}`);
                this.emit('line', line.trim());
            }
        }
    }

    lost() {
        const was = this.connected;
        this.close();
        if (was) {
            this.log.info(`${this.label} disconnected`);
        }
        if (this.stopped) {
            return;
        }
        if (was) {
            this.emit('offline');
        }
        this.timer = setTimeout(() => {
            this.timer = null;
            this.connect();
        }, this.reconnectMs);
        this.timer.unref?.();
    }

    close() {
        clearTimeout(this.timer);
        this.timer = null;
        this.stopPoll();
        this.queue = [];
        this.writing = false;
        const socket = this.socket;
        this.socket = null;
        this.connected = false;
        if (socket) {
            try {
                socket.destroy();
            } catch {
                // already gone
            }
        }
    }

    stop() {
        this.stopped = true;
        this.close();
    }

    startPoll() {
        if (this.pollTimer || !(this.pollMs > 0)) {
            return;
        }
        this.pollTimer = setInterval(() => this.query(), this.pollMs);
        this.pollTimer.unref?.();
    }

    stopPoll() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }

    /** Ask for the full state; not again while the previous round is still going out. */
    query() {
        if (!this.connected || this.queue.length > 0) {
            return;
        }
        for (const q of this.queries) {
            this.send(q);
        }
    }

    /** Queue a command line; lines go out one at a time with a pause between them. */
    send(line) {
        if (!this.socket || !this.connected) {
            throw new Error(`${this.label} is not connected`);
        }
        this.queue.push(line);
        this.drain();
    }

    drain() {
        if (this.writing || this.queue.length === 0 || !this.socket) {
            return;
        }
        this.writing = true;
        const line = this.queue.shift();
        this.log.debug(`${this.label} > ${line}`);
        try {
            this.socket.write(`${line}\r`);
        } catch (err) {
            this.log.warn(`${this.label}: write failed: ${err.message}`);
        }
        const t = setTimeout(() => {
            this.writing = false;
            this.drain();
        }, COMMAND_GAP_MS);
        t.unref?.();
    }
}
