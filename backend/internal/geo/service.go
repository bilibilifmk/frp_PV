package geo

import (
	"log"
	"sync"
	"time"
)

// ── 常量 ───────────────────────────────────────────────

const (
	queryTimeout    = 6 * time.Second // 并发查询总超时
	breakerMaxFail  = 3               // 熔断阈值: 连续失败次数
	breakerCooldown = 3 * time.Hour   // 熔断冷却时间
)

// Provider 是 IP 地理查询提供者的抽象接口.
type Provider interface {
	Name() string
	Lookup(ip string) (*Info, error)
}

// OfflineProvider 标记不需要网络访问的离线 provider (如 MMDB).
// 实现此接口的 Provider 可用于不阻塞请求的快速国家判断.
type OfflineProvider interface {
	Provider
	IsOffline() bool
}

// ProviderEntry 带权重的 provider.
type ProviderEntry struct {
	Provider Provider
	Weight   int
}

// Service 多源 IP 地理查询: 并发请求 → geocoder 双向扩充 → 级联投票合并.
type Service struct {
	mu       sync.RWMutex
	entries  []ProviderEntry
	breakers map[string]*Breaker

	geoMu    sync.RWMutex
	forward  []ForwardEntry
	reverse  []ReverseEntry
	geoBrk   map[string]*Breaker // geocoder 熔断器

	cache   *GeoCache // 带 TTL + 落盘的 IP 缓存
	pending sync.Map  // ip → *pendingCall (并发去重)

	exp *expTracker // 经验分跟踪器
}

type pendingCall struct {
	done chan struct{}
	info *Info
}

// NewService 用给定的 ProviderEntry 列表构造服务.
func NewService(entries []ProviderEntry, cacheCfg ...CacheConfig) *Service {
	cfg := DefaultCacheConfig()
	if len(cacheCfg) > 0 {
		cfg = cacheCfg[0]
	}
	s := &Service{
		geoBrk: make(map[string]*Breaker),
		cache:  NewGeoCache(cfg),
		exp:    newExpTracker(),
	}
	s.setEntries(entries)
	return s
}

// FlushCache 立即将缓存落盘 (用于优雅关闭).
func (s *Service) FlushCache() {
	if s.cache != nil {
		s.cache.Flush()
	}
}

// CacheSize 返回当前缓存条目数.
func (s *Service) CacheSize() int {
	if s.cache != nil {
		return s.cache.Size()
	}
	return 0
}

// ReloadProviders 热替换所有 provider (内置 + Lua).
// 缓存保留, 仅换查询源. 返回新 provider 总数.
func (s *Service) ReloadProviders(entries []ProviderEntry) int {
	s.setEntries(entries)
	return len(entries)
}

// ProviderNames 返回当前所有 provider 名称 (用于 API 展示).
func (s *Service) ProviderNames() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	names := make([]string, len(s.entries))
	for i, e := range s.entries {
		names[i] = e.Provider.Name()
	}
	return names
}

// SetGeocoders 设置正向/逆向编码器列表.
func (s *Service) SetGeocoders(fwd []ForwardEntry, rev []ReverseEntry) {
	brk := make(map[string]*Breaker)
	for _, e := range fwd {
		brk[e.Geocoder.Name()+"-fwd"] = NewBreaker(e.Geocoder.Name()+"-fwd", breakerMaxFail, breakerCooldown)
	}
	for _, e := range rev {
		brk[e.Geocoder.Name()+"-rev"] = NewBreaker(e.Geocoder.Name()+"-rev", breakerMaxFail, breakerCooldown)
	}
	s.geoMu.Lock()
	s.forward = fwd
	s.reverse = rev
	s.geoBrk = brk
	s.geoMu.Unlock()
}

// GeocoderNames 返回当前 geocoder 名称.
func (s *Service) GeocoderNames() []string {
	s.geoMu.RLock()
	defer s.geoMu.RUnlock()
	seen := make(map[string]bool)
	var names []string
	for _, e := range s.forward {
		n := e.Geocoder.Name()
		if !seen[n] {
			names = append(names, n)
			seen[n] = true
		}
	}
	for _, e := range s.reverse {
		n := e.Geocoder.Name()
		if !seen[n] {
			names = append(names, n)
			seen[n] = true
		}
	}
	return names
}

func (s *Service) setEntries(entries []ProviderEntry) {
	breakers := make(map[string]*Breaker, len(entries))
	for _, e := range entries {
		breakers[e.Provider.Name()] = NewBreaker(
			e.Provider.Name(), breakerMaxFail, breakerCooldown,
		)
	}
	s.mu.Lock()
	s.entries = entries
	s.breakers = breakers
	s.mu.Unlock()
}

// Lookup 同步查询 (优先缓存 → 并发去重 → 并发多源 → 加权投票).
func (s *Service) Lookup(ip string) *Info {
	if ip == "" {
		return s.lookupSelf()
	}
	if info := s.cache.Get(ip); info != nil {
		return info
	}

	// 并发去重: 同一 IP 多次请求只查一次
	pc := &pendingCall{done: make(chan struct{})}
	if existing, loaded := s.pending.LoadOrStore(ip, pc); loaded {
		exist := existing.(*pendingCall)
		<-exist.done
		return exist.info
	}
	defer func() {
		s.pending.Delete(ip)
		close(pc.done)
	}()

	info := s.queryAll(ip)
	if info != nil {
		s.cache.Put(ip, info)
	}
	pc.info = info
	return info
}

