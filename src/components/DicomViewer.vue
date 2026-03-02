<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import '@kitware/vtk.js/Rendering/Profiles/Volume'; // 引入体渲染配置文件
import vtkGenericRenderWindow from '@kitware/vtk.js/Rendering/Misc/GenericRenderWindow';
import vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import vtkCellPicker from '@kitware/vtk.js/Rendering/Core/CellPicker';
import { intersectRayAABB, convertItkToVtkImage } from '../utils';
import EraserOverlay from './EraserOverlay.vue';
import { gaussianSmoothArray3D } from '../utils';

const THRESHOLDS = [100, 200, 450];

const props = defineProps({
  imageData: {
    type: Object,
    default: null,
  },
});

const vtkContainer = ref(null);
const isEraserEnabled = ref(false);


let genericRenderWindow = null;
let renderer = null;
let renderWindow = null;
let volume = null;
let mapper = null;
let picker = null;
let maskArray = null;
let originScalars = null;


const initVtk = () => {
  if (!vtkContainer.value) return;

  // 设置 VTK 渲染窗口
  genericRenderWindow = vtkGenericRenderWindow.newInstance({
    background: [0, 0, 0],
  });
  genericRenderWindow.setContainer(vtkContainer.value);


  renderer = genericRenderWindow.getRenderer();

  // 切换为正交投影 
  const camera = renderer.getActiveCamera();
  camera.setParallelProjection(true);

  renderWindow = genericRenderWindow.getRenderWindow();

  // 初始化拾取器 (Picker)
  picker = vtkCellPicker.newInstance();
  picker.setPickFromList(1);
  picker.setTolerance(0);

  // 调整大小处理
  const resizeObserver = new ResizeObserver(() => {
    // 限制渲染分辨率， 
    if (genericRenderWindow && vtkContainer.value) {
      const { width, height } = vtkContainer.value.getBoundingClientRect();
      const renderWindow = genericRenderWindow.getRenderWindow();
      if (renderWindow) {
        const views = renderWindow.getViews();
        if (views && views.length > 0) {
          const openglRenderWindow = views[0];
          // 限制高分辨率上的渲染压力
          openglRenderWindow.setSize(Math.floor(width), Math.floor(height));
          renderWindow.render();
        }
      }
    }
  });
  resizeObserver.observe(vtkContainer.value);
};


// --------------------------------------------------------------------------------
// 3D 橡皮擦功能 (通过 Overlay 触发)
// --------------------------------------------------------------------------------

const handleEraseEvent = ({ center, radius }) => {
  if (!volume) return;
  const view = genericRenderWindow.getInteractor().getView();
  const containerRect = vtkContainer.value.getBoundingClientRect();
  const height = containerRect.height;
  const displayX = center.x;
  const displayY = height - center.y; // 翻转 Y 轴，使用容器 CSS 高度

  picker.pick([displayX, displayY, 0], renderer);

  const worldPos = picker.getPickPosition(); // 物理坐标

  const displayCenter = genericRenderWindow.getInteractor().getView().worldToDisplay(
    worldPos[0],
    worldPos[1],
    worldPos[2],
    renderer
  );

  const displayEdgeX = displayX + radius;
  const displayEdgeY = displayY;

  // 将屏幕边缘点转回世界坐标 (维持深度不变)
  // displayToWorld 期望参数: (x, y, z, renderer)
  const worldEdge = genericRenderWindow.getInteractor().getView().displayToWorld(
    displayEdgeX,
    displayEdgeY,
    displayCenter[2],
    renderer
  );

  // 距离
  const worldRadius = Math.sqrt(
    Math.pow(worldEdge[0] - worldPos[0], 2) +
    Math.pow(worldEdge[1] - worldPos[1], 2) +
    Math.pow(worldEdge[2] - worldPos[2], 2)
  );

  // 获取相机视角方向
  const camera = renderer.getActiveCamera();
  const viewNormal = camera.getDirectionOfProjection(); // [nx, ny, nz]

  // 执行圆柱体（隧道）擦除
  eraseCylinder(worldPos, viewNormal, worldRadius);
};

