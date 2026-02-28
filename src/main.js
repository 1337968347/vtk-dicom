import 'regenerator-runtime/runtime'
import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

try {
  const app = createApp(App)
  app.mount('#app')
} catch (e) {
  console.error('Vue app failed to mount:', e)
}
