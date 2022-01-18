import net from 'net';
import https from 'https';
import { Duplex } from 'stream';
import axios from 'axios';
import qs from 'qs';

const axiosInstance = axios.create({
  baseURL: 'https://d.buaa.edu.cn/http-23380/77726476706e69737468656265737421a1a70fce72612600305ada',
  timeout: 0,
  headers: {
    Cookie: 'wengine_vpn_ticketd_buaa_edu_cn=27d0e117f61d7212'
  }
});

export class HTTPTunnel extends Duplex {
  constructor(host, port, cookie) {
    super();

    this.host = host;
    this.port = port;
    this.cookie = cookie

    this.token = null;
    this.isPolling = false;
    this.isClosed = false;
  }

  async postData(chunks, callback) {
    console.log('this.cookie',  this.cookie, this.token);
    await new Promise((resolve, reject) => {
      const req = https.request({
        host: 'd.buaa.edu.cn',
        port: 443,
        method: 'POST',
        path: `/http-23380/77726476706e69737468656265737421a1a70fce72612600305ada/tunnel/${this.token}/push?wrdrecordvisit=${Date.now()}`,
        headers: {
          Cookie: 'wengine_vpn_ticketd_buaa_edu_cn=27d0e117f61d7212',
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
          path: `/http-23380/77726476706e69737468656265737421a1a70fce72612600305ada/tunnel/${this.token}/pull?wrdrecordvisit=${Date.now()}`,
          headers: {
            Cookie: this.cookie,
          },
        });

        req.on('error', (err) => {
          console.error(err);
          reject(err);
        });
        req.on('response', (res) => {
          if (res.statusCode === 200) {
            res.on('error', (err) => {
              console.error(err);
              resolve();
            });
            res.on('data', (chunk) => {
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
    try {
      const rsp = await axiosInstance.post(`/tunnel?${qs.stringify(params)}`);

      if (rsp.status !== 200) {
        throw new Error(`tunnel auth failed: ${rsp.status}`);
      }
      const { code, data } = rsp.data;
      if (code !== 0) {
        throw new Error(`tunnel auth failed: ${rsp.data}`);
      }
      this.token = data.token;
      if (!this.token) {
        throw new Error(`tunnel auth failed: no token`);
      }
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
  constructor({ host, port, rhost, rport }, cookie) {
    this._host = host;
    this._port = port;
    this._rhost = rhost;
    this._rport = rport;

    axiosInstance.defaults.headers.cookie = cookie;
    this._cookie = cookie;
    this._token = null;
  }

  async run() {
    const tcpServer = net.createServer(async (c) => {
      console.log('connected!');

      const tunnel = new HTTPTunnel(this._rhost, this._rport, this._cookie);
      try {
        await tunnel.auth();
      } catch (err) {
        console.log('error occured, reset', err.message);
        c.end();
        tunnel.close();
        return;
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
