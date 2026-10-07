'use strict';

// Copies node icons (and codex files) next to the compiled nodes: n8n loads them from dist/.
const fs = require('node:fs');
const path = require('node:path');

for (const node of ['Zono', 'ZonoTrigger']) {
    const source = path.join(__dirname, '..', 'nodes', node);
    const target = path.join(__dirname, '..', 'dist', 'nodes', node);

    fs.mkdirSync(target, { recursive: true });

    for (const file of fs.readdirSync(source)) {
        if (file.endsWith('.svg') || file.endsWith('.png')) {
            fs.copyFileSync(path.join(source, file), path.join(target, file));
        }
    }
}
