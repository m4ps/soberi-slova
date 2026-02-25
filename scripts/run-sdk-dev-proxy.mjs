import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

function resolveRuntimePorts() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const configPath = path.resolve(scriptDir, '../config/runtime-ports.json');
  const rawConfig = readFileSync(configPath, 'utf8');

  return JSON.parse(rawConfig);
}

function getProxyArgs(mode) {
  const runtimePorts = resolveRuntimePorts();
  const hostPort = mode === 'prod' ? runtimePorts.previewPort : runtimePorts.devPort;
  const devMode = mode !== 'prod';

  return [
    '--host',
    `localhost:${hostPort}`,
    '--port',
    String(runtimePorts.proxyPort),
    `--dev-mode=${devMode}`,
  ];
}

function run() {
  const mode = globalThis.process.argv[2] === 'prod' ? 'prod' : 'dev';
  const args = getProxyArgs(mode);
  const child = spawn('sdk-dev-proxy', args, { stdio: 'inherit' });

  child.on('exit', (code, signal) => {
    if (signal) {
      globalThis.process.kill(globalThis.process.pid, signal);
      return;
    }

    globalThis.process.exit(code ?? 1);
  });
}

run();
