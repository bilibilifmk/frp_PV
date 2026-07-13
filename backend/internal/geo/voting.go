package geo

import (
	"math"
	"strings"
)

// ── 坐标常量 ───────────────────────────────────────────

const (
	coordThreshold    = 0.5 // 坐标互印证阈值 (约 50km)
	coordProxBonus    = 2   // 坐标互印证加分 (每对)
	maxProximityBonus = 6   // 互印证加分上限
)

// ── 加权投票合并 ───────────────────────────────────────

// merge 对多个 providerResult 进行级联投票, 输出统一的 Info + 坐标候选.
//
// 级联策略:
//  1. 国家投票 (全部参与)
//  2. 省投票 (仅国家一致的参与)
//  3. 市投票 (仅省一致的参与)
//  4. 区投票 (省一致即可, 比市级更包容)
//  5. ISP 投票 (国家一致的参与)
//
// 区投票使用省级过滤而非市级, 因为部分 provider 把亚市级地名 (如 Jinrongjie)
// 放在 City 字段, 导致市级过滤时被误淘汰, 连带丢失正确的区信息.
func merge(results []providerResult) (*Info, []coordCandidate) {
	normalizeHierarchy(results)
	merged := &Info{}

	// 1. 国家投票 (全部结果参与)
	merged.Country = voteField(results, func(i *Info) string { return i.Country })

	// 2. 国家过滤: 只有国家一致的源参与后续投票 (防错源污染省市)
	countryFiltered := filterByField(results, merged.Country,
		func(i *Info) string { return i.Country })

	// 3. 省投票
	merged.Region = voteField(countryFiltered, func(i *Info) string { return i.Region })

	// 4. 省过滤: 只有省一致的源参与市投票 (防"北京·张家口"类错误)
	regionFiltered := filterByField(countryFiltered, merged.Region,
		func(i *Info) string { return i.Region })

	// 5. 市投票
	merged.City = voteField(regionFiltered, func(i *Info) string { return i.City })

	// 6. 市过滤: 只有市一致的源参与区投票和坐标收集
	cityFiltered := filterByField(regionFiltered, merged.City,
		func(i *Info) string { return i.City })

	// 7. 区投票 — 从市级一致结果投票
	//    City=Jinrongjie 类「伪城市」被市过滤淘汰, 其 District 不参与投票
	//    mir6 经 normalizeHierarchy 补 City 后可正常通过市过滤
	merged.District = voteField(cityFiltered, func(i *Info) string { return i.District })

	// 8. ISP 投票 (从国家过滤结果投, ISP 与地理层级无关)
	merged.ISP = voteField(countryFiltered, func(i *Info) string { return i.ISP })

	// 9. IP (取第一个非空)
	for _, r := range countryFiltered {
		if r.info.IP != "" {
			merged.IP = r.info.IP
			break
		}
	}
	// 10. Locality / Street (少数 provider 提供, 从市一致的结果取)
	for _, r := range cityFiltered {
		if r.info.Locality != "" && merged.Locality == "" {
			merged.Locality = r.info.Locality
		}
		if r.info.Street != "" && merged.Street == "" {
			merged.Street = r.info.Street
		}
	}

	// 11. 收集坐标候选
	//    优先: 仅使用 District 字段与投票结果严格一致的源 (排除空值)
	//    这样 西城区 类错误坐标 (ipquery/freeipapi/dbip) 和泛城市坐标 (ipinfo 等) 不参与
	//    正向编码 geocoder 继承了父源的 District, 能在此通过筛选贡献精确坐标
	//    回退: 区级无匹配 → 省级全集 → 国家级全集
	var coords []coordCandidate
	if merged.District != "" {
		coords = collectCoordsStrict(regionFiltered, merged.District)
	}
	if len(coords) == 0 {
		coords = collectCoords(regionFiltered)
	}
	if len(coords) == 0 {
		coords = collectCoords(countryFiltered)
	}

	return merged, coords
}

// collectCoords 从结果集中收集坐标候选, 使用 effectiveCoordScore 评分.
func collectCoords(results []providerResult) []coordCandidate {
	var coords []coordCandidate
	for _, r := range results {
		if r.info.Lat != nil && r.info.Lon != nil {
			coords = append(coords, coordCandidate{*r.info.Lat, *r.info.Lon, effectiveCoordScore(r)})
		}
	}
	return coords
}

