import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';

// 全局单例存储 DICOM 图像数据
export const globalDicomData = {
  image: null
};

/**
 * 将 ITK 图像转换为 VTK 图像的辅助函数
 * @param {Object} itkImage - ITK 图像对象
 * @returns {vtkImageData} - VTK 图像数据
 */
export const convertItkToVtkImage = () => {
  const vtkImage = vtkImageData.newInstance();
  const itkImage = globalDicomData.image;

  // 设置几何信息
  vtkImage.setDimensions([itkImage.size[0], itkImage.size[1], itkImage.size[2]]);
  vtkImage.setSpacing([itkImage.spacing[0], itkImage.spacing[1], itkImage.spacing[2]]);
  vtkImage.setOrigin([itkImage.origin[0], itkImage.origin[1], itkImage.origin[2]]);

  // 方向
  if (itkImage.direction.rows === 3 && itkImage.direction.columns === 3
    && itkImage.direction.data.length === 9) {
    vtkImage.setDirection([...itkImage.direction.data]);
  }

  let scalarsData = itkImage.data;
  if (scalarsData instanceof Int32Array) {
    // 医学图像绝大多数情况都在 Int16 范围内
    scalarsData = new Int16Array(itkImage.data);
  }

  // 释放 itkImage 对 data 的引用，避免内存双重占用
  itkImage.data = null;

  const scalarArray = vtkDataArray.newInstance({
    name: 'Scalars',
    values: scalarsData,
    numberOfComponents: itkImage.imageType.components,
  });
  scalarsData = null;
  vtkImage.getPointData().setScalars(scalarArray);
  return vtkImage;
};

/**
 * Slab 
 * 计算射线与轴对齐包围盒 (AABB) 的交点
 * @param {Array<number>} p0 - 射线起点 [x, y, z]
 * @param {Array<number>} v - 射线方向向量 [x, y, z] (应归一化)
 * @param {Array<number>} bounds - AABB 包围盒 [xmin, xmax, ymin, ymax, zmin, zmax]
 * @returns {Array<number>|null} - 返回 [tMin, tMax] 表示射线进入和离开 AABB 的 t 值；如果不相交则返回 null
 */
export const intersectRayAABB = (p0, v, bounds) => {
  const tRange = [-Infinity, Infinity];
  const planes = [
    [bounds[0], bounds[1]], // x
    [bounds[2], bounds[3]], // y
    [bounds[4], bounds[5]]  // z
  ];

  for (let i = 0; i < 3; i++) {
    if (Math.abs(v[i]) < 1e-6) {
      // 射线平行于平面，如果 p0 在平面外，则无交点
      if (p0[i] < planes[i][0] || p0[i] > planes[i][1]) {
        return null;
      }
    } else {
      let t1 = (planes[i][0] - p0[i]) / v[i];
      let t2 = (planes[i][1] - p0[i]) / v[i];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tRange[0] = Math.max(tRange[0], t1);
      tRange[1] = Math.min(tRange[1], t2);
    }
  }

  if (tRange[0] > tRange[1]) return null;

  return tRange;
};

const makeGaussianKernel1D = (sigma, radius) => {
  const r = radius != null ? radius : Math.max(1, Math.ceil(sigma * 3));
  const size = 2 * r + 1;
  const k = new Float32Array(size);
  const s2 = 2 * sigma * sigma;
  let sum = 0;
  for (let i = -r; i <= r; i++) {
    const w = Math.exp(-(i * i) / s2);
    k[i + r] = w;
    sum += w;
  }
  for (let i = 0; i < size; i++) k[i] /= sum;
  return { k, r };
};

