import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import * as Cesium from 'cesium';
import { useConnectionStore } from '../../stores/connectionStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAddressFields } from '../../hooks/useAddressFields';
import { getDesc } from '../../utils/formatDesc';
import type { ConnectionRecord, ImageryType } from '../../types';

// ═══════════════════════════════════════════════════════
//  FlyingLine — 自定义 Cesium Fabric 飞线材质 (GLSL)
//  活跃连接专用: 流光拖尾动画, 头亮尾暗
// ═══════════════════════════════════════════════════════

class FlyingLineMaterialProperty {
  private _definitionChanged = new Cesium.Event();
  private _color: Cesium.Color;
  private _duration: number;
  private _time: number;

  constructor(color: Cesium.Color, duration = 1000) {
    this._color = color;
    this._duration = duration;
    this._time = performance.now();
  }

  get isConstant() { return false; }
  get definitionChanged() { return this._definitionChanged; }

  getType() { return 'FlyingLine'; }

  getValue(_time: Cesium.JulianDate, result?: Record<string, unknown>) {
    if (!result) result = {};
    result.color = Cesium.Color.clone(this._color);
    result.time = ((performance.now() - this._time) % this._duration) / this._duration;
    return result;
  }

  equals(other: unknown) {
    return this === other;
  }
}

// 注册一次即可
if (!(Cesium.Material as any)._materialCache.getMaterial('FlyingLine')) {
  (Cesium.Material as any)._materialCache.addMaterial('FlyingLine', {
    fabric: {
      type: 'FlyingLine',
      uniforms: { color: new Cesium.Color(1, 0, 0, 1), time: 0 },
      source: `
        czm_material czm_getMaterial(czm_materialInput materialInput) {
          czm_material material = czm_getDefaultMaterial(materialInput);
          vec2 st = materialInput.st;
          float t = fract(st.s - time);
          // 头部明亮 + 拖尾始终保持可见底色
          float head = smoothstep(0.0, 1.0, t);
          float alpha = 0.15 + head * 0.85;
          material.diffuse = color.rgb;
          material.alpha = color.a * alpha;
          // 头部辉光加亮
          material.emission = color.rgb * head * 0.4;
          return material;
        }
      `,
    },
    translucent: () => true,
  });
}

// ═══════════════════════════════════════════════════════
//  X 标记 Canvas (封禁线用, 单次创建)
// ═══════════════════════════════════════════════════════
const xMarkerCanvas = (() => {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 48; c.height = 48;
  const ctx = c.getContext('2d')!;
  ctx.strokeStyle = 'rgba(255, 50, 50, 1.0)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(8, 8); ctx.lineTo(40, 40); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(40, 8); ctx.lineTo(8, 40); ctx.stroke();
  return c;
})();

interface Props {
  serverLat: number;
  serverLng: number;
}

/** 弹窗数据: 点击某个坐标点后展示的 IP 列表 */
interface PointPopup {
  screenX: number;
  screenY: number;
  ck: string;
  locs: ConnectionRecord[];
  desc: string;
}

