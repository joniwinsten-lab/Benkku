import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages project site: workflow sets VITE_BASE_PATH=/RepoName/
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || '/',
})
