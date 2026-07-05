import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    allowedHosts: [
      'engineeringly-sandless-inez.ngrok-free.dev',
      '.ngrok-free.dev',
      '.loca.lt'
    ],
    host: '0.0.0.0'
  }
})