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
