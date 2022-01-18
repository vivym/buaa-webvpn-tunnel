import net from 'net';
import https from 'https';
import { Duplex } from 'stream';
import axios from 'axios';

const cookie = '_webvpn_key=eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoic3kyMDIxMTIwIiwiZ3JvdXBzIjpbMywxXSwiaWF0IjoxNjMxNjM4MjcyLCJleHAiOjE2MzE3MjQ2NzJ9.sQidtejuqM0P9bMR0bw9HumAuX2m7Ujqh2h3Mqa76Xk; webvpn_username=sy2021120%7C1631638272%7Cd7d9a12bfb9f1e2af5627e82738cba69fb2f21d1; refresh=0; show_vpn=0; wengine_vpn_ticketd_buaa_edu_cn=27d0e117f61d7212';
const axiosInstance = axios.create({
  baseURL: 'https://d.buaa.edu.cn/http-23380/77726476706e69737468656265737421a1a70fce72612600305ada',
  timeout: 0,
  headers: {
    cookie: cookie,
  },
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
      const req = https.request({
        host: 'd.buaa.edu.cn',
        port: 443,
        method: 'POST',
        path: `/http-23380/77726476706e69737468656265737421a1a70fce72612600305ada/tunnel/push/${this.token}/?wrdrecordvisit=${Date.now()}`,
        headers: {
          Cookie: cookie,
        },
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
        const req = https.request({
          host: 'd.buaa.edu.cn',
          port: 443,
          method: 'POST',
          path: `/http-23380/77726476706e69737468656265737421a1a70fce72612600305ada/tunnel/pull/${this.token}/?wrdrecordvisit=${Date.now()}`,
          headers: {
            Cookie: cookie,
          },
        });

        req.on('error', (err) => {
          console.error(err);
          reject(err);
        });
        req.on('response', (res) => {
          console.log('polled', res.statusCode);
          if (res.statusCode === 200) {
            res.on('error', (err) => {
              console.error(err);
              resolve();
            });
            res.on('data', (chunk) => {
              console.log('polled chunk', chunk.toString());
              this.push(chunk);
            });
            res.on('end', () => resolve());
          } else {
            reject(new Error(`HTTP status code ${res.statusCode}`));
          }
        });
  
        req.end();
      });
    }
  }

  async auth() {
    const params = {
      host: this.host,
      port: this.port,
      wrdrecordvisit: Date.now(),
    }
    console.log('auth');
    try {
      const rsp = await axiosInstance.get('/tunnel', { params });

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
      axiosInstance
        .post(`/tunnel/${this.token}/keepalive?wrdrecordvisit=${Date.now()}`)
        .then((rsp) => {
          console.log('keepalive', rsp.data)
        })
        .catch(() => {
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
