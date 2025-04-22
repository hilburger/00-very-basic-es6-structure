// vite.config.js
import { defineConfig } from 'vite'

export default defineConfig({
  // 'root' wird nicht gesetzt, da index.html im Projekt-Root liegt.
  // Vite findet sie dort standardmäßig.

  publicDir: 'public', // Der Ordner für statische Assets heißt 'public'
  base: './', // Stellt sicher, dass Asset-Pfade relativ sind (gut für Builds)

  server: {
    host: true, // Lässt den Server im lokalen Netzwerk erreichbar sein
    open: !('SANDBOX_URL' in process.env || 'CODESANDBOX_HOST' in process.env) // Öffnet den Browser automatisch (außer in Online-IDEs)
  },

  build: {
    outDir: 'dist', // Der Build-Output kommt in den Ordner 'dist' (im Projekt-Root)
    emptyOutDir: true, // Leert 'dist' vor dem Build
    sourcemap: true // Erzeugt Sourcemaps für einfacheres Debugging
  },
})