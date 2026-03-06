<script setup>
import { useRouter } from 'vue-router'
import DicomViewer from '../components/DicomViewer.vue'
import { onMounted, ref } from 'vue'
import { globalDicomData } from '../utils'

const router = useRouter()
const seriesInfo = ref(null)

const goBack = () => {
  globalDicomData.image = null
  router.push('/')
}

onMounted(() => {
  if (!globalDicomData.image) {
    router.push('/')
    return
  }
  const image = globalDicomData.image;
  seriesInfo.value = {
    imageType: image.imageType,
    name: image.name,
    origin: image.origin,
    spacing: image.spacing,
    direction: image.direction,
    size: image.size,
    metadata: image.metadata
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

    <div v-if="globalDicomData.image" class="viewer-container">
      <h2>体渲染</h2>
      <DicomViewer />
    </div>
    <div v-if="seriesInfo" class="results">
      <h2>原始dicom tag</h2>
      <div class="info-grid">
        <div class="info-item">
          <strong>Dimensions (Size):</strong>
          {{ seriesInfo.size.join(' x ') }}
        </div>
        <div class="info-item">
          <strong>Spacing:</strong>
          {{seriesInfo.spacing.map(s => s.toFixed(4)).join(', ')}}
        </div>
        <div class="info-item">
          <strong>Origin:</strong>
          {{seriesInfo.origin.map(o => o.toFixed(4)).join(', ')}}
        </div>
        <div class="info-item">
          <strong>Components:</strong>
          {{ seriesInfo.imageType.components }}
        </div>
        <div class="info-item">
          <strong>Pixel Type:</strong>
          {{ seriesInfo.imageType.componentType }}
        </div>
      </div>

      <details>
        <summary>Full Image Object</summary>
        <pre>{{ JSON.stringify(seriesInfo, null, 2) }}</pre>
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
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  margin-bottom: 2rem;
}

.results {
  background: white;
  padding: 1.5rem;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
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
