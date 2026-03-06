<script setup>
import { useRouter } from 'vue-router'
import DicomUpload from '../components/DicomUpload.vue'
import { globalDicomData } from '../utils'

const router = useRouter()

const handleDicomLoaded = (image) => {
  router.push('/viewer')
}

const handleError = (err) => {
  console.error('DICOM Error:', err)
  globalDicomData.image = null
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
