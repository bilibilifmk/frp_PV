import { useEffect, useRef, useMemo } from 'react';
import * as Cesium from 'cesium';
import { useConnectionStore } from '../../stores/connectionStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { getDesc } from '../../utils/formatDesc';

interface Props {
  serverLat: number;
  serverLng: number;
}

export default function CesiumGlobe({ serverLat, serverLng }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);

  const allIpData = useConnectionStore((s) => s.allIpData);
  const activeConnections = useConnectionStore((s) => s.activeConnections);
  const activeBannedIps = useConnectionStore((s) => s.activeBannedIps);
  const config = useSettingsStore((s) => s.config);

  const homeCountry = config?.home_country ?? '中国';
  const foreignHighlight = config?.foreign_highlight !== false;
  const addressFields = useMemo(
    () => new Set(config?.address_fields ?? [0, 1, 2, 3, 4, 5, 6]),
    [config?.address_fields],
  );

  // ── 初始化 Viewer ──
  useEffect(() => {
    if (!containerRef.current) return;

    const viewer = new Cesium.Viewer(containerRef.current, {
      baseLayerPicker: false,
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
    viewer.scene.skyBox.show = false;
    viewer.scene.sun.show = false;
    viewer.scene.moon.show = false;
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
        font: '13px sans-serif',
        fillColor: Cesium.Color.WHITE,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        outlineWidth: 2,
        outlineColor: Cesium.Color.BLACK,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -14),
        scaleByDistance: new Cesium.NearFarScalar(5e5, 1, 2e7, 0.6),
      },
    });

    viewerRef.current = viewer;

    return () => {
      viewer.destroy();
      viewerRef.current = null;
    };
  }, [serverLat, serverLng]);

  // ── 更新弧线 ──
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    // 清理旧弧线
    const toRemove = viewer.entities.values.filter(
      (e) => e.id && (e.id.startsWith('arc_') || e.id.startsWith('pt_')),
    );
    toRemove.forEach((e) => viewer.entities.remove(e));

    const activeIps = new Set<string>();
    activeConnections.forEach((c) => activeIps.add(c.ip));

    allIpData.forEach((loc, idx) => {
      if (loc.lat == null || loc.lon == null) return;

      const isBanned = activeBannedIps.has(loc.ip);
      const isForeign = foreignHighlight && loc.country && loc.country !== homeCountry;
      const isActive = activeIps.has(loc.ip);

      // 弧线颜色
      let color: Cesium.Color;
      if (isBanned) {
        color = Cesium.Color.fromCssColorString('#ff4444').withAlpha(0.9);
      } else if (isForeign && isActive) {
        color = Cesium.Color.ORANGE;
      } else if (isActive) {
        color = Cesium.Color.fromCssColorString('#00e5ff');
      } else if (isForeign) {
        color = Cesium.Color.ORANGE.withAlpha(0.4);
      } else {
        color = Cesium.Color.fromCssColorString('#00d4ff').withAlpha(0.4);
      }

      const sLat = loc.lat;
      const sLon = loc.lon;

      // 大圆弧 (采样曲线)
      const positions = computeArc(sLon, sLat, serverLng, serverLat, 40);
      viewer.entities.add({
        id: `arc_${idx}`,
        polyline: {
          positions,
          width: isBanned ? 3 : isActive ? 2.5 : 1.5,
          material: color,
        },
      });

      // 来源点 + 标签
      const desc = getDesc(loc, addressFields);
      viewer.entities.add({
        id: `pt_${idx}`,
        position: Cesium.Cartesian3.fromDegrees(sLon, sLat),
        point: {
          pixelSize: isBanned ? 7 : isActive ? 6 : 4,
          color,
          outlineColor: Cesium.Color.BLACK.withAlpha(0.6),
          outlineWidth: 1,
        },
        label: {
          text: desc || loc.ip,
          font: '11px sans-serif',
          fillColor: Cesium.Color.WHITE.withAlpha(0.85),
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          outlineWidth: 1,
          outlineColor: Cesium.Color.BLACK.withAlpha(0.4),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -10),
          scaleByDistance: new Cesium.NearFarScalar(1e6, 0.9, 2e7, 0.3),
          translucencyByDistance: new Cesium.NearFarScalar(1e6, 1.0, 5e7, 0.05),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 4e7),
        },
      });
    });

    viewer.scene.requestRender();
  }, [allIpData, activeConnections, activeBannedIps, foreignHighlight, homeCountry, addressFields, serverLat, serverLng]);

  return <div ref={containerRef} className="absolute inset-0 w-full h-full" />;
}

// ── 辅助: 大圆弧线 ──
function computeArc(
  lon1: number, lat1: number,
  lon2: number, lat2: number,
  segments: number,
): Cesium.Cartesian3[] {
  const positions: Cesium.Cartesian3[] = [];
  const startCart = Cesium.Cartographic.fromDegrees(lon1, lat1);
  const endCart = Cesium.Cartographic.fromDegrees(lon2, lat2);

  const geodesic = new Cesium.EllipsoidGeodesic(startCart, endCart);
  const surfaceDist = geodesic.surfaceDistance;
  // 弧线抬高: 距离越远越高, 上限 800km
  const maxHeight = Math.min(surfaceDist * 0.15, 800_000);

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const cart = geodesic.interpolateUsingSurfaceDistance(surfaceDist * t);
    const h = Math.sin(t * Math.PI) * maxHeight;
    positions.push(
      Cesium.Cartesian3.fromRadians(cart.longitude, cart.latitude, h),
    );
  }
  return positions;
}
