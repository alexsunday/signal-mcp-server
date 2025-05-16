const { build } = require('esbuild');
const path = require('path');

// esbuild src/main.ts --bundle --banner:js='#!/usr/bin/env node' --platform=node --sourcemap=inline --target=node18 --outfile=dist/signal-mcp-server.js
build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  outfile: 'dist/signal-mcp-server.js',
  platform: 'node',
  minify: true,
  target: 'node18',
  banner: { js: '#!/usr/bin/env node\n' },
}).catch(e => {
  console.error(e);
  process.exit(1);
});
