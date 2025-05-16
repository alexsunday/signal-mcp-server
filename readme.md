# mcp server for cline to connect signal-cli

# 启动 signal-cli
```console
bin\signal-cli -u +8613311111111 daemon --tcp
```

# 配置 MCP
```json
{
  "mcpServers": {
    "signal-cli": {
      "disabled": false,
      "timeout": 60,
      "command": "npx",
      "args": [
        "-y",
        "signal-mcp-server"
      ],
      "transportType": "stdio"
    }
  }
}
```

![signal-cli mcp server](./static/1.png)

