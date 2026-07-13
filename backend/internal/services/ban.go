package services

import (
	"fmt"
	"sort"
	"sync"
	"sync/atomic"
	"time"

	"frp-pv/internal/config"
)

type BanManager struct {
	cfg      *config.Manager
	firewall *IPTables
	mu       sync.RWMutex
	bans     map[string]config.BanRecord
	windows  map[string][]time.Time
	blocked  atomic.Int64
	stop     chan struct{}
}

func NewBanManager(cfg *config.Manager) (*BanManager, error) {
	records, err := cfg.LoadBans()
	if err != nil {
		return nil, fmt.Errorf("load bans: %w", err)
	}
	bm := &BanManager{cfg: cfg, firewall: NewIPTables(), bans: make(map[string]config.BanRecord), windows: make(map[string][]time.Time), stop: make(chan struct{})}
	for _, r := range records {
		bm.bans[r.IP] = r
	}
	if err := bm.ReconcileFirewall(); err != nil {
		return nil, fmt.Errorf("初始化防火墙失败: %w", err)
	}
	go bm.expiryLoop()
	return bm, nil
}

func (bm *BanManager) Close() { close(bm.stop) }

func (bm *BanManager) Mode() string { return bm.cfg.Get().FirewallMode }

func (bm *BanManager) IsWhitelisted(ip, proxy string) bool {
	ab := bm.cfg.Get().AutoBan
	for _, value := range ab.WhitelistModules {
		if value == proxy {
			return true
		}
	}
	for _, value := range ab.WhitelistIPs {
		if value == ip {
			return true
		}
	}
	return false
}

func active(r config.BanRecord, now time.Time) bool {
	return r.Permanent || (r.BannedUntil != nil && r.BannedUntil.After(now))
}

func (bm *BanManager) IsBanned(ip string) bool {
	bm.mu.RLock()
	r, ok := bm.bans[ip]
	bm.mu.RUnlock()
	return ok && active(r, time.Now())
}

// Ban 手动封禁 IP，同样沿用递增封禁时长策略。
func (bm *BanManager) Ban(ip string) (config.BanRecord, error) { return bm.applyBan(ip, "manual") }

func (bm *BanManager) applyBan(ip, reason string) (config.BanRecord, error) {
	if bm.IsWhitelisted(ip, "") {
		return config.BanRecord{IP: ip}, fmt.Errorf("IP %s 位于白名单，未执行封禁", ip)
	}
	now := time.Now()
	ab := bm.cfg.Get().AutoBan
	bm.mu.Lock()
	r := bm.bans[ip]
	r.IP = ip
	if r.CreatedAt.IsZero() {
		r.CreatedAt = now
	}
	r.StrikeCount++
	r.Reason, r.UpdatedAt = reason, now
	r.Permanent = ab.PermanentBan
	if r.Permanent {
		r.BannedUntil = nil
	} else {
		minutes := escalatingMinutes(ab.InitialBanMinutes, ab.MaxBanMinutes, r.StrikeCount)
		until := now.Add(time.Duration(minutes) * time.Minute)
		r.BannedUntil = &until
	}
	bm.bans[ip] = r
	if err := bm.cfg.UpsertBan(r); err != nil {
		bm.mu.Unlock()
		return r, err
	}
	bm.mu.Unlock()
	if bm.Mode() == "iptables" {
		if err := bm.firewall.Block(ip); err != nil {
			return r, fmt.Errorf("封禁已入库，但 iptables 同步失败: %w", err)
		}
	}
	return r, nil
}

func escalatingMinutes(initial, maximum, strikes int) int {
	minutes := initial
	for i := 1; i < strikes && minutes < maximum; i++ {
		if minutes > maximum/2 {
			return maximum
		}
		minutes *= 2
	}
	if minutes > maximum {
		return maximum
	}
	return minutes
}

