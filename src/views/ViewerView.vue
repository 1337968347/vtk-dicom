<script setup>
import { useRouter } from 'vue-router'
import { useDicomStore } from '../stores/dicom'
import DicomViewer from '../components/DicomViewer.vue'
import { onMounted } from 'vue'

const router = useRouter()
const store = useDicomStore()

const goBack = () => {
  store.clearData()
  router.push('/')
}

onMounted(() => {
  if (!store.imageData) {
    router.push('/')
  }
})
</script>

<template>
  <div class="viewer-view">
    <div class="toolbar">
      <button class="back-btn" @click="goBack">
        ← 返回上传页面
      </button>
    </div>

    <div v-if="store.imageData" class="viewer-container">
      <h2>Volume Rendering</h2>
      <DicomViewer :imageData="store.imageData" />
    </div>

    <div v-if="store.seriesInfo" class="results">
      <h2>Parsed Series Data</h2>
      <div class="info-grid">
        <div class="info-item">
          <strong>Dimensions (Size):</strong>
          {{ store.seriesInfo.size.join(' x ') }}
        </div>
        <div class="info-item">
          <strong>Spacing:</strong>
          {{ store.seriesInfo.spacing.map(s => s.toFixed(4)).join(', ') }}
        </div>
        <div class="info-item">
          <strong>Origin:</strong>
          {{ store.seriesInfo.origin.map(o => o.toFixed(4)).join(', ') }}
        </div>
        <div class="info-item">
          <strong>Components:</strong>
          {{ store.seriesInfo.imageType.components }}
        </div>
        <div class="info-item">
          <strong>Pixel Type:</strong>
          {{ store.seriesInfo.imageType.componentType }}
        </div>
      </div>
      
      <details>
        <summary>Full Image Object</summary>
        <pre>{{ JSON.stringify(store.seriesInfo, null, 2) }}</pre>
      </details>
    </div>
  </div>
</template>

<style scoped>
.viewer-view {
  padding: 20px;
}

.toolbar {
  margin-bottom: 20px;
}

.back-btn {
  background-color: #f0f0f0;
  border: 1px solid #ccc;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.back-btn:hover {
  background-color: #e0e0e0;
}

.viewer-container {
  background: white;
  padding: 1.5rem;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  margin-bottom: 2rem;
}

.results {
  background: white;
  padding: 1.5rem;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 1rem;
}

.info-item {
  background: #f8f9fa;
  padding: 0.8rem;
  border-radius: 4px;
}
</style>
