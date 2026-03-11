"""Nominatim (OpenStreetMap) — 正向 + 逆向地理编码."""

from __future__ import annotations

from geo.config import GEOCODE_TIMEOUT
from geo.providers._http import session
from geo.registry import forward_geocoder, reverse_geocoder


def _clean(s: str) -> str:
    """Nominatim 有时同时返回简繁体, 以 ';' 或 ' / ' 分隔 (如 '美国;美國'), 取第一段."""
    if not s:
        return s
    for sep in (";", " / "):
        if sep in s:
            return s.split(sep, 1)[0].strip()
    return s


@forward_geocoder("nominatim", weight=4)
def _geocode(region: str, city: str, district: str = "") -> tuple[float, float] | None:
    query = " ".join(p for p in [district, city, region] if p)
    if not query:
        return None
    data = session.get(
        "https://nominatim.openstreetmap.org/search",
        params={"q": query, "format": "json", "limit": 1},
        timeout=GEOCODE_TIMEOUT,
    ).json()
    if data:
        return float(data[0]["lat"]), float(data[0]["lon"])
    return None


@reverse_geocoder("nominatim")
def _reverse(lat: float, lon: float) -> dict | None:
    data = session.get(
        "https://nominatim.openstreetmap.org/reverse",
        params={"lat": lat, "lon": lon, "format": "json",
                "zoom": 14, "accept-language": "zh-Hans,zh;q=0.9"},
        timeout=GEOCODE_TIMEOUT,
    ).json()
    if "error" in data:
        return None
    addr = data.get("address", {})
    return {
        "country":  _clean(addr.get("country", "")),
        "region":   _clean(addr.get("state", "")),
        "city":     _clean(addr.get("city") or addr.get("town")
                           or addr.get("municipality") or ""),
        "district": _clean(addr.get("city_district") or addr.get("suburb")
                           or addr.get("county") or addr.get("borough") or ""),
        "locality": _clean(addr.get("neighbourhood") or addr.get("quarter") or ""),
        "street":   _clean(addr.get("road", "")),
    }
