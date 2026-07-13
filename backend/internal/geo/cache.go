package geo

import (
	"encoding/json"
	"log"
	"os"
	"sync"
	"sync/atomic"
	"time"
)

// ── 缓存配置 ───────────────────────────────────────────

// CacheConfig 控制缓存行为.
type CacheConfig struct {
	NormalTTL     time.Duration // 普通 IP 缓存时长 (默认 7 天)
	ActiveWindow  time.Duration // 活跃判断窗口: X 小时内被查过 ≥2 次 (默认 6h)
	ActiveTTL     time.Duration // 活跃 IP 缓存时长 (默认 1 天, 更快刷新)
	PersistEvery  int           // 每 N 条新查询自动落盘 (默认 50)
	PersistPath   string        // 落盘文件路径 (默认 data/geo_cache.json)
}

// DefaultCacheConfig 返回合理的默认值.
func DefaultCacheConfig() CacheConfig {
	return CacheConfig{
		NormalTTL:    7 * 24 * time.Hour,
		ActiveWindow: 6 * time.Hour,
		ActiveTTL:    24 * time.Hour,
		PersistEvery: 50,
		PersistPath:  "data/geo_cache.json",
	}
}

// ── 缓存条目 ───────────────────────────────────────────

type cacheEntry struct {
	Info      *Info     `json:"info"`
	CreatedAt time.Time `json:"created_at"`
	LastHit   time.Time `json:"last_hit"`
	HitCount  int       `json:"hit_count"` // 在 ActiveWindow 内的命中次数
}

// isActive 判断是否为活跃 IP (窗口内被查过 ≥2 次).
func (e *cacheEntry) isActive(window time.Duration) bool {
	return e.HitCount >= 2 && time.Since(e.LastHit) < window
}

// expired 根据活跃状态判断是否过期.
func (e *cacheEntry) expired(cfg CacheConfig) bool {
	ttl := cfg.NormalTTL
	if e.isActive(cfg.ActiveWindow) {
		ttl = cfg.ActiveTTL
	}
	return time.Since(e.CreatedAt) > ttl
}

// ── GeoCache ───────────────────────────────────────────

// GeoCache 带 TTL、活跃检测、自动落盘的 IP 地理信息缓存.
type GeoCache struct {
	mu      sync.RWMutex
	items   map[string]*cacheEntry
	cfg     CacheConfig
	newOps  atomic.Int64 // 自上次落盘以来的新查询计数
}

// NewGeoCache 构造缓存, 并从磁盘加载已有数据.
func NewGeoCache(cfg CacheConfig) *GeoCache {
	c := &GeoCache{
		items: make(map[string]*cacheEntry),
		cfg:   cfg,
	}
	c.loadFromDisk()
	return c
}

// Get 查缓存, 未命中或已过期返回 nil.
func (c *GeoCache) Get(ip string) *Info {
	c.mu.RLock()
	entry, ok := c.items[ip]
	c.mu.RUnlock()

	if !ok {
		return nil
	}
	if entry.expired(c.cfg) {
		c.mu.Lock()
		delete(c.items, ip)
		c.mu.Unlock()
		return nil
	}

	// 更新命中信息 (活跃检测用)
	c.mu.Lock()
	now := time.Now()
	// 如果上次命中超出活跃窗口, 重置计数
	if now.Sub(entry.LastHit) > c.cfg.ActiveWindow {
		entry.HitCount = 1
	} else {
		entry.HitCount++
	}
	entry.LastHit = now
	c.mu.Unlock()

	return entry.Info
}

// Put 写入缓存, 并在达到阈值时自动落盘.
func (c *GeoCache) Put(ip string, info *Info) {
	now := time.Now()
	c.mu.Lock()
	c.items[ip] = &cacheEntry{
		Info:      info,
		CreatedAt: now,
		LastHit:   now,
		HitCount:  1,
	}
	c.mu.Unlock()

	n := c.newOps.Add(1)
	if c.cfg.PersistEvery > 0 && int(n) >= c.cfg.PersistEvery {
		c.newOps.Store(0)
		go c.saveToDisk()
	}
}

// Size 返回当前缓存条目数.
func (c *GeoCache) Size() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return len(c.items)
}

// Flush 立即落盘.
func (c *GeoCache) Flush() {
	c.saveToDisk()
}

// ── 落盘 / 加载 ────────────────────────────────────────

// persistData 落盘的 JSON 结构.
type persistData struct {
	Version int                    `json:"version"`
	Items   map[string]*cacheEntry `json:"items"`
}

func (c *GeoCache) saveToDisk() {
	c.mu.RLock()
	// 只保存未过期的条目
	clean := make(map[string]*cacheEntry, len(c.items))
	for ip, entry := range c.items {
		if !entry.expired(c.cfg) {
			clean[ip] = entry
		}
	}
	c.mu.RUnlock()

	data := persistData{Version: 1, Items: clean}
	b, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		log.Printf("[GeoCache] 序列化失败: %v", err)
		return
	}

	tmp := c.cfg.PersistPath + ".tmp"
	if err := os.WriteFile(tmp, b, 0644); err != nil {
		log.Printf("[GeoCache] 写入失败: %v", err)
		return
	}
	if err := os.Rename(tmp, c.cfg.PersistPath); err != nil {
		log.Printf("[GeoCache] 重命名失败: %v", err)
		os.Remove(tmp)
		return
	}
	log.Printf("[GeoCache] 已落盘 %d 条 → %s", len(clean), c.cfg.PersistPath)
}

func (c *GeoCache) loadFromDisk() {
	raw, err := os.ReadFile(c.cfg.PersistPath)
	if err != nil {
		if !os.IsNotExist(err) {
			log.Printf("[GeoCache] 读取缓存文件失败: %v", err)
		}
		return
	}

	var data persistData
	if err := json.Unmarshal(raw, &data); err != nil {
		log.Printf("[GeoCache] 解析缓存文件失败: %v", err)
		return
	}

	loaded := 0
	for ip, entry := range data.Items {
		if entry.Info != nil && !entry.expired(c.cfg) {
			c.items[ip] = entry
			loaded++
		}
	}
	log.Printf("[GeoCache] 从磁盘加载 %d 条缓存", loaded)
}
