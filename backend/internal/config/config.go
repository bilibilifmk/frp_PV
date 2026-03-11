// Package config 提供线程安全的 JSON 配置读写.
package config

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"sync"
)

// ── 子结构 ──────────────────────────────────────────────

// AutoBan 自动封禁参数.
type AutoBan struct {
	Enabled          bool     `json:"enabled"`
	ForeignOnly      bool     `json:"foreign_only"`
	ThresholdSeconds int      `json:"threshold_seconds"`
	ThresholdCount   int      `json:"threshold_count"`
	WhitelistModules []string `json:"whitelist_modules"`
	WhitelistIPs     []string `json:"whitelist_ips"`
}

// ServerLocation 服务器物理位置.
type ServerLocation struct {
	Lat  float64 `json:"lat"`
	Lng  float64 `json:"lng"`
	Name string  `json:"name"`
}

// ── 主配置结构 ──────────────────────────────────────────

// Data 是 config.json 的完整映射.
type Data struct {
	ServerLocation     ServerLocation `json:"server_location"`
	WebPort            int            `json:"web_port"`
	WebHost            string         `json:"web_host"`
	AdminUsername      string         `json:"admin_username"`
	AdminPasswordHash  string         `json:"admin_password_hash"`
	FrequentThreshold  int            `json:"frequent_threshold"`
	SecretKey          string         `json:"secret_key"`
	ArcLifetimeSeconds int            `json:"arc_lifetime_seconds"`
	HomeCountry        string         `json:"home_country"`
	ForeignHighlight   bool           `json:"foreign_highlight"`
	AutoBan            AutoBan        `json:"auto_ban"`
	BannedIPs          []string       `json:"banned_ips"`
	AddressFields      []int          `json:"address_fields,omitempty"`
}

// ── Manager ─────────────────────────────────────────────

// Manager 线程安全地管理配置读写.
type Manager struct {
	mu   sync.RWMutex
	path string
	data Data
}

// New 从给定路径加载 (若不存在则用默认值).
func New(path string) (*Manager, error) {
	m := &Manager{path: path}
	if err := m.load(); err != nil {
		return nil, err
	}
	m.applyDefaults()
	return m, nil
}

// Get 返回当前配置的只读快照.
func (m *Manager) Get() Data {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.data
}

// Update 在写锁内修改配置, 修改完毕后自动持久化.
func (m *Manager) Update(fn func(*Data)) error {
	m.mu.Lock()
	fn(&m.data)
	m.mu.Unlock()
	return m.save()
}

// Save 显式持久化 (已在 Update 内部调用, 一般无需手动).
func (m *Manager) Save() error {
	return m.save()
}

// ── 内部实现 ────────────────────────────────────────────

func (m *Manager) load() error {
	raw, err := os.ReadFile(m.path)
	if err != nil {
		if os.IsNotExist(err) {
			m.data = Data{}
			return nil
		}
		return fmt.Errorf("read config: %w", err)
	}
	return json.Unmarshal(raw, &m.data)
}

func (m *Manager) save() error {
	m.mu.RLock()
	defer m.mu.RUnlock()
	b, err := json.MarshalIndent(m.data, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(m.path, b, 0644)
}

func (m *Manager) applyDefaults() {
	d := &m.data
	if d.WebPort == 0 {
		d.WebPort = 5008
	}
	if d.WebHost == "" {
		d.WebHost = "0.0.0.0"
	}
	if d.AdminUsername == "" {
		d.AdminUsername = "root"
	}
	if d.HomeCountry == "" {
		d.HomeCountry = "中国"
	}
	if d.FrequentThreshold == 0 {
		d.FrequentThreshold = 5
	}
	if d.ArcLifetimeSeconds == 0 {
		d.ArcLifetimeSeconds = 3600
	}
	if d.SecretKey == "" {
		d.SecretKey = randomHex(24)
	}
	if d.AddressFields == nil {
		d.AddressFields = []int{0, 1, 2, 3, 4, 5, 6}
	}
	if d.AutoBan.ThresholdSeconds == 0 {
		d.AutoBan.ThresholdSeconds = 60
	}
	if d.AutoBan.ThresholdCount == 0 {
		d.AutoBan.ThresholdCount = 10
	}
}

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