const eraseCylinder = (centerWorld, direction, radius) => {
  const imageData = volume.getMapper().getInputData();
  const scalars = imageData.getPointData().getScalars().getData();
  const dims = imageData.getDimensions(); // size
  const spacing = imageData.getSpacing();
  const origin = imageData.getOrigin();

  const total = dims[0] * dims[1] * dims[2];
  if (!maskArray || maskArray.length !== total) maskArray = new Uint8Array(total);

  // 当前的射线
  const p0 = centerWorld;
  const v = direction; // 假设已归一化
  const r2 = radius * radius;

  // 物理包围盒
  const bounds = imageData.getBounds(); // [xmin, xmax, ymin, ymax, zmin, zmax]
  // 计算射线与 Volume 的入点和出点
  const tRange = intersectRayAABB(p0, v, bounds);
  if (!tRange) return; // 无交点
  const pStart = [
    p0[0] + tRange[0] * v[0],
    p0[1] + tRange[0] * v[1],
    p0[2] + tRange[0] * v[2]
  ];
  const pEnd = [
    p0[0] + tRange[1] * v[0],
    p0[1] + tRange[1] * v[1],
    p0[2] + tRange[1] * v[2]
  ];

  // 计算包含该线段及半径的 AABB (在世界坐标系)
  const aabbMin = [
    Math.min(pStart[0], pEnd[0]) - radius,
    Math.min(pStart[1], pEnd[1]) - radius,
    Math.min(pStart[2], pEnd[2]) - radius
  ];
  const aabbMax = [
    Math.max(pStart[0], pEnd[0]) + radius,
    Math.max(pStart[1], pEnd[1]) + radius,
    Math.max(pStart[2], pEnd[2]) + radius
  ];

  // 体素bbox范围
  const xMin = Math.max(0, Math.floor((aabbMin[0] - origin[0]) / spacing[0]));
  const xMax = Math.min(dims[0] - 1, Math.ceil((aabbMax[0] - origin[0]) / spacing[0]));
  const yMin = Math.max(0, Math.floor((aabbMin[1] - origin[1]) / spacing[1]));
  const yMax = Math.min(dims[1] - 1, Math.ceil((aabbMax[1] - origin[1]) / spacing[1]));
  const zMin = Math.max(0, Math.floor((aabbMin[2] - origin[2]) / spacing[2]));
  const zMax = Math.min(dims[2] - 1, Math.ceil((aabbMax[2] - origin[2]) / spacing[2]));

  let modified = false;

  // 遍历 AABB 内的体素
  for (let k = zMin; k <= zMax; k++) {
    for (let j = yMin; j <= yMax; j++) {
      for (let i = xMin; i <= xMax; i++) {
        // 当前体素的世界坐标 A
        const px = origin[0] + i * spacing[0];
        const py = origin[1] + j * spacing[1];
        const pz = origin[2] + k * spacing[2];

        // 视线向量跟 向量AP 叉积的 == 平行四边形面积 
        // 叉乘的值 / 平行四边形面积  == 高度（p 到 射线的垂直距离）
        const apx = px - p0[0];
        const apy = py - p0[1];
        const apz = pz - p0[2];

        // AP x V
        // 叉乘向量的长度 = 两个向量组成的平行四边形面积
        const cx = apy * v[2] - apz * v[1];
        const cy = apz * v[0] - apx * v[2];
        const cz = apx * v[1] - apy * v[0];

        // 计算叉乘向量的长度的平方
        const distSq = cx * cx + cy * cy + cz * cz;

        if (distSq <= r2) {
          const flatIndex = i + j * dims[0] + k * dims[0] * dims[1];
          if (maskArray[flatIndex] !== 1) {
            maskArray[flatIndex] = 1;
            // 命中时直接写渲染标量，避免二次遍历
            scalars[flatIndex] = -2000;
            modified = true;
          }
        }
      }
    }
  }

  if (modified) {
    imageData.getPointData().getScalars().setData(scalars);
    imageData.modified();
    renderWindow.render();
  }
};

// 调整窗宽窗位相关逻辑
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
    volume.delete();
    volume = null;
  }
  if (mapper) {
    mapper.delete();
    mapper = null;
  }
  if (maskArray) {
    maskArray = null; // 释放旧 mask
  }

  const vtkImage = convertItkToVtkImage(props.imageData);

  // 创建映射器
  // 光线步进逻辑
  mapper = vtkVolumeMapper.newInstance();
  mapper.setInputData(vtkImage);
  // 固定采样参数，避免初次切换视角时的欠采样发糊
  const sp = vtkImage.getSpacing();
  const minSp = Math.min(sp[0], sp[1], sp[2]);
  mapper.setAutoAdjustSampleDistances(false);
  mapper.setSampleDistance(minSp * 0.5);
  if (mapper.setImageSampleDistance) mapper.setImageSampleDistance(0.75);
  if (mapper.setUseJittering) mapper.setUseJittering(true);
  if (mapper.setMaximumSamplesPerRay) {
    const bds = vtkImage.getBounds();
    const dxL = bds[1] - bds[0];
    const dyL = bds[3] - bds[2];
    const dzL = bds[5] - bds[4];
    const diag = Math.sqrt(dxL * dxL + dyL * dyL + dzL * dzL);
    const steps = Math.ceil(diag / (minSp * 0.5)) + 128;
    mapper.setMaximumSamplesPerRay(Math.min(Math.max(steps, 1024), 8192));
  }
  
  const scalars = vtkImage.getPointData().getScalars().getData();
  // 备份原始 CT 数据（只读备份，用于按需恢复可见体素值）
  originScalars = scalars.slice();
  maskArray = new Uint8Array(scalars.length);

  // 创建体对象
  volume = vtkVolume.newInstance();
  // 体素使用mapper 逻辑来渲染
  volume.setMapper(mapper);

  // 开启阴影效果（实现立体感的关键）
  volume.getProperty().setShade(true);
  volume.getProperty().setAmbient(0.2);
  volume.getProperty().setDiffuse(0.8);
  volume.getProperty().setSpecular(0.1);
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

