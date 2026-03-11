// Package ws 提供 WebSocket 广播中心.
package ws

import (
	"encoding/json"
	"log"
	"sync"

	"github.com/gorilla/websocket"
)

// Message 是 WebSocket 传输的标准消息格式.
type Message struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

// ── Client ──────────────────────────────────────────────

// Client 代表一个 WebSocket 连接.
type Client struct {
	hub  *Hub
	conn *websocket.Conn
	send chan []byte
}

// NewClient 创建新客户端.
func NewClient(hub *Hub, conn *websocket.Conn) *Client {
	return &Client{hub: hub, conn: conn, send: make(chan []byte, 256)}
}

// SendJSON 向该客户端发送一条消息.
func (c *Client) SendJSON(msgType string, data interface{}) {
	b, err := json.Marshal(Message{Type: msgType, Data: data})
	if err != nil {
		return
	}
	select {
	case c.send <- b:
	default:
	}
}

// ReadPump 读取客户端消息 (当前仅用于检测断开).
func (c *Client) ReadPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()
	for {
		if _, _, err := c.conn.ReadMessage(); err != nil {
			break
		}
	}
}

// WritePump 将排队消息写入 WebSocket.
func (c *Client) WritePump() {
	defer c.conn.Close()
	for msg := range c.send {
		if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
			break
		}
	}
}

// ── Hub ─────────────────────────────────────────────────

// Hub 管理所有在线的 WebSocket 客户端, 提供广播能力.
type Hub struct {
	mu         sync.RWMutex
	clients    map[*Client]bool
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
}

// NewHub 创建广播中心.
func NewHub() *Hub {
	return &Hub{
		clients:    make(map[*Client]bool),
		broadcast:  make(chan []byte, 256),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
}

// Run 启动事件循环 (应在独立 goroutine 中运行).
func (h *Hub) Run() {
	for {
		select {
		case c := <-h.register:
			h.mu.Lock()
			h.clients[c] = true
			h.mu.Unlock()

		case c := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[c]; ok {
				delete(h.clients, c)
				close(c.send)
			}
			h.mu.Unlock()

		case msg := <-h.broadcast:
			h.mu.RLock()
			for c := range h.clients {
				select {
				case c.send <- msg:
				default:
					close(c.send)
					delete(h.clients, c)
				}
			}
			h.mu.RUnlock()
		}
	}
}

// Register 注册客户端.
func (h *Hub) Register(c *Client) {
	h.register <- c
}

// Emit 向所有在线客户端广播一条消息.
func (h *Hub) Emit(msgType string, data interface{}) {
	b, err := json.Marshal(Message{Type: msgType, Data: data})
	if err != nil {
		log.Printf("[WS] marshal error: %v", err)
		return
	}
	h.broadcast <- b
}
