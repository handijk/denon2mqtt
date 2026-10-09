import {createInstaller} from 'mqtt-interfaces-core';

export const SERVICE = 'denon2mqtt';
export const ENV_PREFIX = 'DENON2MQTT';

const installer = createInstaller({
    service: SERVICE,
    envPrefix: ENV_PREFIX,
    description: `${SERVICE} %i - Denon/Marantz AV receiver to MQTT bridge`,
    documentation: 'https://github.com/handijk/denon2mqtt',
    serviceExtra: [],
});

export const {unitFile, envFile, installService, uninstallService, handle} = installer;
