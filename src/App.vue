<script setup>
import { ref } from 'vue'
import DicomUpload from './components/DicomUpload.vue'

const seriesInfo = ref(null)

const handleDicomLoaded = (image) => {
  console.log('Parsed Image:', image)
  seriesInfo.value = {
    imageType: image.imageType,
    name: image.name,
    origin: image.origin,
    spacing: image.spacing,
    direction: image.direction,
    size: image.size,
    metadata: image.metadata // DICOM tags might be here or handled separately
  }
}

const handleError = (err) => {
  console.error('DICOM Error:', err)
  seriesInfo.value = null
}
</script>

<template>
  <div class="container">
    <h1>DICOM Directory Reader (itk-wasm)</h1>
    
    <DicomUpload 
      @loaded="handleDicomLoaded" 
      @error="handleError" 
    />

    <div v-if="seriesInfo" class="results">
      <h2>Parsed Series Data</h2>
      <div class="info-grid">
        <div class="info-item">
          <strong>Dimensions (Size):</strong>
          {{ seriesInfo.size.join(' x ') }}
        </div>
        <div class="info-item">
          <strong>Spacing:</strong>
          {{ seriesInfo.spacing.map(s => s.toFixed(4)).join(', ') }}
        </div>
        <div class="info-item">
          <strong>Origin:</strong>
          {{ seriesInfo.origin.map(o => o.toFixed(4)).join(', ') }}
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
.container {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
  font-family: Arial, sans-serif;
}

h1 {
  color: #2c3e50;
  text-align: center;
  margin-bottom: 2rem;
}

.results {
  background: white;
  padding: 1.5rem;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  margin-top: 2rem;
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

strong {
  display: block;
  margin-bottom: 0.5rem;
  color: #2c3e50;
}

pre {
  background: #f4f4f4;
  padding: 1rem;
  overflow-x: auto;
  border-radius: 4px;
  font-size: 0.85rem;
}
</style>
