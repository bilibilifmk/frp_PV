"""ipquery.io — 免费无需 key, 含风险标记, city 有时内嵌区级信息."""

from __future__ import annotations

from geo.config import CC_MAP, PROVIDER_TIMEOUT
from geo.formatting import split_city_district, translate_isp
from geo.models import GeoInfo
from geo.providers._http import session
from geo.registry import ip_provider


@ip_provider("ipquery", weight=5)
def _lookup(ip: str) -> GeoInfo | None:
    resp = session.get(
        f"https://api.ipquery.io/{ip}",
        timeout=PROVIDER_TIMEOUT,
    ).json()

    loc = resp.get("location", {})
    isp_data = resp.get("isp", {})

    country_code = loc.get("country_code", "")
    country = CC_MAP.get(country_code, loc.get("country", ""))
    state = loc.get("state", "")
    raw_city = loc.get("city", "")

    # ipquery 有时把区级信息写进括号: "Jinrongjie (Xicheng District)"
    city_part, district_part = split_city_district(raw_city)
    # 若 city 被拆出区名, 则用 state 作为市级 (state 通常即直辖市/省会)
    city = state if district_part else city_part

    return GeoInfo(
        ip=ip,
        lat=loc.get("latitude"),
        lon=loc.get("longitude"),
        country=country,
        region=state,
        city=city,
        district=district_part,
        isp=translate_isp(isp_data.get("isp", "") or isp_data.get("org", "")),
    )
