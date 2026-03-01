<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import '@kitware/vtk.js/Rendering/Profiles/Volume'; // 引入体渲染配置文件
import vtkGenericRenderWindow from '@kitware/vtk.js/Rendering/Misc/GenericRenderWindow';
import vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';

const THRESHOLDS = [100, 200, 450];

const props = defineProps({
  imageData: {
    type: Object,
    default: null,
  },
});

const vtkContainer = ref(null);
let genericRenderWindow = null;
let renderer = null;
let renderWindow = null;
let volume = null;
let mapper = null;

// 将 ITK 图像转换为 VTK 图像的辅助函数
const convertItkToVtkImage = (itkImage) => {
  const vtkImage = vtkImageData.newInstance();
  const { size, spacing, origin, direction, data } = itkImage;

  // 设置几何信息
  vtkImage.setDimensions(size);
  vtkImage.setSpacing(spacing);
  vtkImage.setOrigin(origin);

  // 方向
  if (direction.rows === 3 && direction.columns === 3
    && direction.data.length === 9) {
    vtkImage.setDirection(direction.data);
  }
  const scalarArray = vtkDataArray.newInstance({
    name: 'Scalars',
    values: data,
    numberOfComponents: itkImage.imageType.components,
  });

  vtkImage.getPointData().setScalars(scalarArray);
  return vtkImage;
};

const initVtk = () => {
  if (!vtkContainer.value) return;

  // 设置 VTK 渲染窗口
  genericRenderWindow = vtkGenericRenderWindow.newInstance({
    background: [0, 0, 0],
  });
  genericRenderWindow.setContainer(vtkContainer.value);

  renderer = genericRenderWindow.getRenderer();
  renderWindow = genericRenderWindow.getRenderWindow();

  // 调整大小处理
  const resizeObserver = new ResizeObserver(() => {
    genericRenderWindow.resize();
  });
  resizeObserver.observe(vtkContainer.value);
};


const createTransferFunctions = () => {
  const ctf = vtkColorTransferFunction.newInstance();
  // 背景 & 低于阈值部分 - 黑色/透明
  ctf.addRGBPoint(-1000, 0.0, 0.0, 0.0);
  ctf.addRGBPoint(THRESHOLDS[0] - 1, 0.0, 0.0, 0.0);
  
  // 阈值起始 - 骨松质/肋软骨颜色 (淡米色)
  ctf.addRGBPoint(THRESHOLDS[0], 0.8, 0.3, 0.3);
  
  // 骨松质 (亮米色)
  ctf.addRGBPoint(THRESHOLDS[1], 0.9, 0.85, 0.8); 
  
  // 高密度区域 - 纯白 (骨皮质)
  ctf.addRGBPoint(THRESHOLDS[2], 1.0, 1.0, 1.0);
  ctf.addRGBPoint(3000, 1.0, 1.0, 1.0);

  const of = vtkPiecewiseFunction.newInstance();
  of.addPoint(-1000, 0.0);
  of.addPoint(THRESHOLDS[0] - 1, 0.0); // 低于阈值完全透明
  
  of.addPoint(THRESHOLDS[0], 0.15);            // 起始可见度 (降低以减少软组织干扰)
  of.addPoint(THRESHOLDS[1], 0.6);             // 中间过渡
  of.addPoint(THRESHOLDS[2], 1.0);             // 高密度完全不透明
  of.addPoint(3000, 1.0);                      // 保持不透明

  return { ctf, of };
};

const updateVolume = () => {
  if (!props.imageData || !renderer) return;

  // 清理之前的体数据
  if (volume) {
    renderer.removeVolume(volume);
  }

  const vtkImage = convertItkToVtkImage(props.imageData);

  // 创建映射器
  // 光线步进逻辑
  mapper = vtkVolumeMapper.newInstance();
  mapper.setInputData(vtkImage);

  // 创建体对象
  volume = vtkVolume.newInstance();
  // 体素使用mapper 逻辑来渲染
  volume.setMapper(mapper);

  // 开启阴影效果（实现立体感的关键）
  volume.getProperty().setShade(true);
  volume.getProperty().setAmbient(0.2);
  volume.getProperty().setDiffuse(0.7);
  volume.getProperty().setSpecular(0.3);
  volume.getProperty().setSpecularPower(15.0);

  // 设置传输函数
  const { ctf, of } = createTransferFunctions();

  volume.getProperty().setRGBTransferFunction(0, ctf);
  volume.getProperty().setScalarOpacity(0, of);
  volume.getProperty().setInterpolationTypeToLinear();

  renderer.addVolume(volume);
  renderer.resetCamera();
  renderWindow.render();
};

onMounted(() => {
  initVtk();
  if (props.imageData) {
    updateVolume();
  }
});

watch(() => props.imageData, () => {
  updateVolume();
});

onBeforeUnmount(() => {
  if (genericRenderWindow) {
    genericRenderWindow.delete();
    genericRenderWindow = null;
  }
});
</script>

<template>
  <div class="vtk-viewer-wrapper">
    <div ref="vtkContainer" class="vtk-container"></div>
  </div>
</template>

<style scoped>
.vtk-viewer-wrapper {
  width: 100%;
  height: 600px;
  /* 默认高度 */
  border: 1px solid #ccc;
  border-radius: 8px;
  overflow: hidden;
  position: relative;
  background-color: #000;
}

.vtk-container {
  width: 100%;
  height: 100%;
}
</style>
