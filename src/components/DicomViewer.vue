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
import vtkCellPicker from '@kitware/vtk.js/Rendering/Core/CellPicker';
import { intersectRayAABB } from '../utils';

const THRESHOLDS = [100, 200, 450];

const props = defineProps({
  imageData: {
    type: Object,
    default: null,
  },
});

const vtkContainer = ref(null);
const isEraserEnabled = ref(false);
const eraserRadius = ref(10);
const isDragging = ref(false);

let genericRenderWindow = null;
let renderer = null;
let renderWindow = null;
let volume = null;
let mapper = null;
let picker = null;
let interactor = null;

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

  // 切换为正交投影 
  const camera = renderer.getActiveCamera();
  camera.setParallelProjection(true);

  renderWindow = genericRenderWindow.getRenderWindow();
  interactor = genericRenderWindow.getInteractor();

  // 初始化拾取器 (Picker)
  picker = vtkCellPicker.newInstance();
  picker.setPickFromList(1);
  picker.setTolerance(0);

  // 绑定交互事件
  interactor.onRightButtonPress((callData) => {
    if (isEraserEnabled.value) {
      isDragging.value = true;
      handleEraser(callData);
    }
  });

  interactor.onRightButtonRelease(() => {
    isDragging.value = false;
  });

  // 调整大小处理
  const resizeObserver = new ResizeObserver(() => {
    genericRenderWindow.resize();
  });
  resizeObserver.observe(vtkContainer.value);
};


// --------------------------------------------------------------------------------
// 3D 橡皮擦功能
// --------------------------------------------------------------------------------
const handleEraser = (callData) => {
  debugger
  if (!volume || !isEraserEnabled.value) return;

  const { position } = callData;
  picker.pick([position.x, position.y, 0], renderer);

  const pickedPosition = picker.getPickPosition(); // 世界坐标 [x, y, z]

  // 获取相机视角方向
  const camera = renderer.getActiveCamera();
  const viewNormal = camera.getDirectionOfProjection(); // [nx, ny, nz]

  // 执行圆柱体（隧道）擦除
  eraseCylinder(pickedPosition, viewNormal, eraserRadius.value);
};


/**
 * 删除指定方向的圆柱体
 * @param centerWorld 当前视平面的起始点
 * @param direction 视线看向方向
 * @param radius 画的圆半径 （体素单位）
 */
const eraseCylinder = (centerWorld, direction, radius) => {
  const imageData = volume.getMapper().getInputData();
  // Int32Array
  const scalars = imageData.getPointData().getScalars().getData();
  const dims = imageData.getDimensions(); // size
  const spacing = imageData.getSpacing();
  const origin = imageData.getOrigin();

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
          // 命中
          if (scalars[flatIndex] !== -2000) {
            scalars[flatIndex] = -2000;
            modified = true;
          }
        }
      }
    }
  }

  if (modified) {
    // 关键：通知 vtk 数据已更新
    imageData.getPointData().getScalars().setData(scalars);
    imageData.modified();
    renderWindow.render();
  }
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
    <div class="controls-overlay">
      <div class="control-group">
        <label>
          <input type="checkbox" v-model="isEraserEnabled" />
          启用 3D 橡皮擦
        </label>
      </div>
      <div class="control-group" v-if="isEraserEnabled">
        <label>
          擦除半径: {{ eraserRadius }} mm
          <input type="range" v-model.number="eraserRadius" min="1" max="50" step="1" />
        </label>
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
