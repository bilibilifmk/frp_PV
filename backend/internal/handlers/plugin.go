// Package handlers HTTP 请求处理器.
package handlers

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"frp-pv/internal/geo"
	"frp-pv/internal/models"
	"frp-pv/internal/services"
	"frp-pv/internal/ws"
)

// PluginHandler 处理 frp Server Plugin 请求.
type PluginHandler struct {
	geo     *geo.Service
	bans    *services.BanManager
	elog    *services.EventLog
	tracker *services.ConnectionTracker
	hub     *ws.Hub
}

// NewPluginHandler 构造.
func NewPluginHandler(
	geoSvc *geo.Service, bans *services.BanManager,
	elog *services.EventLog, tracker *services.ConnectionTracker,
	hub *ws.Hub,
) *PluginHandler {
	return &PluginHandler{geo: geoSvc, bans: bans, elog: elog, tracker: tracker, hub: hub}
}

type pluginContent struct {
	ProxyName  string `json:"proxy_name"`
	RemoteAddr string `json:"remote_addr"`
}
type pluginRequest struct {
	Content pluginContent `json:"content"`
}

// Handle POST /frp-plugin
func (h *PluginHandler) Handle(c *gin.Context) {
	op := c.Query("op")

	var req pluginRequest
	_ = c.ShouldBindJSON(&req)
	proxy := req.Content.ProxyName
	rawAddr := req.Content.RemoteAddr
	ip := parseRemoteIP(rawAddr)

	allow := gin.H{"reject": false, "unchange": true}

	// CloseUserConn
	if op == "CloseUserConn" {
		if ip != "" {
			h.tracker.CloseConnection(ip, proxy, rawAddr)
		}
		c.JSON(http.StatusOK, allow)
		return
	}

	// 非 NewUserConn → 放行
	if op != "NewUserConn" || ip == "" {
		c.JSON(http.StatusOK, allow)
		return
	}

	// ① 已在黑名单
	if h.bans.IsBanned(ip) {
		h.bans.IncrementBlocked()
		h.rejectIP(c, ip, proxy, "已封禁",
			"拦截: "+ip+" → "+proxy+" (已封禁)", "banned by frp_pv")
		return
	}

	// ② 滑动窗口自动封禁
	cached := h.geo.GetCached(ip)
	country := ""
	if cached != nil {
		country = cached.Country
	}
	if h.bans.CheckAutoBan(ip, proxy, country) {
		h.rejectIP(c, ip, proxy, "自动封禁",
			"自动封禁: "+ip+" (频繁连接 "+proxy+")", "auto-banned by frp_pv")
		return
	}

	// ③ 放行
	h.tracker.OpenConnection(ip, proxy, rawAddr)
	h.geo.LookupAsync(ip, func(_ string, _ *geo.Info) {
		h.tracker.Record(ip, proxy, rawAddr)
	})
	c.JSON(http.StatusOK, allow)
}

func (h *PluginHandler) rejectIP(c *gin.Context, ip, proxy, reason, sysMsg, rejectReason string) {
	cached := h.geo.GetCached(ip)
	var lat, lon *float64
	var desc, country string
	var geoParts []string
	if cached != nil {
		lat, lon = cached.Lat, cached.Lon
		desc = cached.Desc()
		country = cached.Country
		geoParts = cached.GeoParts()
	}

	rec := h.elog.LogBlocked(ip, proxy, reason, desc, country, lat, lon, geoParts)
	h.elog.PushSys(sysMsg, "ban", desc, ip, proxy, reason)
	h.hub.Emit("blocked_update", gin.H{"blocked": h.bans.BlockedCount})
	h.hub.Emit("blocked_event", rec)

	if cached == nil {
		h.backfillGeo(&rec, ip)
	}
	c.JSON(http.StatusOK, gin.H{"reject": true, "reject_reason": rejectReason})
}

func (h *PluginHandler) backfillGeo(rec *models.BlockedRecord, ip string) {
	h.geo.LookupAsync(ip, func(_ string, g *geo.Info) {
		if g != nil {
			rec.Desc = g.Desc()
			rec.Country = g.Country
			rec.Lat = g.Lat
			rec.Lon = g.Lon
			rec.GeoParts = g.GeoParts()
			h.hub.Emit("blocked_geo_update", rec)
		}
	})
}

// parseRemoteIP 从 frps 的 remote_addr 中提取纯 IP.
func parseRemoteIP(addr string) string {
	if addr == "" {
		return ""
	}
	// [::1]:port
	if strings.HasPrefix(addr, "[") {
		return strings.SplitN(addr, "]", 2)[0][1:]
	}
	// 1.2.3.4:port
	if idx := strings.LastIndex(addr, ":"); idx >= 0 {
		return addr[:idx]
	}
	return addr
}
