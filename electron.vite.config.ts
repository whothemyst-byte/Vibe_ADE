import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  main: {
    build: {
      outDir: 'dist/main',
      rollupOptions: {
        external: ['node-pty']
      }
    },
    resolve: {
      alias: {
        '@shared': path.resolve(__dirname, 'src/shared'),
        '@main': path.resolve(__dirname, 'src/main')
      }
    }
  },
  preload: {
    build: {
      outDir: 'dist/preload'
    },
    resolve: {
      alias: {
        '@shared': path.resolve(__dirname, 'src/shared')
      }
    }
  },
  renderer: {
    root: path.resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: {
        '@renderer': path.resolve(__dirname, 'src/renderer/src'),
        '@shared': path.resolve(__dirname, 'src/shared')
      }
    },
    plugins: [react()]
  }
});
