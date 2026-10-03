#!/usr/bin/env node
import { main } from '../src/cli.js';

main(process.argv.slice(2)).then(
  (code) => { process.exitCode = code; },
  (err) => {
    process.stderr.write(`✗ 内部错误：${err.stack || err}\n`);
    process.exitCode = 1;
  },
);
