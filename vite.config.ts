/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import runtimePorts from './config/runtime-ports.json';

export default defineConfig({
  server: {
    host: runtimePorts.host,
    port: runtimePorts.devPort,
  },
  preview: {
    host: runtimePorts.host,
    port: runtimePorts.previewPort,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