// collectCoordsStrict 仅收集 District 字段与给定值严格一致的坐标候选.
// 与 filterByField 不同: 此处跳过 District 为空的源, 避免泛城市坐标 (ipinfo 等)
// 和错误区坐标 (西城区 类 provider) 污染结果.
// 正向编码 geocoder 继承父源 District, 因此使用昌平区地址查询后产生的坐标能通过此过滤.
func collectCoordsStrict(results []providerResult, district string) []coordCandidate {
	distKey := normAdmin(strings.TrimSpace(district))
	var coords []coordCandidate
	for _, r := range results {
		d := strings.TrimSpace(r.info.District)
		if d == "" {
			continue // 排除无区信息的源
		}
		if normAdmin(d) != distKey {
			continue // 排除区不一致的源
		}
		if r.info.Lat != nil && r.info.Lon != nil {
			coords = append(coords, coordCandidate{*r.info.Lat, *r.info.Lon, effectiveCoordScore(r)})
		}
	}
	return coords
}

// filterByField 按某个字段值过滤, 保留与投票结果一致或为空的项.
// 若过滤后为空则回退到全部结果, 保证不会丢失数据.
func filterByField(results []providerResult, voted string, extract func(*Info) string) []providerResult {
	if voted == "" {
		return results
	}
	votedKey := normAdmin(voted)
	var filtered []providerResult
	for _, r := range results {
		v := strings.TrimSpace(extract(r.info))
		if v == "" || normAdmin(v) == votedKey {
			filtered = append(filtered, r)
		}
	}
	if len(filtered) == 0 {
		return results
	}
	return filtered
}

// voteField 对某个字符串字段做加权投票, 使用 effectiveTextWeight 评分.
func voteField(results []providerResult, extract func(*Info) string) string {
	scores := make(map[string]int)
	for _, r := range results {
		val := strings.TrimSpace(extract(r.info))
		if val == "" {
			continue
		}
		// 归一化: 去行政后缀后比较
		key := normAdmin(val)
		scores[key] += effectiveTextWeight(r, val)
	}
	if len(scores) == 0 {
		return ""
	}

	// 找最高分
	bestKey := ""
	bestScore := 0
	for k, s := range scores {
		if s > bestScore {
			bestScore = s
			bestKey = k
		}
	}

	// 返回原始值 (保留行政后缀)
	for _, r := range results {
		val := strings.TrimSpace(extract(r.info))
		if val != "" && normAdmin(val) == bestKey {
			return val
		}
	}
	return bestKey
}

// bestCoord 选最佳坐标: 基础分 + 互印证加分 (上限 maxProximityBonus).
func bestCoord(coords []coordCandidate) (*float64, *float64) {
	if len(coords) == 0 {
		return nil, nil
	}
	if len(coords) == 1 {
		return &coords[0].lat, &coords[0].lon
	}

	// 互相印证: 距离 < coordThreshold → 加分 (上限 maxProximityBonus)
	for i := range coords {
		bonus := 0
		for j := range coords {
			if i == j {
				continue
			}
			dist := math.Abs(coords[i].lat-coords[j].lat) + math.Abs(coords[i].lon-coords[j].lon)
			if dist < coordThreshold {
				bonus += coordProxBonus
			}
		}
		if bonus > maxProximityBonus {
			bonus = maxProximityBonus
		}
		coords[i].score += bonus
	}

	// 选最高分
	best := 0
	for i, c := range coords {
		if c.score > coords[best].score {
			best = i
		}
	}
	return &coords[best].lat, &coords[best].lon
}

// normalizeHierarchy 修复层级空洞.
// 当 City 为空但 Region 和 District 均有值时, 说明 provider 跳过了市级
// (常见于直辖市: 北京市/上海市 — Region 直接到 District).
// 将 Region 复制到 City 使其能正确参与市级投票和过滤.
func normalizeHierarchy(results []providerResult) {
	for i := range results {
		info := results[i].info
		if strings.TrimSpace(info.City) == "" &&
			strings.TrimSpace(info.Region) != "" &&
			strings.TrimSpace(info.District) != "" {
			info.City = info.Region
		}
	}
}