func (bm *BanManager) Unban(ip string) error {
	bm.mu.Lock()
	r, ok := bm.bans[ip]
	if ok {
		r.Permanent = false
		past := time.Unix(0, 0)
		r.BannedUntil = &past
		r.Reason = ""
		r.UpdatedAt = time.Now()
		bm.bans[ip] = r
	}
	bm.mu.Unlock()
	if err := bm.cfg.ClearBan(ip); err != nil {
		return err
	}
	if err := bm.firewall.Unblock(ip); err != nil && bm.Mode() == "iptables" {
		return err
	}
	return nil
}

func (bm *BanManager) IncrementBlocked()                { bm.blocked.Add(1) }
func (bm *BanManager) BlockedCount() int64              { return bm.blocked.Load() }
func (bm *BanManager) GetAutoBanConfig() config.AutoBan { return bm.cfg.Get().AutoBan }

func (bm *BanManager) Records() []config.BanRecord {
	bm.mu.RLock()
	defer bm.mu.RUnlock()
	now := time.Now()
	list := make([]config.BanRecord, 0, len(bm.bans))
	for _, r := range bm.bans {
		if active(r, now) {
			list = append(list, r)
		}
	}
	sort.Slice(list, func(i, j int) bool { return list[i].IP < list[j].IP })
	return list
}

func (bm *BanManager) SortedList() []string {
	records := bm.Records()
	list := make([]string, len(records))
	for i := range records {
		list[i] = records[i].IP
	}
	return list
}

// CheckAutoBan 做滑动窗口检测。locationKnown 表示至少获得了某项地理信息。
func (bm *BanManager) CheckAutoBan(ip, proxy, country string, locationKnown bool) bool {
	data := bm.cfg.Get()
	ab := data.AutoBan
	if !ab.Enabled || bm.IsWhitelisted(ip, proxy) {
		return false
	}
	if ab.ForeignOnly {
		switch {
		case country == data.HomeCountry:
			return false
		case country == "" && !locationKnown && !ab.BanUnknownLocation:
			return false
		case country == "" && locationKnown && !ab.BanUnknownCountry:
			return false
		}
	}

	now := time.Now()
	cutoff := now.Add(-time.Duration(ab.ThresholdSeconds) * time.Second)
	bm.mu.Lock()
	w := append(bm.windows[ip], now)
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
	hit := len(w)
	bm.windows[ip] = nil
	bm.mu.Unlock()

	r, err := bm.applyBan(ip, "auto")
	if err != nil {
		fmt.Printf("[BAN] %s: %v\n", ip, err)
	}
	bm.IncrementBlocked()
	duration := "永久"
	if r.BannedUntil != nil {
		duration = time.Until(*r.BannedUntil).Round(time.Minute).String()
	}
	fmt.Printf("⚠️ 自动封禁: %s (%ds 内连接 %s 达 %d 次，第 %d 次，%s)\n", ip, ab.ThresholdSeconds, proxy, hit, r.StrikeCount, duration)
	return true
}

func (bm *BanManager) ReconcileFirewall() error {
	if bm.Mode() != "iptables" {
		return nil
	}
	if err := bm.firewall.Ensure(); err != nil {
		return err
	}
	if err := bm.firewall.Flush(); err != nil {
		return err
	}
	for _, ip := range bm.SortedList() {
		if bm.IsWhitelisted(ip, "") {
			continue
		}
		if err := bm.firewall.Block(ip); err != nil {
			return err
		}
	}
	return nil
}

func (bm *BanManager) DisableFirewall() error { return bm.firewall.Flush() }

func (bm *BanManager) expiryLoop() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			if bm.Mode() != "iptables" {
				continue
			}
			now := time.Now()
			bm.mu.RLock()
			var expired []string
			for ip, r := range bm.bans {
				if !r.Permanent && r.BannedUntil != nil && !r.BannedUntil.After(now) {
					expired = append(expired, ip)
				}
			}
			bm.mu.RUnlock()
			for _, ip := range expired {
				if err := bm.firewall.Unblock(ip); err != nil {
					fmt.Printf("[IPTABLES] 自动解封 %s 失败: %v\n", ip, err)
				}
			}
		case <-bm.stop:
			return
		}
	}
}
