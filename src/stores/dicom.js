import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useDicomStore = defineStore('dicom', () => {
  const imageData = ref(null)
  const seriesInfo = ref(null)

  const setDicomData = (image) => {
    imageData.value = image
    seriesInfo.value = {
      imageType: image.imageType,
      name: image.name,
      origin: image.origin,
      spacing: image.spacing,
      direction: image.direction,
      size: image.size,
      metadata: image.metadata
    }
  }

  const clearData = () => {
    imageData.value = null
    seriesInfo.value = null
  }

  return {
    imageData,
    seriesInfo,
    setDicomData,
    clearData
  }
})
