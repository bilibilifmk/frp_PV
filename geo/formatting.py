"""文本格式化与国名/ISP 翻译."""

from __future__ import annotations

from geo.config import (
    ADMIN_SUFFIXES, CC_MAP, CITY_EN_TO_CN, COUNTRY_NAMES,
    ISP_CN_FULL_TO_SHORT, ISP_EN_TO_CN, PROVINCE_EN_TO_CN,
)


def translate_admin(raw: str) -> str:
    """英文省/市/区名 → 中文简称, 未知则原样返回.

    也处理 OSM 双语格式: '古洞 Kwu Tung' → '古洞',
    '金翠路 Kam Chui Road' → '金翠路'.
    """
    if not raw:
        return raw
    # 若含中文, 提取前缀纯中文词组 (处理 '古洞 Kwu Tung' 类双语地名)
    if any('\u4e00' <= c <= '\u9fff' for c in raw):
        # 截取到第一个非中文/非标点的空格前
        import re as _re
        m = _re.match(r'^([\u4e00-\u9fff\u3000-\u303f\uff00-\uffef·\-]+)', raw)
        if m:
            chinese_part = m.group(1).strip('·- ')
            if chinese_part:
                return chinese_part
        return raw
    key = raw.lower().strip()
    result = (PROVINCE_EN_TO_CN.get(key)
              or CITY_EN_TO_CN.get(key)
              or COUNTRY_NAMES.get(raw))   # 处理 'Hong Kong' / 'Taiwan' 等
    return result if result else raw


def translate_country(raw: str) -> str:
    """国家代码或全名 → 简体中文."""
    if not raw:
        return ""
    if len(raw) <= 3 and raw.isupper():
        return CC_MAP.get(raw, raw)
    return COUNTRY_NAMES.get(raw, raw)


def translate_isp(raw: str) -> str:
    """英文/中文全称 ISP → 中文简称."""
    if not raw:
        return ""
    low = raw.lower()
    for key, cn in ISP_EN_TO_CN.items():
        if key in low:
            return cn
    for full, short in ISP_CN_FULL_TO_SHORT.items():
        if full in raw:
            return short
    return raw.split(" ")[0] if len(raw) > 30 else raw


def norm_admin(s: str) -> str:
    """去行政区划后缀: '北京市' → '北京'."""
    for suffix in ADMIN_SUFFIXES:
        if s.endswith(suffix) and len(s) > len(suffix):
            return s[: -len(suffix)]
    return s


def strip_country_prefix(country: str, value: str) -> str:
    """去地区字段中的国名前缀: '中国北京市' → '北京市', '香港,香港' → '香港'."""
    if country and value.startswith(country):
        value = value[len(country):]
    # 清理前导逗号 (ipwho 对 HK 返回 "香港,香港" → 去前缀后 ",香港")
    return value.lstrip(", \t，").strip()


def split_city_district(raw: str) -> tuple[str, str]:
    """拆括号里的区级信息: 'Singapore (Downtown Core)' → ('Singapore', 'Downtown Core')."""
    if "(" in raw and raw.endswith(")"):
        city, district = raw.rsplit("(", 1)
        return city.strip(), district.rstrip(")").strip()
    return raw, ""


def build_desc(
    country: str, region: str, city: str,
    district: str = "", locality: str = "", street: str = "",
    isp: str = "",
) -> str:
    """组装地址: '国家 - 省 · 市 · 区 · 小区 街道 运营商'."""
    parts: list[str] = []
    seen: set[str] = set()
    for raw in [country, region, city, district, locality]:
        p = (raw or "").strip().lstrip(",，")
        if not p:
            continue
        key = norm_admin(p)
        if key not in seen:
            parts.append(p)
            seen.add(key)

    if len(parts) <= 1:
        desc = parts[0] if parts else ""
    else:
        desc = f"{parts[0]} - {' · '.join(parts[1:])}"

    if street:
        desc += f" {street.strip()}"
    if isp:
        desc += f" {isp}"
    return desc
