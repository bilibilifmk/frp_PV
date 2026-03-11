package services

import (
	"sync"
	"time"

	"frp-pv/internal/geo"
	"frp-pv/internal/models"
	"frp-pv/internal/ws"
)

type activeInfo struct {
	IP    string
	Proxy string
	Time  time.Time
}

// ConnectionTracker 聚合所有用户连接, 按 (ip, module) 去重累加.
type ConnectionTracker struct {
	geo  *geo.Service
	hub  *ws.Hub
	elog *EventLog

	mu      sync.Mutex
	records []models.ConnectionRecord
	index   map[string]*models.ConnectionRecord // "ip|module" → record
	active  map[string]activeInfo               // remote_addr → info
}

// NewConnectionTracker 构造连接追踪器.
func NewConnectionTracker(geoSvc *geo.Service, hub *ws.Hub, elog *EventLog) *ConnectionTracker {
	return &ConnectionTracker{
		geo:    geoSvc,
		hub:    hub,
		elog:   elog,
		index:  make(map[string]*models.ConnectionRecord),
		active: make(map[string]activeInfo),
	}
}

// AllRecords 返回所有聚合记录的快照.
func (ct *ConnectionTracker) AllRecords() []models.ConnectionRecord {
	ct.mu.Lock()
	defer ct.mu.Unlock()
	cp := make([]models.ConnectionRecord, len(ct.records))
	copy(cp, ct.records)
	return cp
}

// ActiveCount 返回当前活跃连接数.
func (ct *ConnectionTracker) ActiveCount() int {
	ct.mu.Lock()
	defer ct.mu.Unlock()
	return len(ct.active)
}

// Record 地理查询 → 内存聚合 → WebSocket 推送.
func (ct *ConnectionTracker) Record(ip, module, remoteAddr string) {
	g := ct.geo.Lookup(ip)
	key := ip + "|" + module
	now := time.Now().Format("2006-01-02 15:04:05")

	ct.mu.Lock()
	var isNew, isActive bool

	rec, exists := ct.index[key]
	if !exists {
		nr := models.ConnectionRecord{
			IP: ip, Module: module, Time: now, Count: 1,
		}
		if g != nil {
			nr.Lat = g.Lat
			nr.Lon = g.Lon
			nr.Country = g.Country
			nr.Desc = g.Desc()
			nr.GeoParts = g.GeoParts()
		}
		ct.records = append(ct.records, nr)
		ct.index[key] = &ct.records[len(ct.records)-1]
		rec = ct.index[key]
		isNew = true
	} else {
		rec.Count++
		rec.Time = now
		if g != nil && rec.Lat == nil && g.Lat != nil {
			rec.Lat = g.Lat
			rec.Lon = g.Lon
			rec.Desc = g.Desc()
			rec.Country = g.Country
			rec.GeoParts = g.GeoParts()
		}
	}

	_, isActive = ct.active[remoteAddr]
	snap := *rec
	ct.mu.Unlock()

	if isNew {
		ct.hub.Emit("new_ip", snap)
		ct.elog.Push("conn", snap)
	} else {
		ct.hub.Emit("update_ip", snap)
		ct.elog.Push("conn", map[string]interface{}{
			"ip": snap.IP, "module": snap.Module,
			"desc": snap.Desc, "time": snap.Time,
		})
	}

	if isActive {
		desc, country := "", ""
		var geoParts []string
		if g != nil {
			desc = g.Desc()
			country = g.Country
			geoParts = g.GeoParts()
		}
		ct.hub.Emit("connection_opened", map[string]interface{}{
			"ip": ip, "module": module, "active": ct.ActiveCount(),
			"remote_addr": remoteAddr,
			"desc": desc, "country": country, "geo_parts": geoParts,
		})
	}
}

// ActiveList 当前所有活跃连接的快照.
func (ct *ConnectionTracker) ActiveList() []models.ActiveConnection {
	ct.mu.Lock()
	defer ct.mu.Unlock()

	now := time.Now()
	result := make([]models.ActiveConnection, 0, len(ct.active))
	for addr, info := range ct.active {
		ac := models.ActiveConnection{
			IP: info.IP, Module: info.Proxy,
			RemoteAddr: addr,
			Since:      info.Time.Unix(),
			Elapsed:    now.Sub(info.Time).Seconds(),
		}
		if g := ct.geo.GetCached(info.IP); g != nil {
			ac.Desc = g.Desc()
			ac.Country = g.Country
			ac.GeoParts = g.GeoParts()
		}
		result = append(result, ac)
	}
	return result
}

// OpenConnection 标记活跃连接.
func (ct *ConnectionTracker) OpenConnection(ip, proxy, remoteAddr string) {
	ct.mu.Lock()
	ct.active[remoteAddr] = activeInfo{IP: ip, Proxy: proxy, Time: time.Now()}
	ct.mu.Unlock()
}

// CloseConnection 关闭活跃连接.
func (ct *ConnectionTracker) CloseConnection(ip, proxy, remoteAddr string) {
	ct.mu.Lock()
	info, ok := ct.active[remoteAddr]
	delete(ct.active, remoteAddr)
	activeCount := len(ct.active)
	ct.mu.Unlock()

	var duration *float64
	if ok {
		d := time.Since(info.Time).Seconds()
		duration = &d
	}

	rec := models.DisconnectRecord{
		IP: ip, Module: proxy, RemoteAddr: remoteAddr,
		Duration: duration,
		Time:     time.Now().Format("2006-01-02 15:04:05"),
		Active:   activeCount,
	}
	if g := ct.geo.GetCached(ip); g != nil {
		rec.Desc = g.Desc()
		rec.Country = g.Country
		rec.GeoParts = g.GeoParts()
	}

	ct.elog.Push("disconn", rec)
	ct.hub.Emit("connection_closed", rec)
}
