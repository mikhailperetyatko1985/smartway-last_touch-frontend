import { defineConfig } from 'vitest/config';
import path from 'path';

// Aliases 1:1 с resolve.alias webpack.config.js (tsconfig baseUrl ./src):
// импорты вида 'interfaces/...', 'stores/...' резолвятся в src/*
const src = path.resolve(__dirname, 'src');

export default defineConfig({
  resolve: {
    alias: [
      { find: /^interfaces\//, replacement: `${src}/interfaces/` },
      { find: /^stores\//, replacement: `${src}/stores/` },
      { find: /^drivers\//, replacement: `${src}/drivers/` },
      { find: /^enums\//, replacement: `${src}/enums/` },
      { find: /^helpers\//, replacement: `${src}/helpers/` },
      { find: /^components\//, replacement: `${src}/components/` },
      { find: /^api\//, replacement: `${src}/api/` },
      { find: /^types\//, replacement: `${src}/types/` },
    ],
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.spec.ts'],
  },
});
