import net from 'net';
import http from 'http';
import { Writable } from 'stream';
import { v4 as uuidv4 } from 'uuid';

class TCPCache extends Writable {
  constructor(tcpSocket) {
    super();

    this.lastActiveTime = Date.now();
    this.tcpSocket = tcpSocket;
    tcpSocket.pipe(this);
    this.queue = [];
  }

  _write(chunk, encoding, callback) {
    this.queue.push({ chunks: [{ chunk, encoding }], callback });
    this.emit('ready');
  }

  _writev(chunks, callback) {
    this.queue.push({ chunks, callback });
    this.emit('ready');
  }

  consume(writable) {
    while (this.queue.length > 0) {
      const { chunks, callback } = this.queue.shift();
      for (const { chunk, encoding } of chunks) {
        writable.write(chunk, encoding);
      }
      callback();
    }
  }

  close() {
    this.tcpSocket.end();
  }
};

export class Server {
  constructor() {
    this.tcpCacheMap = new Map();
    this.removeExpiredTcpCache();
  }

  removeExpiredTcpCache() {
    setInterval(() => {
      const now = Date.now();
      for (const [token, tcpCache] of this.tcpCacheMap) {
        if (now - tcpCache.lastActiveTime > 1000 * 10) {
          tcpCache.close();
          this.tcpCacheMap.delete(token);
        }
      }
      console.log("removeExpiredTcpCache, tcpCacheMap.size:", this.tcpCacheMap.size);
    }, 1000 * 10);
  }

  generateToken() {
    let token = null;
    do {
      token = uuidv4();
    } while(this.tcpCacheMap.has(token));
    return token;
  }

  run() {
    const httpServer = http.createServer((req, res) => {
      const { method, headers } = req;
      const url = new URL(req.url, `http://${headers.host}`);
      console.log(method, url);
    
      if (url.pathname === '/tunnel') {
        const host = url.searchParams.get('host');
        const port = url.searchParams.get('port');

        let isConnected = false;
        const token = this.generateToken();
        const tcpSocket = net.createConnection({ host, port }, () => {
          this.tcpCacheMap.set(token, new TCPCache(tcpSocket));
        });
        tcpSocket.on('connect', () => {
          isConnected = true;
          res.writeHead(200, { 'Content-Type': 'text/json' });
          res.end(JSON.stringify({
            code: 0,
            data: { token: token },
          }));
        });
        tcpSocket.on('error', (err) => {
          this.tcpCacheMap.delete(token);
          if (!isConnected) {
            res.writeHead(400, { 'Content-Type': 'text/json' });
            res.end(JSON.stringify({
              code: 100,
              data: { err: err.message },
            }));
          }
        });
        tcpSocket.on('end', () => {
          this.tcpCacheMap.delete(token);
          if (!isConnected) {
            res.writeHead(400, { 'Content-Type': 'text/json' });
            res.end(JSON.stringify({
              code: 101,
              data: {},
            }));
          }
        });
      } else if (url.pathname.startsWith('/tunnel/')) {
        const m = /\/tunnel\/([A-Za-z0-9\-]+)\/(\w+)/.exec(url.pathname);
        if (!m || method !== 'POST') {
          res.writeHead(200);
          res.end('okay');
        } else {
          const token = m[1], cmd = m[2];
          if (!this.tcpCacheMap.has(token)) {
            res.writeHead(400, { 'Content-Type': 'text/json' });
            res.end(JSON.stringify({
              code: 200,
              message: 'invalid token',
            }));
          } else if (cmd === 'keepalive') {
            const tcpCache = this.tcpCacheMap.get(token);
            tcpCache.lastActiveTime = Date.now();
            res.writeHead(200);
            res.end('okay');
          } else if (cmd === 'pull') {
            res.writeHead(200);
            if (tcpCache.queue.length > 0) {
              tcpCache.consume(res);
              res.end();
            } else {
              tcpCache.once('ready', () => {
                tcpCache.consume(res);
                res.end();
              });
            }
          } else if (cmd === 'push') {
            req.pipe(tcpCache.tcpSocket, { end: false });
            req.on('end', () => {
              res.writeHead(200);
              res.end();
            });
          } else {
            res.statusCode = 405;
            res.end();
          }
        }
      } else {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('okay');
      }
    });
    
    httpServer.listen(23380, () => {
      console.log('Server listening on port 23380');
    });
  }
};

const server = new Server();
server.run();
