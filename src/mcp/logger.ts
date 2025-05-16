import winston from 'winston';

export const logger = winston.createLogger({
    level: 'info', 
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.simple()
    ),
    transports: [
      new winston.transports.File({
        filename: 'signal-mcp-server.log'
      }),
    ]
  });
  