import net from 'net';
import http from 'http';
import { Duplex } from 'stream';
import axios from 'axios';

const axiosInstance = axios.create({
  baseURL: 'http://127.0.0.1:23380',
  timeout: 0,
});

export class HTTPTunnel extends Duplex {
  constructor(host, port) {
    super();

    this.host = host;
    this.port = port;

    this.token = null;
    this.isPolling = false;
    this.isClosed = false;
  }

  async postData(chunks, callback) {
    await new Promise((resolve, reject) => {
      const req = http.request({
        host: 'localhost',
        port: 23380,
        method: 'POST',
        path: `/tunnel/${this.token}`,
      });
      req.on('error', (err) => {
        console.error(err);
        reject(err);
      });
      req.on('response', (res) => {
        if (res.statusCode === 200) {
          callback();
          resolve();
        } else {
          reject(new Error(`HTTP status code ${res.statusCode}`));
        }
      });

      for (const { chunk, encoding } of chunks) {
        req.write(chunk, encoding);
      }
      req.end();
    });
  }

  _write(chunk, encoding, callback) {
    this.postData([{ chunk, encoding }], callback);
  }

  _writev(chunks, callback) {
    this.postData(chunks, callback);
  }

  _read() {
    this.startPolling();
  }

  async startPolling() {
    if (this.isPolling) {
      return;
    }

    this.isPolling = true;

    while (this.isPolling && !this.isClosed) {
      await new Promise((resolve, reject) => {
        http.get(`http://localhost:23380/tunnel/${this.token}`, (res) => {
          if (res.statusCode === 200) {
            res.on('error', (err) => {
              console.error(err);
              resolve();
            });
            res.on('data', (chunk) => this.push(chunk));
            res.on('end', () => resolve());
          } else {
            reject(new Error(`HTTP status code ${res.statusCode}`));
          }
        });
      });
    }
  }

  async auth() {
    const params = {
      host: this.host,
      port: this.port,
    }
    try {
      const rsp = await axios.get('http://localhost:23380/tunnel', { params });

      if (rsp.status !== 200) {
        throw new Error(`tunnel auth failed: ${rsp.status}`);
      }
      const { code, data } = rsp.data;
      if (code !== 0) {
        throw new Error(`tunnel auth failed: ${code}`);
      }
      this.token = data.token;
      this.keepalive();

    } catch (err) {
      throw new Error(`Auth failed: ${err.message}`);
    }
  }

  keepalive() {
    const token = setInterval(() => {
      if (this.isClosed) {
        clearInterval(token);
        return;
      }
      axiosInstance.get(`/tunnel/${this.token}/keepalive`).catch(() => {
        this.isClosed = true;
        clearInterval(token);
      });
    }, 1000 * 5);
  }

  close() {
    this.isClosed = true;
  }
}

export class Client {
  constructor({ host, port, rhost, rport }) {
    this._host = host;
    this._port = port;
    this._rhost = rhost;
    this._rport = rport;

    this._token = null;
  }

  async run() {
    const tcpServer = net.createServer(async (c) => {
      console.log('connected!');

      const tunnel = new HTTPTunnel(this._rhost, this._rport);
      try {
        await tunnel.auth();
      } catch (err) {
        console.log('error occured, reset');
        c.end();
        tunnel.close();
      }

      c.pipe(tunnel);
      tunnel.pipe(c);
    });

    tcpServer.on('error', (err) => {
      console.error('server error:\n', err);
    });
    
    tcpServer.listen(this._port, this._host, () => {
      console.log(`listening on port ${this._host}:${this._port}`);
    });
  }
}