// LookupAsync 异步查询, 完成后调用 callback.
func (s *Service) LookupAsync(ip string, callback func(string, *Info)) {
	go func() {
		info := s.Lookup(ip)
		if callback != nil {
			callback(ip, info)
		}
	}()
}

// GetCached 仅查缓存.
func (s *Service) GetCached(ip string) *Info {
	return s.cache.Get(ip)
}

// LookupCountryOffline 仅通过离线 provider (MMDB) 查询国家, 不发起网络请求.
// 用于自动封禁的国家判断, 避免在线查询阻塞访问.
func (s *Service) LookupCountryOffline(ip string) string {
	// 先查缓存
	if info := s.cache.Get(ip); info != nil && info.Country != "" {
		return info.Country
	}
	// 仅查离线 provider
	s.mu.RLock()
	entries := s.entries
	s.mu.RUnlock()
	for _, e := range entries {
		if op, ok := e.Provider.(OfflineProvider); ok && op.IsOffline() {
			info, err := e.Provider.Lookup(ip)
			if err == nil && info != nil && info.Country != "" {
				return info.Country
			}
		}
	}
	return ""
}

// DetectServerLocation 查询本机公网 IP 定位.
func (s *Service) DetectServerLocation() *Info {
	return s.lookupSelf()
}

func (s *Service) lookupSelf() *Info {
	s.mu.RLock()
	entries := s.entries
	s.mu.RUnlock()
	for _, e := range entries {
		info, err := e.Provider.Lookup("")
		if err == nil && info != nil {
			return info
		}
	}
	return nil
}

// ── 并发查询 + 加权投票 ────────────────────────────────

type providerResult struct {
	info    *Info
	weight  int
	name    string
	source  sourceKind
	expMult float64 // 经验分乘数 [0.8, 1.2]
}

// coordCandidate 坐标候选项 (含评分).
type coordCandidate struct {
	lat, lon float64
	score    int
}

func (s *Service) queryAll(ip string) *Info {
	var (
		resMu   sync.Mutex
		results []providerResult
		wg      sync.WaitGroup
	)

	s.mu.RLock()
	entries := s.entries
	breakers := s.breakers
	s.mu.RUnlock()

	deadline := time.After(queryTimeout)

	for _, e := range entries {
		br := breakers[e.Provider.Name()]
		if !br.Allow() {
			continue
		}
		wg.Add(1)
		go func(entry ProviderEntry, breaker *Breaker) {
			defer wg.Done()
			info, err := entry.Provider.Lookup(ip)
			if err != nil || info == nil {
				breaker.RecordFailure()
				log.Printf("[GEO] %s lookup %s failed: %v", entry.Provider.Name(), ip, err)
				return
			}
			breaker.RecordSuccess()
			resMu.Lock()
			results = append(results, providerResult{
				info: info, weight: entry.Weight, name: entry.Provider.Name(),
				source: srcProvider, expMult: 1.0,
			})
			resMu.Unlock()
			log.Printf("[GEO] %s → %s | %s/%s/%s/%s | %s",
				entry.Provider.Name(), ip,
				info.Country, info.Region, info.City, info.District, info.ISP)
		}(e, br)
	}

	// 等待所有完成或超时
	done := make(chan struct{})
	go func() { wg.Wait(); close(done) }()
	select {
	case <-done:
	case <-deadline:
		log.Printf("[GEO] %s 查询超时, 使用已收集的 %d 个结果", ip, len(results))
	}

	resMu.Lock()
	defer resMu.Unlock()

	if len(results) == 0 {
		return nil
	}

	// ── Phase 2: 用所有 geocoder 扩充结果集 (正向+逆向) ──
	results = s.enrichAll(results)

	// ── Phase 2.5: 注入经验分乘数 ──
	for i := range results {
		results[i].expMult = s.exp.multiplier(results[i].name)
	}

	// ── Phase 3: 级联投票 (所有原始+扩充结果一起评分) ──
	merged, coords := merge(results)
	log.Printf("[GEO] %s 投票结果: %s/%s/%s/%s %s (coords=%d, sources=%d)",
		ip, merged.Country, merged.Region, merged.City, merged.District, merged.ISP,
		len(coords), len(results))

	// ── Phase 4: 选最佳坐标 ──
	merged.Lat, merged.Lon = bestCoord(coords)
	if merged.Lat != nil && merged.Lon != nil {
		log.Printf("[GEO] %s 坐标选定: (%.4f, %.4f) 从 %d 个候选",
			ip, *merged.Lat, *merged.Lon, len(coords))
	}

	// ── Phase 5: 经验分反馈 (用投票结果评估每个 provider 的准确度) ──
	s.exp.feedback(results, merged)

	return merged
}