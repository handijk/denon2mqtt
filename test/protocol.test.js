import {test, describe} from 'node:test';
import assert from 'node:assert/strict';

import {commandLines, formatVolume, parseLine, parseVolume, QUERIES} from '../lib/protocol.js';

describe('lines from the receiver', () => {
    test('what an AVR-X2500H answers to the full query', () => {
        // the answers to PW? MV? MU? SI? MS? Z2? Z2MU? on 2026-10-09
        const answers = [
            'PWSTANDBY',
            'MV38',
            'MVMAX 98',
            'MUOFF',
            'SIMPLAY',
            'SVOFF',
            'MSSTEREO',
            'PSDRC OFF',
            'PSLFE 00',
            'PSBAS 50',
            'PSTRE 50',
            'PSTONE CTRL OFF',
            'Z2OFF',
            'Z2NET',
            'Z250',
            'SVOFF',
            'Z2MUOFF',
        ];
        const items = answers.map(parseLine).filter(Boolean);
        assert.deepEqual(items, [
            {item: 'power', value: 'STANDBY'},
            {item: 'volume', value: 38},
            {item: 'volume_max', value: 98},
            {item: 'muted', value: false},
            {item: 'input', value: 'MPLAY'},
            {item: 'video_input', value: 'OFF'},
            {item: 'sound_mode', value: 'STEREO'},
            {item: 'zone2/power', value: 'OFF'},
            {item: 'zone2/input', value: 'NET'},
            {item: 'zone2/volume', value: 50},
            {item: 'video_input', value: 'OFF'},
            {item: 'zone2/muted', value: false},
        ]);
    });

    test('half steps, the main zone, noise', () => {
        assert.deepEqual(parseLine('MV385'), {item: 'volume', value: 38.5});
        assert.deepEqual(parseLine('MV05'), {item: 'volume', value: 5});
        assert.deepEqual(parseLine('ZMON'), {item: 'main_power', value: 'ON'});
        assert.deepEqual(parseLine('MSPURE DIRECT'), {item: 'sound_mode', value: 'PURE DIRECT'});
        assert.deepEqual(parseLine('SICBL/SAT'), {item: 'input', value: 'CBL/SAT'});
        assert.deepEqual(parseLine('Z3ON'), {item: 'zone3/power', value: 'ON'});
        assert.deepEqual(parseLine('Z2MUON'), {item: 'zone2/muted', value: true});
        assert.deepEqual(parseLine('Z2CVFL 50'), null);
        assert.equal(parseLine('NSE1Now Playing'), null);
        assert.equal(parseLine('CVFL 50'), null);
        assert.equal(parseLine(''), null);
        assert.equal(parseVolume('9'), null);
    });
});

describe('volumes', () => {
    test('format for the wire', () => {
        assert.equal(formatVolume(38), '38');
        assert.equal(formatVolume(38.5), '385');
        assert.equal(formatVolume(38.3), '385');
        assert.equal(formatVolume(7), '07');
        assert.equal(formatVolume(120), '98');
        assert.equal(formatVolume(-3), '00');
        assert.equal(formatVolume(60, 50), '50');
    });
});

describe('commands', () => {
    test('the main zone', () => {
        assert.deepEqual(commandLines(['power'], 'on'), ['PWON']);
        assert.deepEqual(commandLines(['power'], 'standby'), ['PWSTANDBY']);
        assert.deepEqual(commandLines(['power'], false), ['PWSTANDBY']);
        assert.deepEqual(commandLines(['main_power'], 'off'), ['ZMOFF']);
        assert.deepEqual(commandLines(['volume'], 38.5), ['MV385']);
        assert.deepEqual(commandLines(['volume'], '40'), ['MV40']);
        assert.deepEqual(commandLines(['volume'], 'up'), ['MVUP']);
        assert.deepEqual(commandLines(['volume'], 99, {volumeMax: 70}), ['MV70']);
        assert.deepEqual(commandLines(['muted'], true), ['MUON']);
        assert.deepEqual(commandLines(['input'], 'cbl/sat'), ['SICBL/SAT']);
        assert.deepEqual(commandLines(['video_input'], 'off'), ['SVOFF']);
        assert.deepEqual(commandLines(['sound_mode'], 'pure direct'), ['MSPURE DIRECT']);
        assert.throws(() => commandLines(['power'], 'maybe'), /on or off/);
        assert.throws(() => commandLines(['volume'], 'loud'), /not a volume/);
        assert.throws(() => commandLines(['input'], 'MPLAY\r\nPWON'), /not a source/);
        assert.throws(() => commandLines(['colour'], 1), /unknown item/);
    });

    test('the zones take whole steps and have no sound mode', () => {
        assert.deepEqual(commandLines(['zone2', 'power'], 'on'), ['Z2ON']);
        assert.deepEqual(commandLines(['zone2', 'volume'], 45.5), ['Z246']);
        assert.deepEqual(commandLines(['zone2', 'volume'], 'down'), ['Z2DOWN']);
        assert.deepEqual(commandLines(['zone3', 'muted'], 'off'), ['Z3MUOFF']);
        assert.deepEqual(commandLines(['zone2', 'input'], 'net'), ['Z2NET']);
        assert.throws(() => commandLines(['zone2', 'sound_mode'], 'STEREO'), /unknown item/);
        assert.throws(() => commandLines(['zone4', 'power'], 'on'), /unknown item/);
    });

    test('raw is off unless asked for', () => {
        assert.throws(() => commandLines(['raw'], 'PWON'), /--raw-set/);
        assert.deepEqual(commandLines(['raw'], ' PSBAS 55 ', {rawSet: true}), ['PSBAS 55']);
    });

    test('the query sets', () => {
        assert.equal(QUERIES[1].length, 7);
        assert.ok(QUERIES[2].includes('Z2?') && !QUERIES[2].includes('Z3?'));
        assert.ok(QUERIES[3].includes('Z3MU?'));
    });
});
