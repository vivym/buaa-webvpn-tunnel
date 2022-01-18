import { Command, InvalidArgumentError } from 'commander';
import { Client } from './client.js';

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
      .parse();
    this.options = program.opts();
  }

  run() {
    const client = new Client(this.options);
    client.run();
  }
}

const app = new App();
app.run();
