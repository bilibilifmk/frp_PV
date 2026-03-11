// Package services 业务服务层.
package services

import (
	"fmt"
	"sort"
	"sync"
	"time"

	"frp-pv/internal/config"
)

// BanManager IP 封禁列表 + 滑动窗口自动封禁.
type BanManager struct {
	cfg          *config.Manager
	mu           sync.RWMutex
	banned       map[string]bool
	windows      map[string][]time.Time
	BlockedCount int
}

// NewBanManager 从配置加载封禁列表.
func NewBanManager(cfg *config.Manager) *BanManager {
	data := cfg.Get()
	banned := make(map[string]bool, len(data.BannedIPs))
	for _, ip := range data.BannedIPs {
		banned[ip] = true
	}
	return &BanManager{
		cfg:     cfg,
		banned:  banned,
		windows: make(map[string][]time.Time),
	}
}

// IsBanned 检查 IP 是否在黑名单.
func (bm *BanManager) IsBanned(ip string) bool {
	bm.mu.RLock()
	defer bm.mu.RUnlock()
	return bm.banned[ip]
}

// Ban 手动封禁.
func (bm *BanManager) Ban(ip string) {
	bm.mu.Lock()
	bm.banned[ip] = true
	bm.mu.Unlock()
	bm.persist()
}

// Unban 解除封禁.
func (bm *BanManager) Unban(ip string) {
	bm.mu.Lock()
	delete(bm.banned, ip)
	bm.mu.Unlock()
	bm.persist()
}

// IncrementBlocked 累加拦截计数.
func (bm *BanManager) IncrementBlocked() {
	bm.mu.Lock()
	bm.BlockedCount++
	bm.mu.Unlock()
}

// SortedList 返回排序后的封禁 IP 列表.
func (bm *BanManager) SortedList() []string {
	bm.mu.RLock()
	defer bm.mu.RUnlock()
	list := make([]string, 0, len(bm.banned))
	for ip := range bm.banned {
		list = append(list, ip)
	}
	sort.Strings(list)
	return list
}

// CheckAutoBan 滑动窗口频率检测; 返回 true = 已触发封禁.
func (bm *BanManager) CheckAutoBan(ip, proxy, country string) bool {
	data := bm.cfg.Get()
	ab := data.AutoBan
	if !ab.Enabled {
		return false
	}
	for _, m := range ab.WhitelistModules {
		if m == proxy {
			return false
		}
	}
	for _, w := range ab.WhitelistIPs {
		if w == ip {
			return false
		}
	}
	if ab.ForeignOnly && country == data.HomeCountry {
		return false
	}

	window := time.Duration(ab.ThresholdSeconds) * time.Second
	now := time.Now()
	cutoff := now.Add(-window)

	bm.mu.Lock()
	w := bm.windows[ip]
	w = append(w, now)
	// 滑动窗口: 移除过期条目
	start := 0
	for start < len(w) && w[start].Before(cutoff) {
		start++
	}
	w = w[start:]
	bm.windows[ip] = w

	if len(w) < ab.ThresholdCount {
		bm.mu.Unlock()
		return false
	}

	// 触发封禁
	hit := len(w)
	bm.banned[ip] = true
	bm.windows[ip] = nil
	bm.BlockedCount++
	bm.mu.Unlock()

	bm.persist()
	fmt.Printf("⚠️ 自动封禁: %s (%ds 内连接 %s 达 %d 次)\n",
		ip, ab.ThresholdSeconds, proxy, hit)
	return true
}

func (bm *BanManager) persist() {
	list := bm.SortedList()
	_ = bm.cfg.Update(func(d *config.Data) {
		d.BannedIPs = list
	})
}
