import type { ImageryType } from '../types';

export interface PresentationParams {
  demo: boolean;
  hideUi: boolean;
  imagery?: ImageryType;
}

const IMAGERY_TYPES = new Set<ImageryType>([
  'dark',
  'bing_aerial',
  'bing_aerial_labels',
  'bing_roads',
  'sentinel2',
  'blue_marble',
  'earth_at_night',
  'natural_earth',
  'google_maps',
  'google_satellite',
  'google_roadmap',
  'google_contour',
  'arcgis',
  'arcgis_hillshade',
  'esri_ocean',
  'esri_street',
  'esri_topo',
  'esri_dark_gray',
  'esri_light_gray',
  'esri_natgeo',
  'osm',
  'open_topo',
  'carto_dark',
  'carto_dark_nolabels',
  'carto_light',
  'carto_light_nolabels',
  'carto_voyager',
]);

const TRUE_VALUES = new Set(['1', 'true', 'on', 'yes']);

function enabled(value: string | null) {
  return value !== null && (value === '' || TRUE_VALUES.has(value.toLowerCase()));
}

/** 解析 #demo=1&map=carto_dark&ui=0 形式的展示入口参数。 */
export function parsePresentationParams(hash = window.location.hash): PresentationParams {
  const raw = hash.replace(/^#\??/, '');
  const params = new URLSearchParams(raw);
  const imageryValue = params.get('map') ?? params.get('imagery');
  const imagery = imageryValue && IMAGERY_TYPES.has(imageryValue as ImageryType)
    ? imageryValue as ImageryType
    : undefined;

  return {
    demo: enabled(params.get('demo')),
    hideUi:
      params.get('ui') === '0' ||
      enabled(params.get('hideui')) ||
      enabled(params.get('hide_ui')),
    imagery,
  };
}
