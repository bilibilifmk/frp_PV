// Package config 提供基于 SQLite 的线程安全配置与封禁记录持久化.
package config

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

type AutoBan struct {
	Enabled            bool     `json:"enabled"`
	ForeignOnly        bool     `json:"foreign_only"`
	BanUnknownCountry  bool     `json:"ban_unknown_country"`
	BanUnknownLocation bool     `json:"ban_unknown_location"`
	ThresholdSeconds   int      `json:"threshold_seconds"`
	ThresholdCount     int      `json:"threshold_count"`
	InitialBanMinutes  int      `json:"initial_ban_minutes"`
	MaxBanMinutes      int      `json:"max_ban_minutes"`
	PermanentBan       bool     `json:"permanent_ban"`
	WhitelistModules   []string `json:"whitelist_modules"`
	WhitelistIPs       []string `json:"whitelist_ips"`
}

type GeoCache struct {
	NormalTTLDays   int `json:"normal_ttl_days"`
	ActiveWindowHrs int `json:"active_window_hrs"`
	ActiveTTLDays   int `json:"active_ttl_days"`
	PersistEvery    int `json:"persist_every"`
}

type ServerLocation struct {
	Lat  float64 `json:"lat"`
	Lng  float64 `json:"lng"`
	Name string  `json:"name"`
}

type Data struct {
	ServerLocation    ServerLocation `json:"server_location"`
	AdminUsername     string         `json:"admin_username"`
	AdminPasswordHash string         `json:"admin_password_hash"`
	SecretKey         string         `json:"secret_key"`
	HomeCountry       string         `json:"home_country"`
	FirewallMode      string         `json:"firewall_mode"`
	AutoBan           AutoBan        `json:"auto_ban"`
	GeoCache          GeoCache       `json:"geo_cache"`
	CesiumIonToken    string         `json:"cesium_ion_token,omitempty"`
}

// BanRecord 是 bans 表的一行。BannedUntil 为 nil 表示永久封禁。
type BanRecord struct {
	IP          string
	StrikeCount int
	BannedUntil *time.Time
	Permanent   bool
	Reason      string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type Manager struct {
	mu   sync.RWMutex
	db   *sql.DB
	data Data
}

func New(path string) (*Manager, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	db.SetMaxOpenConns(1)
	m := &Manager{db: db}
	if err := m.init(); err != nil {
		db.Close()
		return nil, err
	}
	return m, nil
}

func (m *Manager) init() error {
	if _, err := m.db.Exec(`
		PRAGMA journal_mode=WAL;
		PRAGMA busy_timeout=5000;
		CREATE TABLE IF NOT EXISTS settings (
			id INTEGER PRIMARY KEY CHECK (id = 1),
			data TEXT NOT NULL,
			updated_at INTEGER NOT NULL
		);
		CREATE TABLE IF NOT EXISTS bans (
			ip TEXT PRIMARY KEY,
			strike_count INTEGER NOT NULL DEFAULT 0,
			banned_until INTEGER,
			permanent INTEGER NOT NULL DEFAULT 0,
			reason TEXT NOT NULL DEFAULT '',
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_bans_until ON bans(banned_until);
	`); err != nil {
		return fmt.Errorf("init sqlite: %w", err)
	}

	var raw string
	err := m.db.QueryRow(`SELECT data FROM settings WHERE id = 1`).Scan(&raw)
	switch {
	case err == sql.ErrNoRows:
		m.data = Data{}
		m.applyDefaults()
		return m.save()
	case err != nil:
		return fmt.Errorf("load settings: %w", err)
	case json.Unmarshal([]byte(raw), &m.data) != nil:
		return fmt.Errorf("decode settings: invalid JSON in database")
	}
	m.applyDefaults()
	return m.save()
}

func (m *Manager) Get() Data {
	m.mu.RLock()
	defer m.mu.RUnlock()
	d := m.data
	d.AutoBan.WhitelistModules = append([]string{}, m.data.AutoBan.WhitelistModules...)
	d.AutoBan.WhitelistIPs = append([]string{}, m.data.AutoBan.WhitelistIPs...)
	return d
}

func (m *Manager) Update(fn func(*Data)) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	before := m.data
	tx, err := m.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	fn(&m.data)
	m.applyDefaults()
	b, err := json.Marshal(m.data)
	if err != nil {
		m.data = before
		return err
	}
	if _, err = tx.Exec(`INSERT INTO settings(id,data,updated_at) VALUES(1,?,?)
		ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at`, string(b), time.Now().Unix()); err != nil {
		m.data = before
		return err
	}
	if err := tx.Commit(); err != nil {
		m.data = before
		return err
	}
	return nil
}

