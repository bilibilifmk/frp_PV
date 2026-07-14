package handlers

import (
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"

	"frp-pv/internal/config"
	"frp-pv/internal/geo"
	"frp-pv/internal/services"
	"frp-pv/internal/ws"
)

// APIHandler 通用数据 / 设置 / 封禁管理接口.
type APIHandler struct {
	cfg     *config.Manager
	geo     *geo.Service
	bans    *services.BanManager
	elog    *services.EventLog
	tracker *services.ConnectionTracker
	hub     *ws.Hub
}

// NewAPIHandler 构造.
func NewAPIHandler(
	cfg *config.Manager, geoSvc *geo.Service,
	bans *services.BanManager, elog *services.EventLog,
	tracker *services.ConnectionTracker, hub *ws.Hub,
) *APIHandler {
	return &APIHandler{cfg: cfg, geo: geoSvc, bans: bans, elog: elog, tracker: tracker, hub: hub}
}

// ── Settings ────────────────────────────────────────────

// GetSettings GET /api/settings
func (h *APIHandler) GetSettings(c *gin.Context) {
	data := h.cfg.Get()
	c.JSON(200, gin.H{
		"status": "success",
		"data": gin.H{
			"home_country":     data.HomeCountry,
			"admin_username":   data.AdminUsername,
			"server_location":  data.ServerLocation,
			"geo_cache":        data.GeoCache,
			"firewall_mode":    data.FirewallMode,
			"auto_ban":         data.AutoBan,
			"cesium_ion_token": data.CesiumIonToken,
		},
	})
}

// DetectServerLocation POST /api/settings/detect-location
// 通过服务端公网出口 IP 自动识别服务器位置并立即保存。
func (h *APIHandler) DetectServerLocation(c *gin.Context) {
	info := h.geo.DetectServerLocation()
	if info == nil || info.Lat == nil || info.Lon == nil {
		c.JSON(200, gin.H{"status": "error", "msg": "自动识别失败，请检查地理位置数据源或手动填写"})
		return
	}
	location := config.ServerLocation{Lat: *info.Lat, Lng: *info.Lon, Name: info.Desc()}
	if location.Name == "" {
		location.Name = "自动识别位置"
	}
	if err := h.cfg.Update(func(d *config.Data) { d.ServerLocation = location }); err != nil {
		c.JSON(500, gin.H{"status": "error", "msg": "位置保存失败: " + err.Error()})
		return
	}
	c.JSON(200, gin.H{
		"status":   "success",
		"msg":      "已识别并保存服务器位置",
		"ip":       info.IP,
		"location": location,
	})
}