const smoothOnce = () => {
  if (!volume) return;
  const imageData = volume.getMapper().getInputData();
  const dims = imageData.getDimensions();
  const current = imageData.getPointData().getScalars().getData();
  const smoothed = gaussianSmoothArray3D(current, dims, { sigma: 0.8 });
  imageData.getPointData().getScalars().setData(smoothed);
  imageData.modified();
  renderWindow.render();
};

const resetToOriginal = () => {
  if (!volume || !originScalars) return;
  const imageData = volume.getMapper().getInputData();
  const scalars = imageData.getPointData().getScalars().getData();
  if (scalars.length !== originScalars.length) return;
  for (let i = 0; i < scalars.length; i++) {
    scalars[i] = originScalars[i];
  }
  if (maskArray) maskArray.fill(0);
  imageData.getPointData().getScalars().setData(scalars);
  imageData.modified();
  renderWindow.render();
};

const setMedicalView = (type) => {
  if (!renderer || !volume) return;
  const camera = renderer.getActiveCamera();
  const imageData = volume.getMapper().getInputData();
  const dir = imageData.getDirection ? imageData.getDirection() : null;
  let iAxis = [1, 0, 0];
  let jAxis = [0, 1, 0];
  let kAxis = [0, 0, 1];
  if (dir && dir.length === 9) {
    iAxis = [dir[0], dir[3], dir[6]];
    jAxis = [dir[1], dir[4], dir[7]];
    kAxis = [dir[2], dir[5], dir[8]];
  }
  const b = imageData.getBounds();
  const center = [(b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2];
  const dx = b[1] - b[0];
  const dy = b[3] - b[2];
  const dz = b[5] - b[4];
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz) * 0.8;
  let pos;
  if (type === 'axial') {
    // 在中心点的上边
    pos = [center[0] + kAxis[0] * d, center[1] + kAxis[1] * d, center[2] + kAxis[2] * d];
    camera.setViewUp([-jAxis[0], -jAxis[1], -jAxis[2]]);
  } else if (type === 'sagittal') {
    pos = [center[0] + iAxis[0] * d, center[1] + iAxis[1] * d, center[2] + iAxis[2] * d];
    camera.setViewUp(kAxis);
  } else {
    pos = [center[0] - jAxis[0] * d, center[1] - jAxis[1] * d, center[2] - jAxis[2] * d];
    camera.setViewUp(kAxis);
  }
  camera.setFocalPoint(center[0], center[1], center[2]);
  camera.setPosition(pos[0], pos[1], pos[2]);
  renderer.resetCameraClippingRange();
  if (renderer.updateLightsGeometryToFollowCamera) {
    renderer.updateLightsGeometryToFollowCamera();
  }
  if (mapper && mapper.setImageSampleDistance) mapper.setImageSampleDistance(0.75);
  if (mapper && mapper.setInteractiveSampleDistance) mapper.setInteractiveSampleDistance(1.5);
  const interactor = renderWindow.getInteractor && renderWindow.getInteractor();
  if (interactor && interactor.setAnimationState) interactor.setAnimationState(false);
  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(() => renderWindow.render());
  }
};

onMounted(() => {
  initVtk();
  if (props.imageData) {
    updateVolume();
    setTimeout(() => setMedicalView('coronal'), 0);
  }
});

watch(() => props.imageData, () => {
  updateVolume();
  setTimeout(() => setMedicalView('coronal'), 0);
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

    <!-- 橡皮擦 Overlay -->
    <EraserOverlay :enabled="isEraserEnabled" @erase="handleEraseEvent" />

    <div class="controls-overlay">
      <div class="control-group">
        <label>
          <input type="checkbox" v-model="isEraserEnabled" />
          启用 3D 橡皮擦
        </label>
        <small v-if="isEraserEnabled" style="display: block; margin-top: 4px; color: #666;">
          右键拖拽画圆以擦除
        </small>
        <button style="margin-top: 8px;" @click="resetToOriginal">重置显示</button>
        <button style="margin-top: 8px; margin-left: 8px;" @click="smoothOnce">高斯平滑一次</button>
        <div style="margin-top: 8px;">
          <button @click="setMedicalView('coronal')" style="margin-right: 6px;">前视(冠状)</button>
          <button @click="setMedicalView('sagittal')" style="margin-right: 6px;">侧视(矢状)</button>
          <button @click="setMedicalView('axial')">顶视(轴位)</button>
        </div>
      </div>
    </div>
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

.controls-overlay {
  position: absolute;
  top: 10px;
  right: 10px;
  background: rgba(255, 255, 255, 0.8);
  padding: 10px;
  border-radius: 4px;
  z-index: 10;
}

.control-group {
  margin-bottom: 8px;
  display: flex;
  flex-direction: column;
}
</style>
