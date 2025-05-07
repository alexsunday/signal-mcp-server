import { expect, test, describe, beforeAll, afterAll } from 'vitest';
import { SignalClient } from './signal-client';
import { SignalCliMcpServer } from './mcp';

describe('SignalClient', () => {
  let server: SignalCliMcpServer;
  beforeAll(async () => {
    const client = new SignalClient({ port: 7583, host: 'localhost' });
    await client.connect();
    server = new SignalCliMcpServer(client);
  });
  afterAll(async () => {
    await server.close();
  });

  test('getUserStatus', async () => {
    const rs = await server.getUserStatus(({number: '+8613322222222'}));
    console.log(JSON.stringify(rs, null, 2));
    expect(rs).toBeDefined();
  });
});
