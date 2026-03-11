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
			"home_country":        data.HomeCountry,
			"frequent_threshold":  data.FrequentThreshold,
			"foreign_highlight":   data.ForeignHighlight,
			"admin_username":      data.AdminUsername,
			"auto_ban":            data.AutoBan,
			"address_fields":      data.AddressFields,
		},
	})
}

// UpdateSettings POST /api/settings
func (h *APIHandler) UpdateSettings(c *gin.Context) {
	var req struct {
		HomeCountry       *string         `json:"home_country"`
		FrequentThreshold *int            `json:"frequent_threshold"`
		ForeignHighlight  *bool           `json:"foreign_highlight"`
		AdminUsername     *string         `json:"admin_username"`
		AutoBan           *config.AutoBan `json:"auto_ban"`
		AddressFields     *[]int          `json:"address_fields"`
		ChangePwd         bool            `json:"change_pwd"`
		OldPassword       string          `json:"old_password"`
		NewPassword       string          `json:"new_password"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"status": "error", "msg": "请求格式错误"})
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
		_ = h.cfg.Update(func(d *config.Data) { d.AdminPasswordHash = newHash })
	}

	// 常规字段
	_ = h.cfg.Update(func(d *config.Data) {
		if req.HomeCountry != nil {
			d.HomeCountry = *req.HomeCountry
		}
		if req.FrequentThreshold != nil {
			d.FrequentThreshold = *req.FrequentThreshold
		}
		if req.ForeignHighlight != nil {
			d.ForeignHighlight = *req.ForeignHighlight
		}
		if req.AdminUsername != nil {
			d.AdminUsername = *req.AdminUsername
		}
		if req.AutoBan != nil {
			d.AutoBan = *req.AutoBan
		}
		if req.AddressFields != nil {
			d.AddressFields = *req.AddressFields
		}
	})

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
	list := h.bans.SortedList()
	items := make([]gin.H, len(list))
	for i, ip := range list {
		desc := ""
		if g := h.geo.Lookup(ip); g != nil {
			desc = g.Desc()
		}
		items[i] = gin.H{"num": i + 1, "ip": ip, "desc": desc}
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

	h.bans.Ban(ip)
	h.elog.PushSys("手动封禁: "+ip, "ban", "", "", "", "")
	c.JSON(200, gin.H{"status": "success", "msg": "已封禁 " + ip + "，后续连接将被 frp 直接拒绝"})
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

	h.bans.Unban(ip)
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
