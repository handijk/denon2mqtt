import {test, describe} from 'node:test';
import assert from 'node:assert/strict';

import {discoveryModel} from '../lib/hadiscovery.js';

describe('home assistant discovery', () => {
    const devices = [{key: 'living_room', name: 'Living Room', host: '10.0.0.1'}];

    test('a receiver with its main zone and zone 2', () => {
        const [d] = discoveryModel({name: 'denon', devices, inputs: 'MPLAY,BD', soundModes: 'STEREO,MOVIE'});
        assert.equal(d.id, 'denon2mqtt_denon_living_room');
        assert.equal(d.device.name, 'Living Room');
        assert.equal(d.availability[1].t, 'denon/status/living_room/online');
        assert.equal(d.components.power.p, 'switch');
        assert.equal(d.components.power.cmd_t, 'denon/set/living_room/power');
        assert.equal(d.components.power.pl_off, 'standby');
        assert.equal(d.components.power.stat_off, 'STANDBY');
        assert.equal(d.components.main_power.stat_off, 'OFF');
        assert.equal(d.components.volume.max, 98);
        assert.equal(d.components.volume.step, 0.5);
        assert.deepEqual(d.components.input.ops, ['MPLAY', 'BD']);
        assert.deepEqual(d.components.sound_mode.ops, ['STEREO', 'MOVIE']);
        assert.equal(d.components.zone2_power.cmd_t, 'denon/set/living_room/zone2/power');
        assert.equal(d.components.zone2_volume.step, 1);
        assert.equal(d.components.zone2_input.stat_t, 'denon/status/living_room/zone2/input');
        assert.equal(d.components.zone3_power, undefined);
    });

    test('zones 1 and 3, the volume limit', () => {
        const [one] = discoveryModel({name: 'denon', devices, zones: 1, volumeMax: 70});
        assert.equal(one.components.zone2_power, undefined);
        assert.equal(one.components.volume.max, 70);
        const [three] = discoveryModel({name: 'denon', devices, zones: 3});
        assert.equal(three.components.zone3_input.cmd_t, 'denon/set/living_room/zone3/input');
    });
});
