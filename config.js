import {parseConfig} from 'mqtt-interfaces-core';
import pkg from './package.json' with {type: 'json'};

export const DEFAULT_INPUTS = 'CBL/SAT,DVD,BD,GAME,AUX1,AUX2,MPLAY,TV,TUNER,PHONO,CD,NET,BT,USB/IPOD';
export const DEFAULT_SOUND_MODES =
    'STEREO,DIRECT,PURE DIRECT,MOVIE,MUSIC,GAME,AUTO,DOLBY DIGITAL,DTS SURROUND,MCH STEREO,VIRTUAL';

export const OPTIONS = {
    devices: {
        alias: 'd',
        type: 'string',
        describe: 'receivers to connect to, as <name>=<host>[:<port>],... (the name becomes the topic level)',
        demandOption: true,
    },
    zones: {
        type: 'number',
        describe: 'zones to report and control: 1 (main only), 2 or 3',
        choices: [1, 2, 3],
        default: 2,
    },
    'poll-interval': {
        type: 'number',
        describe: 'seconds between full state queries (the receiver pushes changes in between; 0 = only at connect)',
        default: 60,
    },
    'reconnect-interval': {
        type: 'number',
        describe: 'seconds between connection attempts to a receiver that is gone',
        default: 10,
    },
    'volume-max': {
        type: 'number',
        describe: 'the highest volume the set/.../volume command sends',
        default: 98,
    },
    inputs: {
        type: 'string',
        describe: 'input source codes offered to home assistant, comma separated (the SI codes of the model)',
        default: DEFAULT_INPUTS,
    },
    'sound-modes': {
        type: 'string',
        describe: 'sound modes offered to home assistant, comma separated (the MS codes of the model)',
        default: DEFAULT_SOUND_MODES,
    },
    'raw-set': {
        type: 'boolean',
        describe: 'accept set/<device>/raw with any protocol command (off: a security surface)',
        default: false,
    },
};

export default parseConfig({
    pkg,
    options: OPTIONS,
    defaults: {name: 'denon'},
    examples: [
        ['$0 -u mqtt://broker -d living_room=192.168.1.30', 'one receiver, run in the foreground'],
        [
            'sudo $0 --install -n denon -u mqtt://broker -d living_room=192.168.1.30',
            'install as service denon2mqtt@denon',
        ],
    ],
});
