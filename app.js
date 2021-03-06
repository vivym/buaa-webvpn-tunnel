#!/usr/bin/env node

import { Command, InvalidArgumentError } from 'commander';
import { Client } from './client.js';
import { getCookie } from './cookie.js';

class App {
  constructor() {
    const program = new Command();

    const toInt = (value, previous) => {
      const parsedValue = parseInt(value, 10);
      if (isNaN(parsedValue)) {
        throw new InvalidArgumentError('Not a number: ' + value);
      }
      return parsedValue;
    }

    program
      .version('0.1.0')
      .option('-p, --port <number>', 'local port to listen on', toInt, 23322)
      .option('-h, --host <n>', 'local host to listen on', 'localhost')
      .option('-rp, --rport <number>', 'remote port to connect to', toInt, 22)
      .option('-rh, --rhost <n>', 'remote host to connect to', '127.0.0.1')
      .option('--reset-cookie', 'reset cookie')
      .parse();
    this.options = program.opts();
  }

  async run() {
    const client = new Client(this.options, await getCookie(this.options.resetCookie));
    client.run();
  }
}

const app = new App();
app.run();