func (m *Manager) Save() error { return m.save() }

func (m *Manager) save() error {
	m.mu.RLock()
	defer m.mu.RUnlock()
	b, err := json.Marshal(m.data)
	if err != nil {
		return err
	}
	_, err = m.db.Exec(`INSERT INTO settings(id,data,updated_at) VALUES(1,?,?)
		ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at`, string(b), time.Now().Unix())
	return err
}

func (m *Manager) Close() error { return m.db.Close() }

func (m *Manager) LoadBans() ([]BanRecord, error) {
	rows, err := m.db.Query(`SELECT ip,strike_count,banned_until,permanent,reason,created_at,updated_at FROM bans`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []BanRecord
	for rows.Next() {
		var r BanRecord
		var until sql.NullInt64
		var permanent int
		var created, updated int64
		if err := rows.Scan(&r.IP, &r.StrikeCount, &until, &permanent, &r.Reason, &created, &updated); err != nil {
			return nil, err
		}
		r.Permanent = permanent != 0
		r.CreatedAt, r.UpdatedAt = time.Unix(created, 0), time.Unix(updated, 0)
		if until.Valid {
			t := time.Unix(until.Int64, 0)
			r.BannedUntil = &t
		}
		result = append(result, r)
	}
	return result, rows.Err()
}

func (m *Manager) UpsertBan(r BanRecord) error {
	var until any
	if r.BannedUntil != nil {
		until = r.BannedUntil.Unix()
	}
	_, err := m.db.Exec(`INSERT INTO bans(ip,strike_count,banned_until,permanent,reason,created_at,updated_at)
		VALUES(?,?,?,?,?,?,?) ON CONFLICT(ip) DO UPDATE SET
		strike_count=excluded.strike_count,banned_until=excluded.banned_until,
		permanent=excluded.permanent,reason=excluded.reason,updated_at=excluded.updated_at`,
		r.IP, r.StrikeCount, until, r.Permanent, r.Reason, r.CreatedAt.Unix(), r.UpdatedAt.Unix())
	return err
}

// ClearBan 只清除当前封禁，保留 strike_count 供再次违规时递增时长。
func (m *Manager) ClearBan(ip string) error {
	_, err := m.db.Exec(`UPDATE bans SET banned_until=0, permanent=0, reason='', updated_at=? WHERE ip=?`, time.Now().Unix(), ip)
	return err
}

func (m *Manager) applyDefaults() {
	d := &m.data
	if d.AdminUsername == "" {
		d.AdminUsername = "root"
	}
	if d.HomeCountry == "" {
		d.HomeCountry = "中国"
	}
	if d.SecretKey == "" {
		d.SecretKey = randomHex(24)
	}
	if d.FirewallMode == "" {
		d.FirewallMode = "plugin"
	}
	if d.AutoBan.ThresholdSeconds <= 0 {
		d.AutoBan.ThresholdSeconds = 60
	}
	if d.AutoBan.ThresholdCount <= 0 {
		d.AutoBan.ThresholdCount = 10
	}
	if d.AutoBan.InitialBanMinutes <= 0 {
		d.AutoBan.InitialBanMinutes = 60
	}
	if d.AutoBan.MaxBanMinutes <= 0 {
		d.AutoBan.MaxBanMinutes = 24 * 60
	}
	if d.AutoBan.WhitelistModules == nil {
		d.AutoBan.WhitelistModules = []string{}
	}
	if d.AutoBan.WhitelistIPs == nil {
		d.AutoBan.WhitelistIPs = []string{}
	}
	if d.GeoCache.NormalTTLDays <= 0 {
		d.GeoCache.NormalTTLDays = 7
	}
	if d.GeoCache.ActiveWindowHrs <= 0 {
		d.GeoCache.ActiveWindowHrs = 6
	}
	if d.GeoCache.ActiveTTLDays <= 0 {
		d.GeoCache.ActiveTTLDays = 1
	}
	if d.GeoCache.PersistEvery <= 0 {
		d.GeoCache.PersistEvery = 50
	}
}

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
