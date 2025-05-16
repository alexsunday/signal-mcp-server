import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { z } from 'zod';
import { contactType, updateContactArgumentsType } from './types';
import { logger } from './logger';

type resolveFn<T> = (value: T | PromiseLike<T>) => void;
type rejectFn = (reason?: unknown) => void;
export default class Defered<T=unknown> {
  private _promise: Promise<T>|null = null;
  private _resolve: resolveFn<T> |null = null;
  private _reject: rejectFn|null = null;

  constructor() {
    this._promise = new Promise<T>((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
  }

  get promise() {
    if(!this._promise) {
      throw new Error('Defered not initialize correctly.');
    }
    return this._promise;
  }

  get resolve() {
    if(!this._resolve) {
      throw new Error('Defered not initialize correctly.');
    }
    return this._resolve;
  }

  get reject() {
    if(!this._reject) {
      throw new Error('Defered not initialize correctly.');
    }
    return this._reject;
  }
}

export type JSONRPCRequest = {
  jsonrpc: "2.0"
  method: string;
  params?: unknown;
  id: number;
}

const jsonRpcResponseSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.number(),
  result: z.unknown().optional(),
  error: z.object({
    code: z.number(),
    message: z.string(),
    data: z.unknown().optional(),
  }).optional(),
});
export type JSONRPCResponse = z.infer<typeof jsonRpcResponseSchema>;

type ServerIpcAddrType = string;
type ServerTcpAddrType = {
  host: string;
  port: number;
};
type ServerAddrType = ServerIpcAddrType | ServerTcpAddrType;
export class SignalClient {
  private addr: ServerAddrType;
  private socket: net.Socket | null = null;
  private pendingRequests: Map<number, Defered<JSONRPCResponse>> = new Map();
  private requestId = 0;
  private autoreconnect = true;
  private buf = "";

  constructor(addr?: ServerAddrType) {
    if(!addr) {
      this.addr = path.join(os.tmpdir(), 'signal-cli', 'socket');
    } else {
      this.addr = addr;
    }
  }