export default function CesiumGlobe({ serverLat, serverLng }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const groupsRef = useRef<Map<string, { locs: ConnectionRecord[]; bestDesc: string }>>(new Map());
  const [popup, setPopup] = useState<PointPopup | null>(null);

  const allIpData = useConnectionStore((s) => s.allIpData);
  const activeConnections = useConnectionStore((s) => s.activeConnections);
  const activeBannedIps = useConnectionStore((s) => s.activeBannedIps);
  const config = useSettingsStore((s) => s.config);

  const homeCountry = config?.home_country ?? '中国';
  const ionToken = config?.cesium_ion_token ?? '';

  const [imageryType, setImageryType] = useState<ImageryType>(() => {
    return (localStorage.getItem('frp_pv_imagery_type') as ImageryType) ?? 'dark';
  });
  useEffect(() => {
    const handler = (e: Event) => setImageryType((e as CustomEvent).detail as ImageryType);
    window.addEventListener('frp_pv_imagery_type', handler);
    return () => window.removeEventListener('frp_pv_imagery_type', handler);
  }, []);

  const addressFields = useAddressFields();

  // ── 初始化 Viewer ──
  useEffect(() => {
    if (!containerRef.current) return;

    let viewer: Cesium.Viewer;
    let handler: Cesium.ScreenSpaceEventHandler | null = null;
    try {
    viewer = new Cesium.Viewer(containerRef.current, {
      baseLayerPicker: false,
      baseLayer: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      selectionIndicator: false,
      timeline: false,
      animation: false,
      fullscreenButton: false,
      navigationHelpButton: false,
      infoBox: false,
      requestRenderMode: true,
      maximumRenderTimeChange: Infinity,
    });

    // 暗色底图
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#0a0a1a');
    viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#000008');
    if (viewer.scene.skyBox) viewer.scene.skyBox.show = false;
    if (viewer.scene.sun) viewer.scene.sun.show = false;
    if (viewer.scene.moon) viewer.scene.moon.show = false;
    viewer.scene.fog.enabled = false;

    // 隐藏 credits
    const creditEl = viewer.cesiumWidget.creditContainer as HTMLElement;
    if (creditEl) creditEl.style.display = 'none';

    // 初始视角
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(serverLng, serverLat, 22_000_000),
    });

    // 服务器标记
    viewer.entities.add({
      id: '__server__',
      position: Cesium.Cartesian3.fromDegrees(serverLng, serverLat),
      point: {
        pixelSize: 10,
        color: Cesium.Color.LIME,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
      },
      label: {
        text: '服务器',
        font: 'bold 14px sans-serif',
        fillColor: Cesium.Color.WHITE,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        outlineWidth: 4,
        outlineColor: Cesium.Color.BLACK,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -14),
        scaleByDistance: new Cesium.NearFarScalar(5e5, 1.0, 2e7, 0.7),
      },
    });

    // ── 点击实体 → 弹出 IP 列表 ──
    handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
      const picked = viewer.scene.pick(click.position);
      if (Cesium.defined(picked) && picked.id && typeof picked.id.id === 'string') {
        const eid: string = picked.id.id;
        if (eid.startsWith('pt_')) {
          const ck = eid.slice(3);
          const g = groupsRef.current.get(ck);
          if (g && g.locs.length > 0) {
            setPopup({
              screenX: click.position.x,
              screenY: click.position.y,
              ck,
              locs: g.locs,
              desc: g.bestDesc,
            });
            return;
          }
        }
      }
      // 点击空白处关闭
      setPopup(null);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    viewerRef.current = viewer;
    } catch (err) {
      console.error('[CesiumGlobe] 初始化失败:', err);
      return;
    }

    return () => {
      handler?.destroy();
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
  }, [serverLat, serverLng]);

  // ── 切换底图影像 ──
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    // 设置 Ion Token (Ion 系列底图依赖此 token)
    if (ionToken) {
      Cesium.Ion.defaultAccessToken = ionToken;
    }

    viewer.imageryLayers.removeAll();

    // ── 工具函数 ──

    /** CartoDB 瓦片 */
    const addCarto = (style: string) => {
      viewer.imageryLayers.addImageryProvider(
        new Cesium.UrlTemplateImageryProvider({
          url: `https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}.png`,
          subdomains: ['a', 'b', 'c', 'd'],
          maximumLevel: 18,
          credit: new Cesium.Credit('© CartoDB © OpenStreetMap'),
        }),
      );
    };

    /** Esri ArcGIS REST MapServer */
    const addEsri = (service: string) => {
      Cesium.ArcGisMapServerImageryProvider.fromUrl(
        `https://services.arcgisonline.com/ArcGIS/rest/services/${service}/MapServer`,
      ).then((provider) => {
        if (viewerRef.current && !viewerRef.current.isDestroyed()) {
          viewerRef.current.imageryLayers.addImageryProvider(provider);
          viewerRef.current.scene.requestRender();
        }
      }).catch((err) => console.warn(`[CesiumGlobe] Esri ${service} 加载失败:`, err));
    };

    /** Cesium Ion 世界底图 (Bing Maps) */
    const addIonWorld = (style: Cesium.IonWorldImageryStyle) => {
      Cesium.createWorldImageryAsync({ style }).then((provider) => {
        if (viewerRef.current && !viewerRef.current.isDestroyed()) {
          viewerRef.current.imageryLayers.addImageryProvider(provider);
          viewerRef.current.scene.requestRender();
        }
      }).catch((err) => console.warn('[CesiumGlobe] Ion 底图加载失败:', err));
    };

    /** Cesium Ion 资产 (Sentinel-2, Blue Marble 等) */
    const addIonAsset = (assetId: number) => {
      Cesium.IonImageryProvider.fromAssetId(assetId).then((provider) => {
        if (viewerRef.current && !viewerRef.current.isDestroyed()) {
          viewerRef.current.imageryLayers.addImageryProvider(provider);
          viewerRef.current.scene.requestRender();
        }
      }).catch((err) => console.warn(`[CesiumGlobe] Ion asset ${assetId} 加载失败:`, err));
    };

    /** Google Maps 直连瓦片 */
    const addGoogle = (lyrs: string) => {
      viewer.imageryLayers.addImageryProvider(
        new Cesium.UrlTemplateImageryProvider({
          url: `https://mt{s}.google.com/vt/lyrs=${lyrs}&x={x}&y={y}&z={z}`,
          subdomains: ['0', '1', '2', '3'],
          maximumLevel: 20,
          credit: new Cesium.Credit('© Google'),
        }),
      );
    };



    // ── 底图分发 ──
    switch (imageryType) {
      // ── 纯黑 ──
      case 'dark':
        break; // globe.baseColor 已在初始化时设置

      // ── Cesium Ion: Bing Maps ──
      case 'bing_aerial':
        addIonWorld(Cesium.IonWorldImageryStyle.AERIAL);
        break;
      case 'bing_aerial_labels':
        addIonWorld(Cesium.IonWorldImageryStyle.AERIAL_WITH_LABELS);
        break;
      case 'bing_roads':
        addIonWorld(Cesium.IonWorldImageryStyle.ROAD);
        break;

      // ── Cesium Ion: 其他资产 ──
      case 'sentinel2':
        addIonAsset(3954);
        break;
      case 'blue_marble':
        addIonAsset(3845);
        break;
      case 'earth_at_night':
        addIonAsset(3812);
        break;
      case 'natural_earth':
        addIonAsset(3813);
        break;

      // ── Google Maps (直连瓦片) ──
      case 'google_maps':
        addGoogle('s'); // 卫星
        break;
      case 'google_satellite':
        addGoogle('y'); // 卫星 + 标注
        break;
      case 'google_roadmap':
        addGoogle('m'); // 路线图
        break;
      case 'google_contour':
        addGoogle('p'); // 地形等高线
        break;

      // ── Esri / ArcGIS ──
      case 'arcgis':
        addEsri('World_Imagery');
        break;
      case 'arcgis_hillshade':
        addEsri('Elevation/World_Hillshade');
        break;
      case 'esri_ocean':
        addEsri('Ocean/World_Ocean_Base');
        break;
      case 'esri_street':
        addEsri('World_Street_Map');
        break;
      case 'esri_topo':
        addEsri('World_Topo_Map');
        break;
      case 'esri_dark_gray':
        addEsri('Canvas/World_Dark_Gray_Base');
        break;
      case 'esri_light_gray':
        addEsri('Canvas/World_Light_Gray_Base');
        break;
      case 'esri_natgeo':
        addEsri('NatGeo_World_Map');
        break;

      // ── OpenStreetMap ──
      case 'osm':
        viewer.imageryLayers.addImageryProvider(
          new Cesium.OpenStreetMapImageryProvider({
            url: 'https://a.tile.openstreetmap.org/',
          }),
        );
        break;
      case 'open_topo':
        viewer.imageryLayers.addImageryProvider(
          new Cesium.UrlTemplateImageryProvider({
            url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
            subdomains: ['a', 'b', 'c'],
            maximumLevel: 17,
            credit: new Cesium.Credit('© OpenTopoMap © OpenStreetMap'),
          }),
        );
        break;

      // ── CartoDB ──
      case 'carto_dark':
        addCarto('dark_all');
        break;
      case 'carto_dark_nolabels':
        addCarto('dark_nolabels');
        break;
      case 'carto_light':
        addCarto('light_all');
        break;
      case 'carto_light_nolabels':
        addCarto('light_nolabels');
        break;
      case 'carto_voyager':
        addCarto('rastertiles/voyager');
        break;

      default:
        break;
    }

    viewer.scene.requestRender();
  }, [imageryType, ionToken]);

  // ── 浏览器本地配置: 境外高亮 + 弧线去重距离 + 点聚合范围 (实时响应) ──
  const [foreignHighlight, setForeignHighlight] = useState(() => {
    const v = localStorage.getItem('frp_pv_foreign_highlight');
    return v === null ? true : v === '1';
  });
  const [arcDedupKm, setArcDedupKm] = useState(() => {
    const stored = localStorage.getItem('frp_pv_arc_dedup_km');
    return stored ? Number(stored) : 500000;
  });
  const [ptClusterM, setPtClusterM] = useState(() => {
    const stored = localStorage.getItem('frp_pv_pt_cluster_m');
    return stored ? Number(stored) : 5000;
  });
  // 最短弧线距离: 源 IP 距服务器小于此值时不画弧 (防止服务器附近出现扇形杂乱设降)
  const [minArcDistM, setMinArcDistM] = useState(() => {
    const stored = localStorage.getItem('frp_pv_min_arc_dist_m');
    return stored ? Number(stored) : 10000;
  });
  useEffect(() => {
    const onForeign   = (e: Event) => setForeignHighlight((e as CustomEvent).detail as boolean);
    const onDedup     = (e: Event) => setArcDedupKm((e as CustomEvent).detail as number);
    const onCluster   = (e: Event) => setPtClusterM((e as CustomEvent).detail as number);
    const onMinArc    = (e: Event) => setMinArcDistM((e as CustomEvent).detail as number);
    window.addEventListener('frp_pv_foreign_hl',  onForeign);
    window.addEventListener('frp_pv_arc_dedup',   onDedup);
    window.addEventListener('frp_pv_pt_cluster',  onCluster);
    window.addEventListener('frp_pv_min_arc_dist', onMinArc);
    return () => {
      window.removeEventListener('frp_pv_foreign_hl',  onForeign);
      window.removeEventListener('frp_pv_arc_dedup',   onDedup);
      window.removeEventListener('frp_pv_pt_cluster',  onCluster);
      window.removeEventListener('frp_pv_min_arc_dist', onMinArc);
    };
  }, []);

  // 按坐标 key 分组, 同坐标多 IP 合并为一个点
  const coordKey = (lon: number, lat: number) =>
    `${lon.toFixed(4)}_${lat.toFixed(4)}`;

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    const activeIps = new Set<string>();
    activeConnections.forEach((c) => activeIps.add(c.ip));

    // 本轮所有期望存在的 entity ID
    const wantIds = new Set<string>(['__server__']);

    // 自适应线宽: 对数缩放, 近看稍粗远看稍细 (约 0.5 ~ 1.2)
    const makeAdaptiveWidth = (base: number) =>
      new Cesium.CallbackProperty(() => {
        const alt = viewer.camera.positionCartographic?.height ?? 2e7;
        const logAlt = Math.log10(Math.max(alt, 1e5));
        const scale = Math.min(1.2, Math.max(0.5, 1.2 - (logAlt - 5) * 0.25));
        return base * scale;
      }, false);

    // ── 1. 按坐标分组: 同一位置多 IP 合并为一个点 ──
    interface LocGroup {
      lon: number; lat: number;
      locs: typeof allIpData;
      hasBanned: boolean; hasActive: boolean; hasForeign: boolean;
      bestDesc: string;
    }
    const groups = new Map<string, LocGroup>();

    for (const loc of allIpData) {
      if (loc.lat == null || loc.lon == null) continue;
      const ck = coordKey(loc.lon, loc.lat);
      const isBanned = activeBannedIps.has(loc.ip);
      const isActive = activeIps.has(loc.ip);
      const isForeign = foreignHighlight && !!loc.country && loc.country !== homeCountry;
      const desc = getDesc(loc, addressFields);
      let g = groups.get(ck);
      if (!g) {
        g = { lon: loc.lon, lat: loc.lat, locs: [], hasBanned: false, hasActive: false, hasForeign: false, bestDesc: '' };
        groups.set(ck, g);
      }
      g.locs.push(loc);
      if (isBanned) g.hasBanned = true;
      if (isActive) g.hasActive = true;
      if (isForeign) g.hasForeign = true;
      // 用最长 desc 或第一个有内容的
      if (desc.length > g.bestDesc.length) g.bestDesc = desc;
    }

    // ── 1b. 点聚合: ptClusterM > 0 时将半径内的点合并为一个 ──
    if (ptClusterM > 0) {
      // 将 Map 转为数组按优先级排序 (被封禁 > 活跃 > 历史), 确保高优先对象吸收低优先
      const arr = [...groups.entries()].sort((a, b) => {
        const pri = (g: LocGroup) => g.hasBanned ? 3 : g.hasActive ? 2 : 1;
        return pri(b[1]) - pri(a[1]);
      });
      const merged = new Map<string, LocGroup>();
      const centroids: { lon: number; lat: number; ck: string }[] = [];
      for (const [ck, g] of arr) {
        let found = false;
        for (const c of centroids) {
          if (haversine(g.lon, g.lat, c.lon, c.lat) < ptClusterM) {
            // 合并到已有中心点
            const target = merged.get(c.ck)!;
            target.locs.push(...g.locs);
            if (g.hasBanned)  target.hasBanned  = true;
            if (g.hasActive)  target.hasActive  = true;
            if (g.hasForeign) target.hasForeign = true;
            if (g.bestDesc.length > target.bestDesc.length) target.bestDesc = g.bestDesc;
            found = true;
            break;
          }
        }
        if (!found) {
          merged.set(ck, g);
          centroids.push({ lon: g.lon, lat: g.lat, ck });
        }
      }
      groups.clear();
      for (const [k, v] of merged) groups.set(k, v);
    }

    // ── 2. 弧线去重: 500km 内只留优先级最高的一条 ──
    const ARC_DEDUP_DIST = arcDedupKm;
    const arcCentroids: { lon: number; lat: number; ck: string; priority: number }[] = [];
    const shouldDrawArc = new Set<string>();

    function groupPriority(g: LocGroup) {
      return g.hasBanned ? 3 : g.hasActive ? 2 : 1;
    }

    function haversine(lon1: number, lat1: number, lon2: number, lat2: number) {
      const R = 6_371_000;
      const toRad = Math.PI / 180;
      const dLat = (lat2 - lat1) * toRad;
      const dLon = (lon2 - lon1) * toRad;
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(a));
    }

    // 按优先级排序, 高优先先占位
    const sortedGroups = [...groups.entries()]
      .sort((a, b) => groupPriority(b[1]) - groupPriority(a[1]));

    for (const [ck, g] of sortedGroups) {
      const p = groupPriority(g);
      let merged = false;
      for (const c of arcCentroids) {
        if (haversine(g.lon, g.lat, c.lon, c.lat) < ARC_DEDUP_DIST) {
          if (p > c.priority) {
            shouldDrawArc.delete(c.ck);
            shouldDrawArc.add(ck);
            c.ck = ck; c.priority = p;
          }
          merged = true;
          break;
        }
      }
      if (!merged) {
        arcCentroids.push({ lon: g.lon, lat: g.lat, ck, priority: p });
        shouldDrawArc.add(ck);
      }
    }

    // 最短弧线过滤: 源点距服务器 < minArcDistM 时去掉弧线, 只保留点
    if (minArcDistM > 0 && serverLat != null && serverLng != null) {
      for (const [ck, g] of groups) {
        if (haversine(g.lon, g.lat, serverLng, serverLat) < minArcDistM) {
          shouldDrawArc.delete(ck);
        }
      }
    }

    // ── 3. 渲染每个坐标组 ──
    for (const [ck, g] of groups) {
      const arcId = `arc_${ck}`;
      const ptId = `pt_${ck}`;
      const drawArc = shouldDrawArc.has(ck);
      if (drawArc) wantIds.add(arcId);
      wantIds.add(ptId);

      const isBanned = g.hasBanned;
      const isForeign = g.hasForeign;
      const isActive = g.hasActive;
      const newState = (isBanned ? 'blocked' : isActive ? 'active' : 'historical')
        + (isForeign ? '_foreign' : '');

      if (drawArc && isBanned) {
        for (let i = 0; i < 3; i++) wantIds.add(`arcx_${arcId}_${i}`);
      }

      // ── 弧线 (仅聚类代表者) ──
      if (drawArc) {
        const existingArc = viewer.entities.getById(arcId) as any;
        if (existingArc && existingArc._ipState === newState) {
          // 不变
        } else {
          if (existingArc) {
            viewer.entities.remove(existingArc);
            for (let i = 0; i < 3; i++) {
              const x = viewer.entities.getById(`arcx_${arcId}_${i}`);
              if (x) viewer.entities.remove(x);
            }
          }

          const positions = computeArc(g.lon, g.lat, serverLng, serverLat);

          let material: any;
          let lineWidth: any;
          if (isBanned) {
            material = new Cesium.PolylineDashMaterialProperty({
              color: Cesium.Color.RED.withAlpha(0.8),
              dashLength: 40,
              gapColor: Cesium.Color.TRANSPARENT,
            });
            lineWidth = makeAdaptiveWidth(2);
            if (xMarkerCanvas) {
              [0.25, 0.5, 0.75].forEach((frac, i) => {
                const idx = Math.max(0, Math.min(positions.length - 1, Math.floor(frac * (positions.length - 1))));
                viewer.entities.add({
                  id: `arcx_${arcId}_${i}`,
                  position: positions[idx],
                  billboard: {
                    image: xMarkerCanvas as unknown as string,
                    width: 36, height: 36,
                    verticalOrigin: Cesium.VerticalOrigin.CENTER,
                    horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
                  },
                });
              });
            }
          } else if (isActive) {
            const lineColor = isForeign
              ? Cesium.Color.ORANGE
              : Cesium.Color.fromCssColorString('#00ff88');
            material = new FlyingLineMaterialProperty(lineColor, 800 + Math.random() * 500) as any;
            lineWidth = makeAdaptiveWidth(2.5);
          } else {
            const lineColor = isForeign
              ? Cesium.Color.ORANGE.withAlpha(0.65)
              : Cesium.Color.fromCssColorString('#00d4ff').withAlpha(0.65);
            material = new Cesium.ColorMaterialProperty(lineColor);
            lineWidth = makeAdaptiveWidth(1.5);
          }

          const ent = viewer.entities.add({
            id: arcId,
            polyline: { positions, width: lineWidth, material, clampToGround: false },
          });
          (ent as any)._ipState = newState;
        }
      }

      // ── 合并点 + 单标签 ──
      let pColor: Cesium.Color;
      let lColor: Cesium.Color;
      if (isBanned) {
        pColor = Cesium.Color.RED;
        lColor = Cesium.Color.fromCssColorString('#ff6666');
      } else if (isActive) {
        pColor = isForeign ? Cesium.Color.ORANGE : Cesium.Color.GREEN;
        lColor = isForeign ? Cesium.Color.ORANGE : Cesium.Color.fromCssColorString('#86efac');
      } else {
        pColor = isForeign ? Cesium.Color.RED : Cesium.Color.fromCssColorString('#3b82f6');
        lColor = isForeign ? Cesium.Color.fromCssColorString('#ff6666') : Cesium.Color.fromCssColorString('#93c5fd');
      }

      // 标签: 用组内最佳描述, 如果多 IP 追加计数
      const labelText = g.bestDesc || g.locs[0]?.ip || '';
      const countSuffix = g.locs.length > 1 ? ` (${g.locs.length})` : '';
      const finalLabel = labelText + countSuffix;

      const existingPt = viewer.entities.getById(ptId) as any;
      // 将 finalLabel 也纳入缓存键: 地址字段变化时 label 文字变化 → 强制重建
      // 避免 in-place 替换 Cesium Property 对象不触发重渲染的问题
      const ptState = newState + '|' + finalLabel;
      if (existingPt && existingPt._ipState === ptState) {
        // 完全一致, 无需任何更新
      } else {
        if (existingPt) viewer.entities.remove(existingPt);
        const ptEnt = viewer.entities.add({
          id: ptId,
          position: Cesium.Cartesian3.fromDegrees(g.lon, g.lat),
          point: {
            pixelSize: isBanned ? 9 : isActive ? 8 : 5,
            color: pColor,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            scaleByDistance: new Cesium.NearFarScalar(1e6, 1.0, 2e7, 0.3),
          },
          label: {
            text: finalLabel,
            font: 'bold 12px sans-serif',
            fillColor: lColor,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            outlineWidth: 3,
            outlineColor: Cesium.Color.BLACK,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -12),
            scaleByDistance: new Cesium.NearFarScalar(1e6, 1.0, 2e7, 0.5),
            translucencyByDistance: new Cesium.NearFarScalar(1e6, 1.0, 5e7, 0.2),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 4e7),
          },
        });
        (ptEnt as any)._ipState = ptState;
      }
    }

    // ── 保存分组数据供点击弹窗使用 ──
    const gMap = new Map<string, { locs: ConnectionRecord[]; bestDesc: string }>();
    for (const [ck, g] of groups) {
      gMap.set(ck, { locs: [...g.locs], bestDesc: g.bestDesc });
    }
    groupsRef.current = gMap;

    // 清理不在 wantIds 中的旧实体
    const toRemove = viewer.entities.values.filter(
      (e) => e.id && !wantIds.has(e.id),
    );
    toRemove.forEach((e) => viewer.entities.remove(e));

    viewer.scene.requestRender();
    // label 首次渲染时字体 glyph 纹理异步加载, 需要延迟再触发一帧
    // 否则第一次出现新文字时只有占位框没有文字
    const retryTimer = setTimeout(() => {
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.scene.requestRender();
      }
    }, 300);

    // 飞线材质需要持续 requestRender 来驱动动画
    // 仅在「有活跃连接」时启动渲染循环
    const hasActive = activeConnections.size > 0;
    let animFrameId = 0;
    if (hasActive) {
      const tick = () => {
        if (viewerRef.current && !viewerRef.current.isDestroyed()) {
          viewerRef.current.scene.requestRender();
          animFrameId = requestAnimationFrame(tick);
        }
      };
      animFrameId = requestAnimationFrame(tick);
    }
    return () => {
      clearTimeout(retryTimer);
      if (animFrameId) cancelAnimationFrame(animFrameId);
    };
  }, [allIpData, activeConnections, activeBannedIps, foreignHighlight, homeCountry, addressFields, serverLat, serverLng, arcDedupKm, ptClusterM, minArcDistM]);

  return (
    <div className="absolute inset-0 w-full h-full">
      <div ref={containerRef} className="absolute inset-0 w-full h-full" />
      {popup && (
        <PointPopupOverlay
          popup={popup}
          addressFields={addressFields}
          activeIps={activeConnections}
          bannedIps={activeBannedIps}
          homeCountry={homeCountry}
          foreignHighlight={foreignHighlight}
          onClose={() => setPopup(null)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  PointPopupOverlay — 点击坐标点后弹出的 IP 列表浮层
// ═══════════════════════════════════════════════════════

function PointPopupOverlay({
  popup,
  addressFields,
  activeIps,
  bannedIps,
  homeCountry,
  foreignHighlight,
  onClose,
}: {
  popup: PointPopup;
  addressFields: Set<number>;
  activeIps: Map<string, unknown>;
  bannedIps: Set<string>;
  homeCountry: string;
  foreignHighlight: boolean;
  onClose: () => void;
}) {
  // 计算弹窗位置: 尽量在点击位置右侧偏下, 不超出屏幕
  const pad = 12;
  const maxW = 360;
  const left = Math.min(popup.screenX + pad, window.innerWidth - maxW - pad);
  const top = Math.min(popup.screenY + pad, window.innerHeight - 300);

  return (
    <div
      className="fixed inset-0 z-[9999]"
      onClick={onClose}
      style={{ pointerEvents: 'auto' }}
    >
      <div
        className="absolute bg-gray-900/95 backdrop-blur border border-gray-700 rounded-lg shadow-xl text-xs text-gray-200 overflow-hidden"
        style={{ left, top, maxWidth: maxW, minWidth: 200 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-3 py-2 bg-gray-800/80 border-b border-gray-700">
          <span className="font-bold text-sm text-white truncate">{popup.desc || '未知位置'}</span>
          <span className="ml-2 shrink-0 text-gray-400">{popup.locs.length} 个 IP</span>
        </div>

        {/* IP 列表 */}
        <div className="max-h-[260px] overflow-y-auto divide-y divide-gray-800">
          {popup.locs.map((loc) => {
            const isBanned = bannedIps.has(loc.ip);
            const isActive = activeIps.has(loc.ip);
            const isForeign = foreignHighlight && !!loc.country && loc.country !== homeCountry;
            const desc = getDesc(loc, addressFields);

            let statusLabel: string;
            let statusColor: string;
            if (isBanned) { statusLabel = '封禁'; statusColor = 'text-red-400'; }
            else if (isActive) { statusLabel = '活跃'; statusColor = 'text-green-400'; }
            else { statusLabel = '历史'; statusColor = 'text-gray-500'; }

            return (
              <div key={loc.ip + '_' + loc.module} className="px-3 py-1.5 hover:bg-gray-800/60">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-white">{loc.ip}</span>
                  <span className={`shrink-0 text-[10px] font-bold ${statusColor}`}>{statusLabel}</span>
                  {isForeign && <span className="shrink-0 text-[10px] text-orange-400 font-bold">境外</span>}
                </div>
                {loc.module && (
                  <div className="text-gray-400 truncate">模块: {loc.module}</div>
                )}
                {desc && desc !== popup.desc && (
                  <div className="text-gray-500 truncate">{desc}</div>
                )}
                {loc.count > 1 && (
                  <div className="text-gray-500">访问 {loc.count} 次</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── 辅助: 3D 高度圆弧 (分级弧高 + 最小 120km) ──
function computeArc(
  lon1: number, lat1: number,
  lon2: number, lat2: number,
): Cesium.Cartesian3[] {
  const startCart = Cesium.Cartographic.fromDegrees(lon1, lat1);
  const endCart = Cesium.Cartographic.fromDegrees(lon2, lat2);
  const geodesic = new Cesium.EllipsoidGeodesic(startCart, endCart);
  const dist = geodesic.surfaceDistance;

  // 分级弧高系数 (近距离压低, 远距离适中)
  const MIN_HEIGHT = 30_000; // 30km, 同城仍有可见弧度
  const rawHeight = dist < 500_000 ? dist * 0.15
    : dist < 2_000_000 ? dist * 0.12
    : dist * 0.1;
  const maxHeight = Math.max(rawHeight, MIN_HEIGHT);

  // 分级采样段数
  const segments = dist < 200_000 ? 12
    : dist < 500_000 ? 20
    : dist < 2_000_000 ? 35
    : 50;

  const positions: Cesium.Cartesian3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const cart = geodesic.interpolateUsingFraction(t);
    const h = Math.sin(t * Math.PI) * maxHeight;
    positions.push(Cesium.Cartesian3.fromRadians(cart.longitude, cart.latitude, h));
  }
  return positions;
}
