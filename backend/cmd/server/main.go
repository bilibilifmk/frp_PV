// FRP_PV — frp Server Plugin 态势感知与主动防御系统 (Go 重构版)
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"

	"frp-pv/internal/config"
	"frp-pv/internal/geo"
	"frp-pv/internal/geo/luaprovider"
	"frp-pv/internal/geo/providers"
	"frp-pv/internal/handlers"
	"frp-pv/internal/middleware"
	"frp-pv/internal/services"
	"frp-pv/internal/ws"
)

func main() {
	dbPath := flag.String("db", "data/frp-pv.db", "SQLite 数据库路径")
	listenHost := flag.String("host", "0.0.0.0", "HTTP 监听 IP")
	listenPort := flag.Int("port", 5008, "HTTP 监听端口")
	staticDir := flag.String("static", "static", "前端静态文件目录")
	flag.Parse()
	if *listenPort < 1 || *listenPort > 65535 {
		log.Fatalf("无效端口: %d", *listenPort)
	}
	if err := os.MkdirAll(filepath.Dir(*dbPath), 0755); err != nil {
		log.Fatalf("创建数据库目录失败: %v", err)
	}

	// ── 配置 ──
	cfg, err := config.New(*dbPath)
	if err != nil {
		log.Fatalf("加载配置失败: %v", err)
	}
	defer cfg.Close()
	data := cfg.Get()

	// ── GEO 服务 ──
	configDir, _ := filepath.Abs(filepath.Dir(*dbPath))
	// 数据库通常位于 data/，资源目录则位于其上一级。
	if filepath.Base(configDir) == "data" {
		configDir = filepath.Dir(configDir)
	}

	// 1. 确保有 MMDB 文件 (没有则自动下载)
	dataDir := filepath.Join(configDir, "data")
	if downloaded, err := providers.EnsureMMDB(dataDir); err != nil {
		log.Printf("[GEO] ⚠️ MMDB 自动下载失败: %v", err)
	} else if downloaded {
		log.Println("[GEO] MMDB 自动下载成功")
	}

	// 2. 内置 provider (扫描 data/*.mmdb)
	geoEntries := providers.BuiltinProviders(dataDir)

	// 3. Lua 脚本 provider (scripts/providers/ 目录)
	scriptDir := filepath.Join(configDir, "scripts", "providers")
	luaprovider.SetLibDir(filepath.Join(configDir, "scripts", "lib"))
	provScanner, err := luaprovider.NewProviderScanner(scriptDir)
	if err != nil {
		log.Printf("[LUA] 初始化失败: %v", err)
	} else {
		geoEntries = append(geoEntries, provScanner.Entries()...)
	}

	geoSvc := geo.NewService(geoEntries, geo.CacheConfig{
		NormalTTL:    time.Duration(data.GeoCache.NormalTTLDays) * 24 * time.Hour,
		ActiveWindow: time.Duration(data.GeoCache.ActiveWindowHrs) * time.Hour,
		ActiveTTL:    time.Duration(data.GeoCache.ActiveTTLDays) * 24 * time.Hour,
		PersistEvery: data.GeoCache.PersistEvery,
		PersistPath:  filepath.Join(dataDir, "geo_cache.json"),
	})

	// 4. Lua 脚本 geocoder (scripts/geocoders/ 目录)
	geocoderDir := filepath.Join(configDir, "scripts", "geocoders")
	geoScanner, err := luaprovider.NewGeocoderScanner(geocoderDir)
	if err != nil {
		log.Printf("[GEOCODER] 初始化失败: %v", err)
	} else {
		geoSvc.SetGeocoders(geoScanner.ForwardEntries(), geoScanner.ReverseEntries())
	}

	// reloadAllProviders 合并内置 + Lua provider + geocoder, 用于热重载
	builtinEntries := providers.BuiltinProviders(dataDir)
	reloadAllProviders := func() int {
		entries := append([]geo.ProviderEntry{}, builtinEntries...)
		if provScanner != nil {
			provScanner.Reload()
			entries = append(entries, provScanner.Entries()...)
		}
		if geoScanner != nil {
			geoScanner.Reload()
			geoSvc.SetGeocoders(geoScanner.ForwardEntries(), geoScanner.ReverseEntries())
		}
		return geoSvc.ReloadProviders(entries)
	}

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

	bans, err := services.NewBanManager(cfg)
	if err != nil {
		log.Fatalf("加载封禁记录失败: %v", err)
	}
	defer bans.Close()
	elog := services.NewEventLog(hub)
	tracker := services.NewConnectionTracker(geoSvc, hub, elog)

	// ── Gin ──
	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()

	// CORS (开发环境下前端在不同端口)
	r.Use(cors.New(cors.Config{
		AllowOrigins: []string{"*"},
		AllowMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders: []string{"Content-Type"},
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

	// 调试: 直接触发 geo 查询
	r.GET("/debug/geo/:ip", func(c *gin.Context) {
		ip := c.Param("ip")
		info := geoSvc.Lookup(ip)
		if info == nil {
			c.JSON(404, gin.H{"error": "lookup failed"})
			return
		}
		c.JSON(200, gin.H{
			"country":  info.Country,
			"region":   info.Region,
			"city":     info.City,
			"district": info.District,
			"isp":      info.ISP,
			"lat":      info.Lat,
			"lon":      info.Lon,
			"desc":     info.Desc(),
		})
	})

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
		api.POST("/settings/detect-location", apiH.DetectServerLocation)
		api.GET("/firewall", apiH.GetFirewall)
		api.POST("/firewall/add", apiH.AddFirewall)
		api.POST("/firewall/remove", apiH.RemoveFirewall)

		// 收集 provider / geocoder 名称 (复用逻辑)
		collectNames := func() (luaNames, geocoderNames []string) {
			if provScanner != nil {
				luaNames = provScanner.Names()
			}
			if geoScanner != nil {
				geocoderNames = geoScanner.Names()
			}
			return
		}

		// Lua provider 管理
		api.GET("/providers", func(c *gin.Context) {
			luaNames, geocoderNames := collectNames()
			c.JSON(200, gin.H{
				"builtin":       len(builtinEntries),
				"lua":           len(luaNames),
				"total":         len(geoSvc.ProviderNames()),
				"lua_dir":       scriptDir,
				"providers":     geoSvc.ProviderNames(),
				"lua_providers": luaNames,
				"geocoders":     geocoderNames,
				"geocoder_dir":  geocoderDir,
			})
		})
		api.POST("/providers/reload", func(c *gin.Context) {
			total := reloadAllProviders()
			luaNames, geocoderNames := collectNames()
			c.JSON(200, gin.H{
				"message":       fmt.Sprintf("重载完成, 共 %d 个 provider", total),
				"total":         total,
				"builtin":       len(builtinEntries),
				"lua":           len(luaNames),
				"providers":     geoSvc.ProviderNames(),
				"lua_providers": luaNames,
				"geocoders":     geocoderNames,
			})
		})

		// ── Lua 脚本 CRUD ──

		// 合法的脚本子目录
		scriptDirs := map[string]string{
			"providers": scriptDir,
			"geocoders": geocoderDir,
			"lib":       filepath.Join(configDir, "scripts", "lib"),
		}

		// 安全校验: 只允许 .lua 文件名 (无路径分隔符)
		validScriptName := func(name string) bool {
			return strings.HasSuffix(name, ".lua") &&
				!strings.ContainsAny(name, "/\\") &&
				name != ".lua"
		}

		// GET /api/scripts?type=providers|geocoders|lib  列出脚本
		api.GET("/scripts", func(c *gin.Context) {
			result := make(map[string][]string, len(scriptDirs))
			filter := c.Query("type") // 可选筛选

			for typ, dir := range scriptDirs {
				if filter != "" && typ != filter {
					continue
				}
				entries, err := os.ReadDir(dir)
				if err != nil {
					result[typ] = []string{}
					continue
				}
				var names []string
				for _, e := range entries {
					if !e.IsDir() && strings.HasSuffix(e.Name(), ".lua") {
						names = append(names, e.Name())
					}
				}
				result[typ] = names
			}
			c.JSON(200, result)
		})

		// GET /api/scripts/:type/:name  读取脚本内容
		api.GET("/scripts/:type/:name", func(c *gin.Context) {
			typ := c.Param("type")
			name := c.Param("name")
			dir, ok := scriptDirs[typ]
			if !ok {
				c.JSON(400, gin.H{"error": "未知脚本类型: " + typ})
				return
			}
			if !validScriptName(name) {
				c.JSON(400, gin.H{"error": "非法文件名"})
				return
			}
			data, err := os.ReadFile(filepath.Join(dir, name))
			if err != nil {
				c.JSON(404, gin.H{"error": "文件不存在"})
				return
			}
			c.JSON(200, gin.H{"name": name, "type": typ, "content": string(data)})
		})

		// PUT /api/scripts/:type/:name  保存/创建脚本
		api.PUT("/scripts/:type/:name", func(c *gin.Context) {
			typ := c.Param("type")
			name := c.Param("name")
			dir, ok := scriptDirs[typ]
			if !ok {
				c.JSON(400, gin.H{"error": "未知脚本类型: " + typ})
				return
			}
			if !validScriptName(name) {
				c.JSON(400, gin.H{"error": "非法文件名"})
				return
			}
			var body struct {
				Content string `json:"content"`
			}
			if err := c.ShouldBindJSON(&body); err != nil {
				c.JSON(400, gin.H{"error": "请求体无效"})
				return
			}
			if err := os.WriteFile(filepath.Join(dir, name), []byte(body.Content), 0644); err != nil {
				c.JSON(500, gin.H{"error": "写入失败: " + err.Error()})
				return
			}
			c.JSON(200, gin.H{"message": "已保存", "name": name})
		})

		// DELETE /api/scripts/:type/:name  删除脚本
		api.DELETE("/scripts/:type/:name", func(c *gin.Context) {
			typ := c.Param("type")
			name := c.Param("name")
			dir, ok := scriptDirs[typ]
			if !ok {
				c.JSON(400, gin.H{"error": "未知脚本类型: " + typ})
				return
			}
			if !validScriptName(name) {
				c.JSON(400, gin.H{"error": "非法文件名"})
				return
			}
			fpath := filepath.Join(dir, name)
			if _, err := os.Stat(fpath); os.IsNotExist(err) {
				c.JSON(404, gin.H{"error": "文件不存在"})
				return
			}
			if err := os.Remove(fpath); err != nil {
				c.JSON(500, gin.H{"error": "删除失败: " + err.Error()})
				return
			}
			c.JSON(200, gin.H{"message": "已删除", "name": name})
		})
	}

	// 前端静态文件 (生产模式)
	distDir, _ := filepath.Abs(*staticDir)
	r.Static("/assets", filepath.Join(distDir, "assets"))
	r.Static("/cesium", filepath.Join(distDir, "cesium"))
	r.StaticFile("/favicon.ico", filepath.Join(distDir, "favicon.ico"))
	// SPA fallback: 所有未匹配路由返回 index.html
	r.NoRoute(func(c *gin.Context) {
		c.File(filepath.Join(distDir, "index.html"))
	})

	// ── 启动 ──
	addr := fmt.Sprintf("%s:%d", *listenHost, *listenPort)
	sep := strings.Repeat("═", 56)
	fmt.Println(sep)
	fmt.Println("  FRP_PV — Server Plugin 模式 (Go)")
	fmt.Println(sep)
	fmt.Println("  在 frps.toml 末尾添加:")
	fmt.Println()
	fmt.Println("  [[httpPlugins]]")
	fmt.Println("  name = \"frp-pv\"")
	fmt.Printf("  addr = \"127.0.0.1:%d\"\n", *listenPort)
	fmt.Println("  path = \"/frp-plugin\"")
	fmt.Println("  ops = [\"NewUserConn\", \"CloseUserConn\"]")
	fmt.Println()
	fmt.Printf("  Web UI: http://127.0.0.1:%d\n", *listenPort)
	fmt.Println(sep)

	srv := &http.Server{Addr: addr, Handler: r}

	// 优雅关闭: 捕获 SIGINT/SIGTERM, 落盘缓存后退出
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("监听失败: %v", err)
		}
	}()

	<-quit
	log.Println("正在关闭服务器...")

	// 缓存落盘
	geoSvc.FlushCache()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("关闭失败: %v", err)
	}
	log.Println("已安全退出")
}
