/** The receivers from `--devices`, and the topic level of a name. */

export function slugify(name) {
    return (
        String(name)
            .toLowerCase()
            .replace(/[^\p{L}\p{N}]+/gu, '_')
            .replace(/^_+|_+$/g, '') || 'receiver'
    );
}

/** `name=host[:port],name2=host2` → [{name, host, port}] */
export function parsePinned(spec, defaultPort = 23) {
    if (!spec) {
        return [];
    }
    return String(spec)
        .split(/[,\s]+/)
        .filter(Boolean)
        .map((entry) => {
            const eq = entry.indexOf('=');
            if (eq <= 0) {
                throw new Error(`--devices: "${entry}" is not <name>=<host>`);
            }
            const name = entry.slice(0, eq);
            const [host, port] = entry.slice(eq + 1).split(':');
            if (!host) {
                throw new Error(`--devices: "${entry}" has no host`);
            }
            return {name, host, port: port ? Number(port) : defaultPort};
        });
}
