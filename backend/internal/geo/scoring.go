package geo

import (
	"math"
	"strings"
)

// ── 评分模型 ────────────────────────────────────────────
//
// 来源类别 (sourceKind): 不同来源的数据可信度不同.
//   - srcProvider  = IP 查询 provider (一手数据, 基准权重)
//   - srcGeoFwd    = 正向编码 geocoder (文字→坐标, 输出坐标可信度稍低)
//   - srcGeoRev    = 逆向编码 geocoder (坐标→文字, 文字可信度稍低)
//
// 文字字段评分 = base × sourceMultiplier × expMult × (1 + depthBonus + cjkBonus)
//   - depthBonus: 结果填充越完整 → 加分越多 (有区 +0.3, 有市 +0.2, 有省 +0.1)
//   - cjkBonus:   中文地名 +0.2 (母语精度更高)
//
// 坐标评分 = base × coordSourceMultiplier × expMult + districtBonus + crossValidationBonus
//   - provider 给的坐标权重 × 1.0
//   - 正向编码坐标权重 × 0.7 (地址反查坐标精度有限)
//   - 逆向编码产出本身就携带原坐标, 不额外产生新坐标
//   - 有区级信息 → +3
//   - 互相印证 (50km 内) → 每对 +2 (上限 +6)

// sourceKind 标识结果的数据来源类型.
type sourceKind int

const (
	srcProvider sourceKind = iota // IP 查询 provider (一手数据)
	srcGeoFwd                    // 正向编码 geocoder (文字→坐标)
	srcGeoRev                    // 逆向编码 geocoder (坐标→文字)
)

// textMultiplier 文字字段的来源系数.
func textMultiplier(sk sourceKind) float64 {
	switch sk {
	case srcGeoFwd:
		return 0.6 // 正向编码结果文字完全复制自原 provider, 冗余价值低
	case srcGeoRev:
		return 0.8 // 逆向编码结果文字来自坐标, 有独立信息量
	default:
		return 1.0
	}
}

// coordMultiplier 坐标的来源系数.
func coordMultiplier(sk sourceKind) float64 {
	switch sk {
	case srcGeoFwd:
		return 0.7 // 从文字反查的坐标精度有限
	default:
		return 1.0 // provider 原始坐标 / 逆向编码回传原坐标
	}
}

// depthBonus 结果完整度加成.
func depthBonus(info *Info) float64 {
	b := 0.0
	if strings.TrimSpace(info.Region) != "" {
		b += 0.1
	}
	if strings.TrimSpace(info.City) != "" {
		b += 0.2
	}
	if strings.TrimSpace(info.District) != "" {
		b += 0.3
	}
	return b
}

// cjkFieldBonus 中文地名加成.
func cjkFieldBonus(val string) float64 {
	if isCJK(val) {
		return 0.2
	}
	return 0
}

// isCJK 检查字符串是否以 CJK 字符开头.
func isCJK(s string) bool {
	for _, r := range s {
		return (r >= 0x4E00 && r <= 0x9FFF) || (r >= 0x3400 && r <= 0x4DBF)
	}
	return false
}

// effectiveTextWeight 计算某结果某字段的有效投票权重.
// 公式: base × sourceMultiplier × expMult × (1 + depthBonus + cjkBonus)
func effectiveTextWeight(r providerResult, fieldVal string) int {
	base := float64(r.weight)
	mult := textMultiplier(r.source) * r.expMult
	bonus := 1.0 + depthBonus(r.info) + cjkFieldBonus(fieldVal)
	return int(math.Round(base * mult * bonus))
}

// effectiveCoordScore 计算坐标候选的基础分.
// 区级加分需要 City 也非空, 防止层级空洞的 provider 获得不当加分.
func effectiveCoordScore(r providerResult) int {
	base := float64(r.weight) * coordMultiplier(r.source) * r.expMult
	if strings.TrimSpace(r.info.City) != "" && strings.TrimSpace(r.info.District) != "" {
		base += 3
	}
	return int(math.Round(base))
}
