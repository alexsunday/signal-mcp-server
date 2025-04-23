import * as net from 'net';
// import split2 from 'split2';
// import {chain} from 'stream-chain';
// import {parser} from 'stream-json';
// import StreamValues from 'stream-json/streamers/StreamValues';
import { z } from 'zod';
import winston from 'winston';
const logger = winston.createLogger({
  level: 'info', 
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.simple()
  ),
  transports: [
    new winston.transports.File({
      filename: 'run.log'
    }),
  ]
});

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

export class SignalClient {
  private url = "127.0.0.1:7583"
  private socket: net.Socket | null = null;
  private pendingRequests: Map<number, Defered<JSONRPCResponse>> = new Map();
  private requestId = 0;
  private autoreconnect = true;
  private buf = "";

  constructor(url?: string) {
    if(url) {
      this.url = url;
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
    return new Promise((resolve, reject) => {
      this.socket = new net.Socket();
      this.socket.connect(7583, '127.0.0.1', () => {
        logger.info('Connected to server');
        resolve(true);
      });

      this.socket.on('error', (err) => {
        logger.error('Connection error:', err);
        reject(err);
      });

      // const pipeline = chain([
      //   this.socket,
      //   split2(),
      //   parser(),
      //   new StreamValues(),
      // ]);
      // pipeline.on('data', d => {
      //   this.onData(d);
      // });
      this.socket.on('data', d => {
        this.onRawData(d);
      })
      this.socket.on('close', e => {
        this.onClose(e);
      });
    });
  }

  private onClose(e: boolean) {
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

  public listIdentities() {
    return this.request({
      id: 0,
      jsonrpc: '2.0',
      method: 'listIdentities',
    });
  }

  // {"jsonrpc":"2.0","method":"send","params":{"recipient":["+YYY"],"message":"MESSAGE"},"id":4}
  public send(dstUser: string, message: string) {
    return this.request({
      id: 0,
      jsonrpc: '2.0',
      method: 'send',
      params: {
        // recipient: [dstUser],
        username: dstUser,
        message: message,
      },
    });
  }
}
