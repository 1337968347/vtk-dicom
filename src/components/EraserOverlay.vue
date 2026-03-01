<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  enabled: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['erase']);

const isDrawing = ref(false);
const startPoint = ref({ x: 0, y: 0 });
const currentPoint = ref({ x: 0, y: 0 });
const radius = ref(0);
const svgRef = ref(null);

const centerPoint = computed(() => {
  return {
    x: (startPoint.value.x + currentPoint.value.x) / 2,
    y: (startPoint.value.y + currentPoint.value.y) / 2
  };
});

const getMousePos = (e) => {
  if (!svgRef.value) return { x: 0, y: 0 };
  const rect = svgRef.value.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };
};

const handleMouseDown = (e) => {
  if (!props.enabled || e.button !== 2) return; // 仅响应右键

  e.preventDefault();
  isDrawing.value = true;
  const pos = getMousePos(e);
  startPoint.value = pos;
  currentPoint.value = pos;
  radius.value = 0;

  // 阻止事件冒泡，防止 vtk 接收到右键点击
  e.stopPropagation();
};

const handleMouseMove = (e) => {
  if (!isDrawing.value) return;

  const pos = getMousePos(e);
  currentPoint.value = pos;

  // 计算半径
  radius.value = Math.sqrt(
    Math.pow(pos.x - startPoint.value.x, 2) +
    Math.pow(pos.y - startPoint.value.y, 2)
  ) / 2;

  e.stopPropagation();
};

const handleMouseUp = (e) => {
  if (!isDrawing.value) return;

  // 触发擦除事件，传递圆心和半径
  if (radius.value > 0) {
    emit('erase', {
      center: centerPoint.value,
      radius: radius.value
    });
  }

  isDrawing.value = false;
  radius.value = 0;
  e.stopPropagation();
};

// 阻止右键菜单
const handleContextMenu = (e) => {
  if (props.enabled) {
    e.preventDefault();
  }
};

</script>

<template>
  <div class="eraser-overlay" :class="{ 'enabled': enabled }" ref="svgRef" @mousedown="handleMouseDown"
    @mousemove="handleMouseMove" @mouseup="handleMouseUp" @contextmenu="handleContextMenu">
    <svg v-if="isDrawing" width="100%" height="100%">
      <circle :cx="centerPoint.x" :cy="centerPoint.y" :r="radius" stroke="red" stroke-width="2"
        fill="rgba(255, 0, 0, 0.1)" stroke-dasharray="5,5" />
      <!-- 连接圆心和鼠标的虚线，可选 -->
      <!-- <line 
        :x1="startPoint.x" 
        :y1="startPoint.y" 
        :x2="currentPoint.x" 
        :y2="currentPoint.y" 
        stroke="red" 
        stroke-width="1" 
        stroke-dasharray="2,2"
      /> -->
    </svg>
  </div>
</template>

<style scoped>
.eraser-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 10;
  /* 确保在 Canvas 上方 */
  pointer-events: none;
  /* 默认不阻挡事件 */
}

.eraser-overlay.enabled {
  pointer-events: auto;
  /* 启用时接管鼠标事件 */
  cursor: crosshair;
}
</style>