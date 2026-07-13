package geo

import (
	"log"
	"strings"
	"sync"
	"time"
)

// ── Phase 2: geocoder 双向扩充 ─────────────────────────
//
// enrichAll 用所有 geocoder 对 provider 结果进行双向扩充:
//   - 有坐标 → 所有逆向编码器 → 产出文字地址虚拟结果
//   - 有文字地址 → 所有正向编码器 → 产出坐标虚拟结果
//   - 两者兼有 → 正逆向都走
//
// 扩充结果与原始结果合并后一起参与投票评分.
func (s *Service) enrichAll(results []providerResult) []providerResult {
	s.geoMu.RLock()
	fwds := s.forward
	revs := s.reverse
	brks := s.geoBrk
	s.geoMu.RUnlock()

	if len(fwds) == 0 && len(revs) == 0 {
		return results
	}

	var (
		mu    sync.Mutex
		extra []providerResult
		wg    sync.WaitGroup
	)

	// 去重: 避免对相同输入重复调用同一 geocoder
	type fwdKey struct{ geocoder, query string }
	type revKey struct {
		geocoder string
		latE4    int64
		lonE4    int64
	}
	fwdSeen := make(map[fwdKey]bool)
	revSeen := make(map[revKey]bool)

	for _, r := range results {
		hasCoords := r.info.Lat != nil && r.info.Lon != nil
		hasText := hasGeoText(r.info)

		// ── 有坐标 → 逆向编码: 用所有 reverse geocoder 拿文字地址 ──
		if hasCoords {
			lat, lon := *r.info.Lat, *r.info.Lon
			for _, e := range revs {
				rk := revKey{e.Geocoder.Name(), int64(lat * 10000), int64(lon * 10000)}
				if revSeen[rk] {
					continue
				}
				revSeen[rk] = true

				br := brks[e.Geocoder.Name()+"-rev"]
				if br != nil && !br.Allow() {
					continue
				}
				wg.Add(1)
				go func(entry ReverseEntry, breaker *Breaker, la, lo float64, origIP string) {
					defer wg.Done()
					res, err := entry.Geocoder.Reverse(la, lo)
					if err != nil {
						if breaker != nil {
							breaker.RecordFailure()
						}
						log.Printf("[GEO] %s reverse(%.4f, %.4f) failed: %v",
							entry.Geocoder.Name(), la, lo, err)
						return
					}
					if breaker != nil {
						breaker.RecordSuccess()
					}
					latC, lonC := la, lo
					info := &Info{
						Lat: &latC, Lon: &lonC,
						Country: res.Country, Region: res.Region,
						City: res.City, District: res.District,
						Locality: res.Locality, Street: res.Street,
						IP: origIP,
					}
					mu.Lock()
					extra = append(extra, providerResult{
						info: info, weight: entry.Weight,
						name:   entry.Geocoder.Name() + "-rev",
						source: srcGeoRev, expMult: 1.0,
					})
					mu.Unlock()
					log.Printf("[GEO] %s reverse(%.4f, %.4f) → %s/%s/%s/%s",
						entry.Geocoder.Name(), la, lo,
						res.Region, res.City, res.District, res.Locality)
				}(e, br, lat, lon, r.info.IP)
			}
		}

		// ── 有文字地址 → 正向编码: 用所有 forward geocoder 拿坐标 ──
		if hasText {
			query := buildForwardQuery(r.info)
			if query != "" {
				for _, e := range fwds {
					fk := fwdKey{e.Geocoder.Name(), query}
					if fwdSeen[fk] {
						continue
					}
					fwdSeen[fk] = true

					br := brks[e.Geocoder.Name()+"-fwd"]
					if br != nil && !br.Allow() {
						continue
					}
					wg.Add(1)
					go func(entry ForwardEntry, breaker *Breaker, q string, orig *Info) {
						defer wg.Done()
						lat, lon, err := entry.Geocoder.Forward(q)
						if err != nil {
							if breaker != nil {
								breaker.RecordFailure()
							}
							log.Printf("[GEO] %s forward(%q) failed: %v",
								entry.Geocoder.Name(), q, err)
							return
						}
						if breaker != nil {
							breaker.RecordSuccess()
						}
						info := &Info{
							Lat: &lat, Lon: &lon,
							Country: orig.Country, Region: orig.Region,
							City: orig.City, District: orig.District,
							Locality: orig.Locality, Street: orig.Street,
							ISP: orig.ISP, IP: orig.IP,
						}
						mu.Lock()
						extra = append(extra, providerResult{
							info: info, weight: entry.Weight,
							name:   entry.Geocoder.Name() + "-fwd",
							source: srcGeoFwd, expMult: 1.0,
						})
						mu.Unlock()
						log.Printf("[GEO] %s forward(%q) → (%.4f, %.4f)",
							entry.Geocoder.Name(), q, lat, lon)
					}(e, br, query, r.info)
				}
			}
		}
	}

	// 等待所有 geocoder 完成 (带超时)
	done := make(chan struct{})
	go func() { wg.Wait(); close(done) }()
	select {
	case <-done:
	case <-time.After(queryTimeout):
		log.Printf("[GEO] geocoder 扩充超时, 已收集 %d 个扩充结果", len(extra))
	}

	mu.Lock()
	combined := append(results, extra...)
	mu.Unlock()
	log.Printf("[GEO] 扩充完成: %d 原始 + %d geocoder = %d 总结果",
		len(results), len(extra), len(combined))
	return combined
}

// hasGeoText 检查 Info 是否有文字地址信息.
func hasGeoText(info *Info) bool {
	return strings.TrimSpace(info.City) != "" ||
		strings.TrimSpace(info.Region) != "" ||
		strings.TrimSpace(info.District) != ""
}

// buildForwardQuery 从 Info 拼接正向编码查询字符串.
func buildForwardQuery(info *Info) string {
	parts := make([]string, 0, 4)
	for _, p := range []string{info.District, info.City, info.Region, info.Country} {
		if p = strings.TrimSpace(p); p != "" {
			parts = append(parts, p)
		}
	}
	return strings.Join(parts, " ")
}
