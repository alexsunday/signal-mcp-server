import { expect, test, describe, beforeAll, afterAll } from 'vitest';
import { SignalClient } from './signal-client';
import { SignalCliMcpServer } from './mcp';

test('add', () => {
  expect(1 + 1).toBe(2);
});

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

  test('getUserStatusByPhone', async () => {
    const rs = await server.getUserStatus(({number: '+8613322222222'}));
    console.log(JSON.stringify(rs, null, 2));
    expect(rs).toBeDefined();
  });

  test('getUserStatusByUsername', async () => {
    const rs = await server.getUserStatus(({username: 's131.01'}));
    console.log(JSON.stringify(rs, null, 2));
    expect(rs).toBeDefined();
  });

  test('listContacts', async () => {
    const rs = await server.listContacts();
    console.log(JSON.stringify(rs, null, 2));
    expect(rs).toBeDefined();
  });

  test('updateContact', async () => {
    const rs = await server.updateContact('+8613111111111', {name: '', givenName: '', familyName: '', note: '', nickGivenName: '', nickFamilyName: ''});
    console.log(JSON.stringify(rs, null, 2));
    expect(rs).toBeDefined();
  });
});
