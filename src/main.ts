
import { initMcpServer } from './mcp';
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import {SignalClient} from './signal-client';

async function main() {
  const c1 = new SignalClient();
  await c1.connect();

  const server = initMcpServer(c1);
  await server.connect(new StdioServerTransport());
}

main();
