import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/itk/WebWorkers/*',
          dest: 'itk/WebWorkers'
        },
        {
          src: 'node_modules/itk/ImageIOs/*',
          dest: 'itk/ImageIOs'
        },
        {
          src: 'node_modules/itk/MeshIOs/*',
          dest: 'itk/MeshIOs'
        },
        {
          src: 'node_modules/itk/PolyDataIOs/*',
          dest: 'itk/PolyDataIOs'
        }
      ]
    })
  ],
})
