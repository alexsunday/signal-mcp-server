
import { initMcpServer } from './mcp';
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import {SignalClient} from './signal-client';

async function main() {
  const c1 = new SignalClient({host: '127.0.0.1', port: 7583});
  await c1.connect();

  const server = initMcpServer(c1);
  await server.connect(new StdioServerTransport());
}

main();
