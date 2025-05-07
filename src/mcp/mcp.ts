import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { z } from 'zod';
import { JSONRPCResponse, SignalClient } from './signal-client';
import { contactSchema, contactType } from './types';

export function initMcpServer(sg: SignalClient) {
  const mcpServer = new SignalCliMcpServer(sg);
  const server = new McpServer({
    name: 'signal-cli',
    version: '0.0.1',
    description: 'Signal CLI',
  });

  server.tool("sendMessage", "向一个联系人/好友发送信息", {
    contact: contactSchema,
    message: z.string().describe("Message to send"),
  }, ({ contact, message }) => {
    return mcpServer.send(contact, message);
  });

  const getUserStatusDocs = `使用电话号码或用户名查询用户的注册状态与简要信息，返回用户是否在系统里注册 可能返回用户名与号码 返回用户的唯一标识 UUID`;
  server.tool("getUserStatus", getUserStatusDocs, {
    contact: contactSchema,
  }, ({ contact }) => {
    return mcpServer.getUserStatus(contact);
  });

  return server;
}

export class SignalCliMcpServer {
  private sg: SignalClient;

  constructor(sg: SignalClient) {
    this.sg = sg;
  }

  public async close() {
    return this.sg.close();
  }

  async send(contact: contactType, message: string): Promise<CallToolResult> {
    const result = await this.sg.send(contact, message);
    if (result.error) {
      return this.handleError(result);
    }

    const succeed: CallToolResult = {
      success: true,
      content: [
        {
          type: 'text',
          text: "OK",
        }
      ]
    }
    return succeed;
  }

  async version(): Promise<CallToolResult> {
    const result = await this.sg.version();
    if (result.error) {
      return this.handleError(result);
    }

    const succeed: CallToolResult = {
      success: true,
      content: [
      ]
    }
    return succeed;
  }

  async getUserStatus(contact: contactType): Promise<CallToolResult> {
    const result = await this.sg.getUserStatus(contact);
    if (result.error) {
      return this.handleError(result);
    }

    const schema = z.array(z.object({
      recipient: z.string().optional(),
      number: z.string().optional(),
      username: z.string().optional(),
      uuid: z.string().optional(),
      isRegistered: z.boolean(),
    }));
    const parsed = this.restrictResponse(result, schema);
    if(parsed.length === 0) {
      return {
        success: true,
        content: [
          {
            type: 'text',
            text: "没有找到用户信息 可能未注册",
          }
        ]
      };
    }
    // TODO
    const item = parsed[0]
    const succeed: CallToolResult = {
      success: true,
      content: [
        {
          type: 'text',
          text: `User status: ${item.isRegistered ? 'registered' : 'not registered'}`,
        },
        {
          type: 'text',
          text: `Recipient: ${item.recipient || 'unknown'}`,
        },
        {
          type: 'text',
          text: `Number: ${item.number || 'unknown'}`,
        },
        {
          type: 'text',
          text: `Username: ${item.username || 'unknown'}`,
        },
        {
          type: 'text',
          text: `UUID: ${item.uuid || 'unknown'}`,
        }
      ]
    }
    return succeed;
  }

  handleError(result: JSONRPCResponse): CallToolResult {
    if(!result.error) {
      throw new Error('No error in result');
    }
    const error = result.error;
    const errorMessage = error.message || 'Unknown error';
    const errorCode = error.code || -1;
    return {
      success: false,
      content: [
        {
          type: 'text',
          text: errorMessage,
        },
        {
          type: 'text',
          text: `Error code: ${errorCode}`,
        },
        {
          type: 'text',
          text: JSON.stringify(error.data, null, 2),
        }
      ],
      _meta: result.error,
      isError: true,
    };
  }

  restrictResponse<T>(result: JSONRPCResponse, schema: z.Schema<T>): T {
    if(result.error) {
      throw new Error(`Error: ${result.error.message}`);
    }
    console.log(JSON.stringify(result, null, 2));
    const parsed = schema.safeParse(result.result);
    if(!parsed.success) {
      throw new Error(`Invalid response: ${JSON.stringify(parsed.error.format(), null, 2)}`);
    }
    return parsed.data;
  }
}
