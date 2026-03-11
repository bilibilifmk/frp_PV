package handlers

import (
	"net/http"

	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"

	"frp-pv/internal/config"
)

// AuthHandler 认证相关路由.
type AuthHandler struct {
	cfg *config.Manager
}

// NewAuthHandler 构造.
func NewAuthHandler(cfg *config.Manager) *AuthHandler {
	return &AuthHandler{cfg: cfg}
}

// Login POST /api/login
func (h *AuthHandler) Login(c *gin.Context) {
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"status": "error", "msg": "请求格式错误"})
		return
	}

	data := h.cfg.Get()
	if req.Username != data.AdminUsername {
		c.JSON(http.StatusOK, gin.H{"status": "error", "msg": "用户名或密码错误"})
		return
	}

	// 密码校验
	if data.AdminPasswordHash == "" {
		// 未设密码: 只有提交空密码才放行
		if req.Password != "" {
			c.JSON(http.StatusOK, gin.H{"status": "error", "msg": "密码错误。当前默认无密码时请直接留空。"})
			return
		}
	} else {
		if err := bcrypt.CompareHashAndPassword([]byte(data.AdminPasswordHash), []byte(req.Password)); err != nil {
			c.JSON(http.StatusOK, gin.H{"status": "error", "msg": "用户名或密码错误"})
			return
		}
	}

	sess := sessions.Default(c)
	sess.Set("logged_in", true)
	_ = sess.Save()

	c.JSON(http.StatusOK, gin.H{"status": "success"})
}

// Logout POST /api/logout
func (h *AuthHandler) Logout(c *gin.Context) {
	sess := sessions.Default(c)
	sess.Clear()
	_ = sess.Save()
	c.JSON(http.StatusOK, gin.H{"status": "success"})
}

// CheckAuth GET /api/auth/check — 前端页面加载时调用.
func (h *AuthHandler) CheckAuth(c *gin.Context) {
	sess := sessions.Default(c)
	if sess.Get("logged_in") != true {
		c.JSON(http.StatusOK, gin.H{"authenticated": false})
		return
	}

	data := h.cfg.Get()
	c.JSON(http.StatusOK, gin.H{
		"authenticated": true,
		"config": gin.H{
			"server_location":     data.ServerLocation,
			"arc_lifetime_seconds": data.ArcLifetimeSeconds,
			"home_country":        data.HomeCountry,
			"frequent_threshold":  data.FrequentThreshold,
			"foreign_highlight":   data.ForeignHighlight,
			"address_fields":      data.AddressFields,
		},
	})
}