// UpdateSettings POST /api/settings
func (h *APIHandler) UpdateSettings(c *gin.Context) {
	oldFirewallMode := h.cfg.Get().FirewallMode
	var req struct {
		HomeCountry    *string                `json:"home_country"`
		AdminUsername  *string                `json:"admin_username"`
		ServerLocation *config.ServerLocation `json:"server_location"`
		GeoCache       *config.GeoCache       `json:"geo_cache"`
		FirewallMode   *string                `json:"firewall_mode"`
		AutoBan        *config.AutoBan        `json:"auto_ban"`
		CesiumIonToken *string                `json:"cesium_ion_token"`
		ChangePwd      bool                   `json:"change_pwd"`
		OldPassword    string                 `json:"old_password"`
		NewPassword    string                 `json:"new_password"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"status": "error", "msg": "请求格式错误"})
		return
	}
	if req.FirewallMode != nil && *req.FirewallMode != "plugin" && *req.FirewallMode != "iptables" {
		c.JSON(400, gin.H{"status": "error", "msg": "防火墙模式只能是 plugin 或 iptables"})
		return
	}
	if req.AutoBan != nil && (req.AutoBan.ThresholdSeconds <= 0 || req.AutoBan.ThresholdCount <= 0 || req.AutoBan.InitialBanMinutes <= 0 || req.AutoBan.MaxBanMinutes < req.AutoBan.InitialBanMinutes) {
		c.JSON(400, gin.H{"status": "error", "msg": "自动封禁时间、次数和封禁时长配置无效"})
		return
	}

	// 密码变更
	if req.ChangePwd {
		data := h.cfg.Get()
		if data.AdminPasswordHash != "" {
			if err := bcrypt.CompareHashAndPassword([]byte(data.AdminPasswordHash), []byte(req.OldPassword)); err != nil {
				c.JSON(200, gin.H{"status": "error", "msg": "原密码错误"})
				return
			}
		} else if req.OldPassword != "" {
			c.JSON(200, gin.H{"status": "error", "msg": "原密码为空，请留空"})
			return
		}
		var newHash string
		if req.NewPassword != "" {
			hash, _ := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
			newHash = string(hash)
		}
		if err := h.cfg.Update(func(d *config.Data) { d.AdminPasswordHash = newHash }); err != nil {
			c.JSON(500, gin.H{"status": "error", "msg": "密码保存失败"})
			return
		}
	}

	// 常规字段
	if err := h.cfg.Update(func(d *config.Data) {
		if req.HomeCountry != nil {
			d.HomeCountry = *req.HomeCountry
		}
		if req.AdminUsername != nil {
			d.AdminUsername = *req.AdminUsername
		}
		if req.ServerLocation != nil {
			d.ServerLocation = *req.ServerLocation
		}
		if req.GeoCache != nil {
			d.GeoCache = *req.GeoCache
		}
		if req.FirewallMode != nil {
			d.FirewallMode = *req.FirewallMode
		}
		if req.AutoBan != nil {
			d.AutoBan = *req.AutoBan
		}
		if req.CesiumIonToken != nil {
			d.CesiumIonToken = *req.CesiumIonToken
		}
	}); err != nil {
		c.JSON(500, gin.H{"status": "error", "msg": "设置保存失败: " + err.Error()})
		return
	}
	if req.FirewallMode != nil || req.AutoBan != nil {
		var firewallErr error
		if req.FirewallMode != nil && oldFirewallMode == "iptables" && *req.FirewallMode == "plugin" {
			firewallErr = h.bans.DisableFirewall()
		} else if h.bans.Mode() == "iptables" {
			firewallErr = h.bans.ReconcileFirewall()
		}
		if firewallErr != nil {
			msg := "iptables 同步失败: " + firewallErr.Error()
			if req.FirewallMode != nil && *req.FirewallMode != oldFirewallMode {
				_ = h.cfg.Update(func(d *config.Data) { d.FirewallMode = oldFirewallMode })
				if oldFirewallMode == "iptables" {
					_ = h.bans.ReconcileFirewall()
				} else {
					_ = h.bans.DisableFirewall()
				}
				msg = "iptables 同步失败，防火墙模式已回退: " + firewallErr.Error()
			}
			c.JSON(200, gin.H{"status": "error", "msg": msg})
			return
		}
	}

	c.JSON(200, gin.H{"status": "success", "msg": "设置保存成功！"})
}

// ── Data ────────────────────────────────────────────────

// GetData GET /api/data
func (h *APIHandler) GetData(c *gin.Context) {
	c.JSON(200, h.tracker.AllRecords())
}

// ── Firewall ────────────────────────────────────────────

// GetFirewall GET /api/firewall
func (h *APIHandler) GetFirewall(c *gin.Context) {
	list := h.bans.Records()
	items := make([]gin.H, len(list))
	for i, ban := range list {
		ip := ban.IP
		desc := ""
		if g := h.geo.Lookup(ip); g != nil {
			desc = g.Desc()
		}
		var until any
		if ban.BannedUntil != nil {
			until = ban.BannedUntil.Unix()
		}
		items[i] = gin.H{"num": i + 1, "ip": ip, "desc": desc, "strike_count": ban.StrikeCount, "banned_until": until, "permanent": ban.Permanent}
	}
	c.JSON(200, gin.H{"status": "success", "data": items})
}

// AddFirewall POST /api/firewall/add
func (h *APIHandler) AddFirewall(c *gin.Context) {
	var req struct {
		IP string `json:"ip"`
	}
	_ = c.ShouldBindJSON(&req)
	ip := strings.TrimSpace(req.IP)

	if ip == "" || !isValidIPv4(ip) {
		c.JSON(200, gin.H{"status": "error", "msg": "无效的 IP 地址"})
		return
	}

	ban, err := h.bans.Ban(ip)
	if err != nil {
		c.JSON(200, gin.H{"status": "error", "msg": err.Error()})
		return
	}
	h.elog.PushSys("手动封禁: "+ip, "ban", "", "", "", "")
	msg := "已永久封禁 " + ip
	if ban.BannedUntil != nil {
		msg = "已封禁 " + ip + " 至 " + ban.BannedUntil.Format("2006-01-02 15:04:05")
	}
	c.JSON(200, gin.H{"status": "success", "msg": msg})
}

// RemoveFirewall POST /api/firewall/remove
func (h *APIHandler) RemoveFirewall(c *gin.Context) {
	var req struct {
		IP string `json:"ip"`
	}
	_ = c.ShouldBindJSON(&req)
	ip := strings.TrimSpace(req.IP)

	if ip == "" {
		c.JSON(200, gin.H{"status": "error", "msg": "IP 为空"})
		return
	}

	if err := h.bans.Unban(ip); err != nil {
		c.JSON(200, gin.H{"status": "error", "msg": "解封失败: " + err.Error()})
		return
	}
	h.elog.PushSys("解除封禁: "+ip, "unban", "", "", "", "")
	h.hub.Emit("unban_ip", gin.H{"ip": ip})
	c.JSON(200, gin.H{"status": "success", "msg": "已解除对 " + ip + " 的封禁"})
}

func isValidIPv4(ip string) bool {
	parts := strings.Split(ip, ".")
	if len(parts) != 4 {
		return false
	}
	for _, p := range parts {
		n, err := strconv.Atoi(p)
		if err != nil || n < 0 || n > 255 {
			return false
		}
	}
	return true
}
