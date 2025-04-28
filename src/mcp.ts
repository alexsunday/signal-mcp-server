import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import {z} from 'zod';
import { SignalClient } from './signal-client';

/*
  * This function is used to send a message to a contact using the SignalClient.
  * It takes in the SignalClient instance, the contact's username, and the message to be sent.
  * It returns a Promise that resolves to a CallToolResult object indicating success or failure.
*/
async function mcpSendMessage(sg: SignalClient, contact: string, message: string): Promise<CallToolResult> {
  const result = await sg.send(contact, message);
  if(result.error) {
    const failed: CallToolResult = {
      success: false,
      content: [
        {
          type: 'text',
          text: result.error.message,
        }
      ]
    }
    return failed;
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

export function initMcpServer(sg: SignalClient) {
  const server = new McpServer({
    name: 'signal-cli',
    version: '0.0.1',
    description: 'Signal CLI',
  });

  server.tool("sendMessage", "Send a message to a contact", {
    contact: z.string().describe("target signal username"),
    message: z.string().describe("Message to send"),
  }, ({contact, message}) => {
    return mcpSendMessage(sg, contact, message);
  });

  return server;
}
