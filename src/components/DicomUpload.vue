<script setup>
import { ref } from 'vue'
import readImageDICOMFileSeries from 'itk/readImageDICOMFileSeries'
import { globalDicomData } from '../utils'

const emit = defineEmits(['loaded', 'error'])

const loading = ref(false)
const error = ref(null)
const fileList = ref([])

const handleFileChange = async (event) => {
  const files = event.target.files
  if (!files || files.length === 0) return

  loading.value = true
  error.value = null
  fileList.value = Array.from(files)

  try {
    const { image } = await readImageDICOMFileSeries(files)
    globalDicomData.image = image

    emit('loaded', null)

  } catch (err) {
    console.error(err)
    error.value = err.message || '解析 DICOM 序列失败'
    emit('error', error.value)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="dicom-upload-container">
    <div class="upload-section">
      <label for="dicom-dir" class="custom-file-upload">
        选择 DICOM 文件夹
      </label>
      <input id="dicom-dir" type="file" webkitdirectory multiple @change="handleFileChange" />
      <p v-if="fileList.length">已选择 {{ fileList.length }} 个文件</p>
    </div>

    <div v-if="loading" class="loading">
      正在处理 DICOM 文件... 这可能需要一点时间。
    </div>

    <div v-if="error" class="error">
      错误: {{ error }}
    </div>
  </div>
</template>

<style scoped>
.dicom-upload-container {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.upload-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 2rem 0;
  padding: 2rem;
  border: 2px dashed #ccc;
  border-radius: 8px;
  background-color: #f9f9f9;
  width: 100%;
  max-width: 600px;
}

input[type="file"] {
  display: none;
}

.custom-file-upload {
  display: inline-block;
  padding: 10px 20px;
  cursor: pointer;
  background-color: #1890ff;
  color: white;
  border-radius: 4px;
  font-weight: 500;
  transition: background 0.3s;
}

.custom-file-upload:hover {
  background-color: #40a9ff;
}

.loading {
  text-align: center;
  color: #666;
  font-style: italic;
  margin: 1rem 0;
}

.error {
  color: #e74c3c;
  background: #fadbd8;
  padding: 1rem;
  border-radius: 4px;
  margin: 1rem 0;
  width: 100%;
  max-width: 600px;
}
</style>
