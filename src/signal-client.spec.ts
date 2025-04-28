import { expect, test, describe, beforeAll, afterAll } from 'vitest';
import {SignalClient} from './signal-client';

test('add', () => {
  expect(1 + 1).toBe(2);
});

describe('SignalClient', () => {
  let client: SignalClient;
  beforeAll(async () => {
    client = new SignalClient({port: 7583, host: 'localhost'}); 
    await client.connect();
  });

  afterAll(async () => {
    await client.close();
  });

  test('listContacts', async () => {
    const contacts = await client.listContacts();
    expect(contacts).toBeDefined();
    console.log(JSON.stringify(contacts, null, 2));
  });

  test('listIdentities', async () => {
    const identities = await client.listIdentities();
    expect(identities).toBeDefined();
    console.log(JSON.stringify(identities, null, 2));
  });

  test('sendMessage', async () => {
    const response = await client.send('s131.01', 'Hello, world!');
    console.log(JSON.stringify(response, null, 2));
    expect(response.result).toBeDefined();
  }, 30 * 1000);
});
