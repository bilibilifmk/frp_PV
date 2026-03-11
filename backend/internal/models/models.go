// Package models 定义所有共享数据结构.
package models

import "sync"

// ── 连接记录 ────────────────────────────────────────────

// ConnectionRecord 按 (ip, module) 聚合的访问记录.
type ConnectionRecord struct {
	IP       string   `json:"ip"`
	Module   string   `json:"module"`
	Lat      *float64 `json:"lat"`
	Lon      *float64 `json:"lon"`
	Country  string   `json:"country"`
	Desc     string   `json:"desc"`
	GeoParts []string `json:"geo_parts"`
	Time     string   `json:"time"`
	Count    int      `json:"count"`
}

// BlockedRecord 拦截记录.
type BlockedRecord struct {
	IP       string   `json:"ip"`
	Proxy    string   `json:"proxy"`
	Reason   string   `json:"reason"`
	Desc     string   `json:"desc"`
	Country  string   `json:"country"`
	GeoParts []string `json:"geo_parts,omitempty"`
	Lat      *float64 `json:"lat,omitempty"`
	Lon      *float64 `json:"lon,omitempty"`
	Time     int64    `json:"time"`
}

// ActiveConnection 活跃连接快照.
type ActiveConnection struct {
	IP         string   `json:"ip"`
	Module     string   `json:"module"`
	RemoteAddr string   `json:"remote_addr"`
	Since      int64    `json:"since"`
	Elapsed    float64  `json:"elapsed"`
	Desc       string   `json:"desc"`
	Country    string   `json:"country"`
	GeoParts   []string `json:"geo_parts,omitempty"`
}

// DisconnectRecord 断开连接记录.
type DisconnectRecord struct {
	IP         string   `json:"ip"`
	Module     string   `json:"module"`
	RemoteAddr string   `json:"remote_addr"`
	Duration   *float64 `json:"duration"`
	Time       string   `json:"time"`
	Desc       string   `json:"desc"`
	Country    string   `json:"country"`
	GeoParts   []string `json:"geo_parts,omitempty"`
	Active     int      `json:"active"`
}

// SysLogEntry 系统日志条目.
type SysLogEntry struct {
	Msg    string `json:"msg"`
	Type   string `json:"type"`
	Desc   string `json:"desc"`
	IP     string `json:"ip"`
	Proxy  string `json:"proxy"`
	Reason string `json:"reason"`
	Time   string `json:"time"`
}

// ── 事件日志 ────────────────────────────────────────────

// EventEntry 统一时间线中的一条事件.
type EventEntry struct {
	Kind string      `json:"kind"` // conn | disconn | sys | blocked
	Data interface{} `json:"data"`
}

// RingLog 固定容量的环形日志缓存.
type RingLog struct {
	mu     sync.Mutex
	buf    []EventEntry
	maxLen int
}

// NewRingLog 创建指定容量的环形日志.
func NewRingLog(maxLen int) *RingLog {
	return &RingLog{maxLen: maxLen}
}

// Append 追加一条事件.
func (r *RingLog) Append(entry EventEntry) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.buf = append(r.buf, entry)
	if len(r.buf) > r.maxLen {
		r.buf = r.buf[len(r.buf)-r.maxLen:]
	}
}

// Snapshot 返回当前所有事件的拷贝.
func (r *RingLog) Snapshot() []EventEntry {
	r.mu.Lock()
	defer r.mu.Unlock()
	cp := make([]EventEntry, len(r.buf))
	copy(cp, r.buf)
	return cp
}
