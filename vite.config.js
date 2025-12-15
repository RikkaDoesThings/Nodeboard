import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Use a relative base so the built asset URLs work when opening `dist/index.html`
  // from file:// (Electron packaged app). Without this, Vite emits absolute
  // URLs (starting with /) which cause ERR_FILE_NOT_FOUND when loaded from
  // a file path.
  base: './',
  plugins: [react()],
})
