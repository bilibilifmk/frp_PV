package handlers

import (
	"net/http"

	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"

	"frp-pv/internal/services"
	"frp-pv/internal/ws"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// WSHandler WebSocket 连接处理.
type WSHandler struct {
	hub     *ws.Hub
	tracker *services.ConnectionTracker
	bans    *services.BanManager
	elog    *services.EventLog
}

// NewWSHandler 构造.
func NewWSHandler(hub *ws.Hub, tracker *services.ConnectionTracker,
	bans *services.BanManager, elog *services.EventLog) *WSHandler {
	return &WSHandler{hub: hub, tracker: tracker, bans: bans, elog: elog}
}

// Handle GET /ws — 升级 HTTP 到 WebSocket 并推送初始数据.
func (h *WSHandler) Handle(c *gin.Context) {
	// 鉴权
	sess := sessions.Default(c)
	if sess.Get("logged_in") != true {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}

	client := ws.NewClient(h.hub, conn)
	h.hub.Register(client)

	// 推送初始数据
	client.SendJSON("init", h.tracker.AllRecords())
	client.SendJSON("blocked_update", map[string]int64{"blocked": h.bans.BlockedCount()})
	client.SendJSON("blocked_init", h.elog.BlockedList())
	client.SendJSON("active_init", h.tracker.ActiveList())
	client.SendJSON("connection_opened", map[string]int{"active": h.tracker.ActiveCount()})
	client.SendJSON("event_log_init", h.elog.Snapshot())

	go client.WritePump()
	go client.ReadPump()
}