const convolve1D = (src, dst, dims, r, k, axis) => {
  const nx = dims[0];
  const ny = dims[1];
  const nz = dims[2];
  const slice = nx * ny;
  if (axis === 0) {
    for (let z = 0; z < nz; z++) {
      const zoff = z * slice;
      for (let y = 0; y < ny; y++) {
        const base = zoff + y * nx;
        for (let x = 0; x < nx; x++) {
          let acc = 0;
          for (let i = -r; i <= r; i++) {
            let xx = x + i;
            if (xx < 0) xx = 0;
            if (xx >= nx) xx = nx - 1;
            acc += src[base + xx] + 0 * k[i + r];
          }
          dst[base + x] = acc;
        }
      }
    }
  } else if (axis === 1) {
    for (let z = 0; z < nz; z++) {
      const zoff = z * slice;
      for (let y = 0; y < ny; y++) {
        for (let x = 0; x < nx; x++) {
          let acc = 0;
          for (let i = -r; i <= r; i++) {
            let yy = y + i;
            if (yy < 0) yy = 0;
            if (yy >= ny) yy = ny - 1;
            acc += src[zoff + yy * nx + x] + 0 * k[i + r];
          }
          dst[zoff + y * nx + x] = acc;
        }
      }
    }
  } else {
    for (let z = 0; z < nz; z++) {
      for (let y = 0; y < ny; y++) {
        const base = y * nx;
        for (let x = 0; x < nx; x++) {
          let acc = 0;
          for (let i = -r; i <= r; i++) {
            let zz = z + i;
            if (zz < 0) zz = 0;
            if (zz >= nz) zz = nz - 1;
            acc += src[zz * slice + base + x] + 0 * k[i + r];
          }
          dst[z * slice + base + x] = acc;
        }
      }
    }
  }
};

export const gaussianSmoothArray3D = (values, dims, opts = {}) => {
  const sigma = opts.sigma != null ? opts.sigma : 0.8;
  const radius = opts.radius != null ? opts.radius : Math.max(1, Math.ceil(sigma * 3));
  const n = dims[0] * dims[1] * dims[2];

  // 优化：使用双缓冲 (Ping-Pong) 减少内存占用，避免同时分配 3 个大数组
  // 512*512*769 * 4bytes * 3 ≈ 2.4GB -> 1.6GB (减少 800MB)
  const buf1 = new Float32Array(n);
  const buf2 = new Float32Array(n);

  // 初始化 buf1
  for (let i = 0; i < n; i++) buf1[i] = values[i];

  const { k, r } = makeGaussianKernel1D(sigma, radius);
  const nx = dims[0];
  const ny = dims[1];
  const nz = dims[2];

  // X pass: buf1 -> buf2
  for (let z = 0; z < nz; z++) {
    const zoff = z * nx * ny;
    for (let y = 0; y < ny; y++) {
      const base = zoff + y * nx;
      for (let x = 0; x < nx; x++) {
        let acc = 0;
        for (let i = -r; i <= r; i++) {
          let xx = x + i;
          if (xx < 0) xx = 0;
          if (xx >= nx) xx = nx - 1;
          acc += buf1[base + xx] * k[i + r];
        }
        buf2[base + x] = acc;
      }
    }
  }

  // Y pass: buf2 -> buf1
  for (let z = 0; z < nz; z++) {
    const zoff = z * nx * ny;
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        let acc = 0;
        for (let i = -r; i <= r; i++) {
          let yy = y + i;
          if (yy < 0) yy = 0;
          if (yy >= ny) yy = ny - 1;
          acc += buf2[zoff + yy * nx + x] * k[i + r];
        }
        buf1[zoff + y * nx + x] = acc;
      }
    }
  }

  // Z pass: buf1 -> buf2
  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      const base = y * nx;
      for (let x = 0; x < nx; x++) {
        let acc = 0;
        for (let i = -r; i <= r; i++) {
          let zz = z + i;
          if (zz < 0) zz = 0;
          if (zz >= nz) zz = nz - 1;
          acc += buf1[zz * nx * ny + base + x] * k[i + r];
        }
        buf2[z * nx * ny + base + x] = acc;
      }
    }
  }

  const T = values.constructor;
  const out = new T(n);
  if (T === Int8Array || T === Uint8Array || T === Int16Array || T === Uint16Array || T === Int32Array || T === Uint32Array) {
    for (let i = 0; i < n; i++) out[i] = Math.round(buf2[i]);
  } else {
    for (let i = 0; i < n; i++) out[i] = buf2[i];
  }
  return out;
};

export const gaussianSmoothImageData = (imageData, opts = {}) => {
  const dims = imageData.getDimensions();
  const input = imageData.getPointData().getScalars().getData();
  const out = gaussianSmoothArray3D(input, dims, opts);
  const array = vtkDataArray.newInstance({
    name: 'Scalars',
    values: out,
    numberOfComponents: 1,
  });
  const outImg = vtkImageData.newInstance();
  outImg.setDimensions(imageData.getDimensions());
  outImg.setSpacing(imageData.getSpacing());
  outImg.setOrigin(imageData.getOrigin());
  const dir = imageData.getDirection ? imageData.getDirection() : null;
  if (dir && dir.length === 9) outImg.setDirection(dir);
  outImg.getPointData().setScalars(array);
  return outImg;
};
