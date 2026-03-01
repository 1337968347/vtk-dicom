<script setup>
import { useRouter } from 'vue-router'
import { useDicomStore } from '../stores/dicom'
import DicomUpload from '../components/DicomUpload.vue'

const router = useRouter()
const store = useDicomStore()

const handleDicomLoaded = (image) => {
  store.setDicomData(image)
  router.push('/viewer')
}

const handleError = (err) => {
  console.error('DICOM Error:', err)
  store.clearData()
}
</script>

<template>
  <div class="upload-view">
    <h1>请上传DICOM文件</h1>
    <DicomUpload 
      @loaded="handleDicomLoaded" 
      @error="handleError" 
    />
  </div>
</template>

<style scoped>
.upload-view {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  min-height: 50vh;
}
h1 {
  color: #2c3e50;
  text-align: center;
  margin-bottom: 2rem;
}
</style>
