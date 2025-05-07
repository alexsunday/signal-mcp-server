import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { z } from 'zod';
import { JSONRPCResponse, SignalClient } from './signal-client';
import { contactSchema, contactType, updateContactArgumentsSchema, updateContactArgumentsType } from './types';

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

  server.tool('listContacts', '列出所有联系人 返回联系人唯一识别码UUID 与其他基本信息', {}, () => {
    return mcpServer.listContacts();
  });

  server.tool('updateContact', '更新联系人信息', {
    number: z.string().describe("联系人号码 必须只能是合法的 E164格式的电话号码 不能使用用户名"),
    opt: updateContactArgumentsSchema,
  }, ({ number, opt }) => {
    return mcpServer.updateContact(number, opt);
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

  async listContacts(): Promise<CallToolResult> {
    const result = await this.sg.listContacts();
    if (result.error) {
      return this.handleError(result);
    }

    const schema = z.array(z.object({
      number: z.string(),
      username: z.union([z.string(), z.null()]),
      name: z.string(),
      givenName: z.union([z.string(), z.null()]),
      familyName: z.union([z.string(), z.null()]),
      nickName: z.union([z.string(), z.null()]),
      nickGivenName: z.union([z.string(), z.null()]),
      nickFamilyName: z.union([z.string(), z.null()]),
      note: z.union([z.string(), z.null()]),
      uuid: z.string(),
    }));

    const parsed = this.restrictResponse(result, schema);
    return {
      success: true,
      content: parsed.map((item) => {
        return {
          type: 'text',
          text: `
          UUID: ${item.uuid}
          name: ${item.name}
          number: ${item.number}
          username: ${item.username || ''}
          givenName: ${item.givenName || ''}
          familyName: ${item.familyName || ''}
          nickName: ${item.nickName || ''}
          nickGivenName: ${item.nickGivenName || ''}
          nickFamilyName: ${item.nickFamilyName || ''}
          note: ${item.note || ''}
          `,
        }
      })
    };
  }

  async updateContact(number: string, opt: updateContactArgumentsType) {
    const result = await this.sg.updateContact(number, opt);
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
    const parsed = schema.safeParse(result.result);
    if(!parsed.success) {
      throw new Error(`Invalid response: ${JSON.stringify(parsed.error.format(), null, 2)}`);
    }
    return parsed.data;
  }
}
