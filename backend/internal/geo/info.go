// Package geo 提供 IP 地理位置查询服务.
package geo

import "strings"

// Info 单个 IP 的地理位置信息.
type Info struct {
	Lat      *float64 `json:"lat"`
	Lon      *float64 `json:"lon"`
	Country  string   `json:"country"`
	Region   string   `json:"region"`
	City     string   `json:"city"`
	District string   `json:"district"`
	Locality string   `json:"locality"`
	Street   string   `json:"street"`
	ISP      string   `json:"isp"`
	IP       string   `json:"ip"`
}

// Desc 组装完整地址描述 (与 Python 端 build_desc 一致).
func (g *Info) Desc() string {
	return BuildDesc(g.Country, g.Region, g.City, g.District, g.Locality, g.Street, g.ISP)
}

// GeoParts 返回各级地址分量, 供前端按配置级别拼接.
func (g *Info) GeoParts() []string {
	return []string{g.Country, g.Region, g.City, g.District, g.Locality, g.Street, g.ISP}
}

// ── 地址格式化 ──────────────────────────────────────────

var adminSuffixes = []string{
	"省", "市", "区", "县", "自治区", "自治州", "自治县",
	"特别行政区", "地区", "盟", "州",
}

func normAdmin(s string) string {
	for _, suffix := range adminSuffixes {
		trimmed := strings.TrimSuffix(s, suffix)
		if trimmed != s && trimmed != "" {
			return trimmed
		}
	}
	return s
}

// BuildDesc 组装地址: '国家 - 省 · 市 · 区 运营商'.
func BuildDesc(country, region, city, district, locality, street, isp string) string {
	parts := make([]string, 0, 5)
	seen := make(map[string]bool)

	for _, raw := range []string{country, region, city, district, locality} {
		p := strings.TrimLeft(strings.TrimSpace(raw), ",，")
		if p == "" {
			continue
		}
		key := normAdmin(p)
		if !seen[key] {
			parts = append(parts, p)
			seen[key] = true
		}
	}

	var desc string
	switch len(parts) {
	case 0:
		desc = ""
	case 1:
		desc = parts[0]
	default:
		desc = parts[0] + " - " + strings.Join(parts[1:], " · ")
	}

	if street = strings.TrimSpace(street); street != "" {
		desc += " " + street
	}
	if isp != "" {
		desc += " " + isp
	}
	return desc
}
