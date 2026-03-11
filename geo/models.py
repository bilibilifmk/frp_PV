"""GeoInfo 数据模型."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from geo.formatting import build_desc


@dataclass
class GeoInfo:
    """IP 地理位置查询结果."""

    lat: Optional[float] = None
    lon: Optional[float] = None
    country: str = ""
    region: str = ""
    city: str = ""
    district: str = ""
    locality: str = ""   # 小区 / 社区 / 乡镇，比 district 更细
    street: str = ""    # 街道门牌
    isp: str = ""
    ip: str = ""
    updated_at: float = 0.0
    last_active: float = 0.0

    @property
    def desc(self) -> str:
        return build_desc(
            self.country, self.region, self.city, self.district,
            self.locality, self.street, self.isp,
        )

    @property
    def geo_parts(self) -> list[str]:
        """返回各级地址分量, 供前端按配置级别拼接.

        顺序: [country, region, city, district, locality, street, isp]
        """
        return [
            self.country, self.region, self.city,
            self.district, self.locality, self.street, self.isp,
        ]
