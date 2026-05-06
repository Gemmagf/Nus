import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
    // En GitHub Pages el repo s'allotja sota /Nus/
    // En Vercel o dev local la base és /
    const base = process.env.VITE_BASE_PATH ?? '/'
    return {
      base,
      server: {
        port: process.env.PORT ? parseInt(process.env.PORT) : 5173,
        host: '0.0.0.0',
      },
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
