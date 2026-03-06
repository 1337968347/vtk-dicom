<script setup>
import { ref, onMounted } from 'vue'
import readImageDICOMFileSeries from 'itk/readImageDICOMFileSeries'
import { globalDicomData, convertItkToVtkImage, getGPUInfo } from '../utils'

const emit = defineEmits(['loaded', 'error'])

const loading = ref(false)
const error = ref(null)
const fileList = ref([])
const gpuInfo = ref({ vendor: '', renderer: '' })
const forceDownsample = ref(false)

onMounted(() => {
  gpuInfo.value = getGPUInfo();
  // 默认不勾选，由用户自己决定
  forceDownsample.value = false;
})

const handleFileChange = async (event) => {
  const files = event.target.files
  if (!files || files.length === 0) return

  loading.value = true
  error.value = null
  fileList.value = Array.from(files)

  try {
    const { image: itkImage } = await readImageDICOMFileSeries(files)
    
    // 存储原始信息供 ViewerView 使用
    globalDicomData.seriesInfo = {
      imageType: itkImage.imageType,
      name: itkImage.name,
      origin: itkImage.origin,
      spacing: itkImage.spacing,
      direction: itkImage.direction,
      size: itkImage.size,
      metadata: itkImage.metadata
    };

    // 立即转换为 VTK ImageData 并降采样（如果需要）
    const vtkImage = convertItkToVtkImage(itkImage, forceDownsample.value);
    
    // 直接存储 vtkImageData
    globalDicomData.image = vtkImage;

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
    
    <!-- 显卡信息与设置 -->
    <div class="gpu-info-panel">
      <p><strong>检测到的显卡:</strong> {{ gpuInfo.renderer }}</p>
      <label class="checkbox-label">
        <input type="checkbox" v-model="forceDownsample"> 
        强制开启 Z 轴降采样 (节省 50% 显存，防止崩溃，如果是核显建议开启)
      </label>
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

.gpu-info-panel {
  margin-bottom: 1rem;
  padding: 1rem;
  border: 1px solid #eee;
  border-radius: 8px;
  background-color: #fff;
  width: 100%;
  max-width: 600px;
  font-size: 0.9rem;
}

.warning-text { color: #e67e22; }
.success-text { color: #27ae60; }
.checkbox-label {
  display: block;
  margin-top: 8px;
  cursor: pointer;
  user-select: none;
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
