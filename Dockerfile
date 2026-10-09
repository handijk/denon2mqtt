FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
# --ignore-scripts: no native add-ons are needed
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY index.js config.js ./
COPY lib/ ./lib/

# config only via environment (DENON2MQTT_*, see README), e.g.
#   -e DENON2MQTT_DEVICES=living_room=192.168.1.30 -e DENON2MQTT_MQTT_URL=mqtt://broker
ENV NODE_ENV=production \
    DENON2MQTT_MQTT_URL=mqtt://localhost \
    DENON2MQTT_NAME=denon \
    DENON2MQTT_VERBOSITY=info

USER node

ENTRYPOINT ["node", "index.js"]
