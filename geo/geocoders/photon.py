"""photon (komoot) — 正向 + 逆向地理编码, 基于 OSM."""

from __future__ import annotations

from geo.providers._http import session
from geo.registry import forward_geocoder, reverse_geocoder

# photon.komoot.io 服务器在德国, SSL 握手通常需要 2-3 秒
# 使用比全局 GEOCODE_TIMEOUT 更宽松的本地超时
_TIMEOUT = (3, 5)


@forward_geocoder("photon", weight=4)
def _geocode(region: str, city: str, district: str = "") -> tuple[float, float] | None:
    query = " ".join(p for p in [district, city, region] if p)
    if not query:
        return None
    features = session.get(
        "https://photon.komoot.io/api/",
        params={"q": query, "limit": 1},
        timeout=_TIMEOUT,
    ).json().get("features", [])
    if features:
        lon, lat = features[0]["geometry"]["coordinates"]
        return float(lat), float(lon)
    return None


@reverse_geocoder("photon")
def _reverse(lat: float, lon: float) -> dict | None:
    # lang=zh 不被 Photon 支持 (仅支持 de/en/fr/default)
    # lang=en 可让 city/country 返回英文, district/locality 仍保留本地语言
    features = session.get(
        "https://photon.komoot.io/reverse",
        params={"lat": lat, "lon": lon, "lang": "default"},
        timeout=_TIMEOUT,
    ).json().get("features", [])
    if not features:
        return None
    p = features[0].get("properties", {})
    # district 优先取 district/county, 其次 locality (小区/街道更细粒度)
    district = (p.get("district") or p.get("county") or "")
    return {
        "country": p.get("country", ""),
        "region": p.get("state", ""),
        "city": p.get("city") or p.get("municipality") or "",
        "district": district,
        "locality": p.get("locality", ""),   # 小区/社区
        "street": p.get("street", ""),       # 街道路名
    }
