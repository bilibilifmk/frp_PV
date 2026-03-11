// FRP_PV — frp Server Plugin 态势感知与主动防御系统 (Go 重构版)
package main

import (
	"flag"
	"fmt"
	"log"
	"path/filepath"
	"strings"

	"github.com/gin-contrib/cors"
	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"

	"frp-pv/internal/config"
	"frp-pv/internal/geo"
	"frp-pv/internal/geo/providers"
	"frp-pv/internal/handlers"
	"frp-pv/internal/middleware"
	"frp-pv/internal/services"
	"frp-pv/internal/ws"
)

func main() {
	configPath := flag.String("config", "config.json", "配置文件路径")
	staticDir := flag.String("static", "frontend/dist", "前端构建产物目录")
	flag.Parse()

	// ── 配置 ──
	cfg, err := config.New(*configPath)
	if err != nil {
		log.Fatalf("加载配置失败: %v", err)
	}
	data := cfg.Get()

	// ── GEO 服务 ──
	geoSvc := geo.NewService(
		providers.NewIPAPI(),
		providers.NewIPWho(),
	)

	// 服务器定位
	if data.ServerLocation.Lat == 0 && data.ServerLocation.Lng == 0 {
		if info := geoSvc.DetectServerLocation(); info != nil && info.Lat != nil {
			_ = cfg.Update(func(d *config.Data) {
				d.ServerLocation = config.ServerLocation{
					Lat: *info.Lat, Lng: *info.Lon, Name: info.Desc(),
				}
			})
			fmt.Printf("[GEO] 服务器定位: %s (%.4f, %.4f)\n", info.Desc(), *info.Lat, *info.Lon)
		} else {
			fmt.Println("[GEO] ⚠️ 无法探测服务器位置")
		}
	} else {
		fmt.Printf("[GEO] 服务器定位 (配置): %s (%.4f, %.4f)\n",
			data.ServerLocation.Name, data.ServerLocation.Lat, data.ServerLocation.Lng)
	}

	// ── 服务层 ──
	hub := ws.NewHub()
	go hub.Run()

	bans := services.NewBanManager(cfg)
	elog := services.NewEventLog(hub)
	tracker := services.NewConnectionTracker(geoSvc, hub, elog)

	// ── Gin ──
	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()

	// CORS (开发环境下前端在不同端口)
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{"GET", "POST", "OPTIONS"},
		AllowHeaders:     []string{"Content-Type"},
		AllowCredentials: true,
	}))

	// Session
	store := cookie.NewStore([]byte(data.SecretKey))
	store.Options(sessions.Options{
		Path:     "/",
		HttpOnly: true,
		MaxAge:   86400 * 7, // 7 天
	})
	r.Use(sessions.Sessions("session", store))

	// ── Handlers ──
	authH := handlers.NewAuthHandler(cfg)
	pluginH := handlers.NewPluginHandler(geoSvc, bans, elog, tracker, hub)
	apiH := handlers.NewAPIHandler(cfg, geoSvc, bans, elog, tracker, hub)
	wsH := handlers.NewWSHandler(hub, tracker, bans, elog)

	// ── 路由 ──

	// frp plugin 端点 (不需要认证)
	r.POST("/frp-plugin", pluginH.Handle)

	// 认证
	r.POST("/api/login", authH.Login)
	r.POST("/api/logout", authH.Logout)
	r.GET("/api/auth/check", authH.CheckAuth)

	// WebSocket
	r.GET("/ws", wsH.Handle)

	// 需要认证的 API
	api := r.Group("/api", middleware.AuthRequired())
	{
		api.GET("/data", apiH.GetData)
		api.GET("/settings", apiH.GetSettings)
		api.POST("/settings", apiH.UpdateSettings)
		api.GET("/firewall", apiH.GetFirewall)
		api.POST("/firewall/add", apiH.AddFirewall)
		api.POST("/firewall/remove", apiH.RemoveFirewall)
	}

	// 前端静态文件 (生产模式)
	distDir, _ := filepath.Abs(*staticDir)
	r.Static("/assets", filepath.Join(distDir, "assets"))
	r.StaticFile("/favicon.ico", filepath.Join(distDir, "favicon.ico"))
	// SPA fallback: 所有未匹配路由返回 index.html
	r.NoRoute(func(c *gin.Context) {
		c.File(filepath.Join(distDir, "index.html"))
	})

	// ── 启动 ──
	addr := fmt.Sprintf("%s:%d", data.WebHost, data.WebPort)
	sep := strings.Repeat("═", 56)
	fmt.Println(sep)
	fmt.Println("  FRP_PV — Server Plugin 模式 (Go)")
	fmt.Println(sep)
	fmt.Println("  在 frps.toml 末尾添加:")
	fmt.Println()
	fmt.Println("  [[httpPlugins]]")
	fmt.Println("  name = \"frp-pv\"")
	fmt.Printf("  addr = \"127.0.0.1:%d\"\n", data.WebPort)
	fmt.Println("  path = \"/frp-plugin\"")
	fmt.Println("  ops = [\"NewUserConn\", \"CloseUserConn\"]")
	fmt.Println()
	fmt.Printf("  Web UI: http://127.0.0.1:%d\n", data.WebPort)
	fmt.Println(sep)

	log.Fatal(r.Run(addr))
}