  public async close() {
    this.autoreconnect = false;
    if(this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.pendingRequests.forEach((defered) => {
      defered.reject(new Error('Connection closed'));
    });
    this.pendingRequests.clear();
  }

  public async connect() {
    if(!this.addr) {
      throw new Error('No address provided');
    }
    if(typeof this.addr === 'string') {
      return this.connectIpc(this.addr);
    }
    return this.connectTcp(this.addr.port, this.addr.host);
  }

  public async connectTcp(port: number, host: string) {
    return new Promise<boolean>((resolve, reject) => {
      if(this.socket) {
        reject(new Error('socket initialized twice'));
        return;
      }
      this.socket = net.createConnection(port, host, () => {
        logger.info('Connected to server via tcp' + host + ':' + port);
        resolve(true);
      });
      this.connectSocket(this.socket, reject);
    });
  }

  private async connectIpc(ipc: string) {
    return new Promise<boolean>((resolve, reject) => {
      if(this.socket) {
        reject(new Error('socket initialized twice'));
        return;
      }
      this.socket = net.createConnection(ipc, () => {
        logger.info('Connected to server via ipc' + ipc);
        resolve(true);
      });
      this.connectSocket(this.socket, reject);
    });
  }

  private async connectSocket(sock: net.Socket, reject: rejectFn) {
    sock.on('error', (err) => {
      logger.error('Connection error:', err);
      reject(err);
    });

    sock.on('data', d => {
      this.onRawData(d);
    })
    sock.on('close', e => {
      logger.info('Connection closed:', e);
      this.onClose();
    });
  }

  private onClose() {
    this.socket = null;
    this.pendingRequests.forEach((defered) => {
      defered.reject(new Error('Connection closed'));
    });
    this.pendingRequests.clear();
    if(this.autoreconnect) {
      logger.info('Connection closed, reconnecting...');
      this.reconnect();
    }
  }

  private reconnect() {
    if(!this.autoreconnect) {
      return;
    }
    setTimeout(() => {
      logger.info('Reconnecting...');
      if(!this.autoreconnect) {
        return;
      }
      this.connect().then(() => {
        logger.info('Reconnected');
      }).catch((err) => {
        logger.error('Reconnect failed:', err);
        this.reconnect();
      });
    }, 100);
  }

  private onRawData(d: Buffer) {
    this.buf += d.toString('utf-8');
    while(true) {
      const match = this.buf.indexOf('\n');
      if(match === -1) {
        break;
      }
      const line = this.buf.slice(0, match);
      this.buf = this.buf.slice(match + 1);
      try {
        this.onData({value: JSON.parse(line)});
      }catch(e) {
        logger.error("json parse failed...");
      }
    }
  }

  private onData(sdata: unknown) {
    logger.info(JSON.stringify(sdata));
    const streamValueSchema = z.object({
      value: z.unknown(),
    });
    const streamRs = streamValueSchema.safeParse(sdata);
    if(!streamRs.success) {
      logger.error('Invalid stream value:', streamRs.error);
      return;
    }
    const d = streamRs.data.value;
    const rs = jsonRpcResponseSchema.safeParse(d);
    if(!rs.success) {
      logger.error('Invalid response:', rs.error);
      return;
    }
    const response = rs.data;
    const id = response.id;
    const defered = this.pendingRequests.get(id);
    if(!defered) {
      logger.error('No pending request for id:', id);
      return;
    }
    this.pendingRequests.delete(id);

    if(response.error) {
      defered.reject(new Error(JSON.stringify(response.error)));
      return;
    }
    defered.resolve(response);
  }

  public async request(req: JSONRPCRequest): Promise<JSONRPCResponse> {
    if(!this.socket) {
      throw new Error('Socket is not initialized');
    }
    if(!this.socket.writable) {
      throw new Error('Socket is not writable');
    }
    if(req.id !== 0) {
      throw new Error('Request id must be 0');
    }
    this.requestId += 1;
    const request: JSONRPCRequest = {
      jsonrpc: "2.0",
      method: req.method,
      params: req.params,
      id: this.requestId
    };
    const defered = new Defered<JSONRPCResponse>();
    this.pendingRequests.set(this.requestId, defered);
    const writeData = JSON.stringify(request) + '\n';
    logger.info(writeData);
    this.socket.write(writeData, (err) => {
      if(err) {
        this.pendingRequests.delete(this.requestId);
        defered.reject(err);
        throw err;
      }
    });
    return defered.promise;
  }

  public listContacts() {
    return this.request({
      id: 0,
      jsonrpc: '2.0',
      method: 'listContacts',
    });
  }

  private checkContact(contact: contactType) {
    if(!contact.username && !contact.number) {
      throw new Error('Either recipient or number must be provided');
    }
    if(contact.username && contact.number) {
      throw new Error('Either recipient or number must be provided, not both');
    }
  }

  private assignContact(contact: contactType) {
    return {
      recipient: contact.number ? [contact.number] : undefined,
      username: contact.username ? [contact.username] : undefined,
    }
  }

  public getUserStatus(contact: contactType) {
    this.checkContact(contact);
    const params = this.assignContact(contact);

    return this.request({
      id: 0,
      jsonrpc: '2.0',
      method: 'getUserStatus',
      params: params,
    });
  }

  public updateContact(number: string, opt: updateContactArgumentsType) {
    return this.request({
      id: 0,
      jsonrpc: '2.0',
      method: 'updateContact',
      params: {
        recipient: number,
        name: opt.name,
        note: opt.note,
        'given-name': opt.givenName,
        'family-name': opt.familyName,
        'nick-given-name': opt.nickGivenName,
        'nick-family-name': opt.nickFamilyName,
      }
    })
  }

  public removeContact(number: string) {
    return this.request({
      id: 0,
      jsonrpc: '2.0',
      method: 'removeContact',
      params: {
        recipient: number,
        forget: true,
      }
    });
  }

  public listIdentities() {
    return this.request({
      id: 0,
      jsonrpc: '2.0',
      method: 'listIdentities',
    });
  }

  public send(contact: contactType, message: string) {
    this.checkContact(contact);
    const contactParams = this.assignContact(contact);
    return this.request({
      id: 0,
      jsonrpc: '2.0',
      method: 'send',
      params: {
        ...contactParams,
        message: message,
      },
    });
  }

  public updateAccount() {
    //
  }

  public version() {
    return this.request({
      id: 0,
      jsonrpc: '2.0',
      method: 'version',
    });
  }
}
