package services

import (
	"time"

	"frp-pv/internal/models"
	"frp-pv/internal/ws"
)

// EventLog 统一事件日志 (conn / disconn / sys / blocked).
type EventLog struct {
	hub *ws.Hub
	log *models.RingLog
}

// NewEventLog 创建事件日志.
func NewEventLog(hub *ws.Hub) *EventLog {
	return &EventLog{hub: hub, log: models.NewRingLog(500)}
}

// Push 追加一条事件.
func (el *EventLog) Push(kind string, data interface{}) {
	el.log.Append(models.EventEntry{Kind: kind, Data: data})
}

// PushSys 追加系统日志并广播.
func (el *EventLog) PushSys(msg, logType, desc, ip, proxy, reason string) {
	entry := models.SysLogEntry{
		Msg: msg, Type: logType, Desc: desc,
		IP: ip, Proxy: proxy, Reason: reason,
		Time: time.Now().Format("2006-01-02 15:04:05"),
	}
	el.Push("sys", entry)
	el.hub.Emit("sys_log", entry)
}

// LogBlocked 记录并返回拦截记录.
func (el *EventLog) LogBlocked(
	ip, proxy, reason, desc, country string,
	lat, lon *float64, geoParts []string,
) models.BlockedRecord {
	rec := models.BlockedRecord{
		IP: ip, Proxy: proxy, Reason: reason,
		Desc: desc, Country: country,
		GeoParts: geoParts,
		Lat: lat, Lon: lon,
		Time: time.Now().Unix(),
	}
	el.Push("blocked", rec)
	return rec
}

// Snapshot 返回全部事件快照.
func (el *EventLog) Snapshot() []models.EventEntry {
	return el.log.Snapshot()
}

// BlockedList 返回所有拦截记录.
func (el *EventLog) BlockedList() []models.BlockedRecord {
	entries := el.log.Snapshot()
	result := make([]models.BlockedRecord, 0)
	for _, e := range entries {
		if e.Kind == "blocked" {
			if rec, ok := e.Data.(models.BlockedRecord); ok {
				result = append(result, rec)
			}
		}
	}
	return result
}
