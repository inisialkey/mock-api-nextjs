import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { setupSocketServer } from './lib/socket';

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error handling request:', err);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });

  // Attach Socket.IO to the same HTTP server
  const io = setupSocketServer(httpServer);

  // Make io accessible globally for REST endpoints to emit events
  (global as any).__io = io;

  httpServer.listen(port, hostname, () => {
    console.log(`
╔════════════════════════════════════════════════════╗
║         🚀 Mock API Server is Running             ║
╠════════════════════════════════════════════════════╣
║                                                    ║
║  REST API  → http://localhost:${port}/api            ║
║  WebSocket → ws://localhost:${port}                  ║
║  Health    → http://localhost:${port}/api/health      ║
║                                                    ║
║  Mode: ${dev ? 'Development' : 'Production '}                            ║
║                                                    ║
╚════════════════════════════════════════════════════╝
    `);
  });
});
