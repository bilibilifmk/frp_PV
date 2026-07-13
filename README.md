# FRP 态势感知系统 (FRP Request visualization)

FRP 态势感知系统是一个 Go + React 实现的实时监控仪表盘，专为 [frp](https://github.com/fatedier/frp) Server Plugin 设计。它结合多源地理位置数据，将网络流量来源展示在 3D 地球上，并支持 plugin 拒绝和 Linux `iptables` 两种防御模式。
![](./img/frp1.png)
# frps  
如果需要基于日志版本请使用releases 版本 目前main是frp插件模式 需要一个特定版本的frp 
[xb-bxy/frp](https://github.com/xb-bxy/frp/releases/tag/v0.68.1)

## frp中添加配置 
```toml
  [[httpPlugins]]
  name = "frp-pv"
  addr = "127.0.0.1:5508"
  path = "/frp-plugin"
  ops = ["NewUserConn", "CloseUserConn"]
```
## 主要功能特性

*   **🌐 3D 实时可视化**: 使用 WebGL/Three.js 渲染的动态地球仪表盘，实时呈现客户端连接位置、流量飞流动画，直观展示访客分布。
*   **📍 智能定位与识别**: 自动提取并解析连接来源 IP（基于 ipwho.is），智能区分境内/境外流量，并在界面高亮标记境外访问来源。
*   **🛡️ 精准访问控制**: 提供直观的 "访问控制" 面板，完整记录访客 IP 与连接频率，一键执行 IP 黑名单封禁与解封操作（底层联动 `iptables` 规则）。
*   **🤖 自动化高频封禁**: 内置防扫描与防恶意爆破机制。可配置时间窗口（滑动窗口算法）内的连接频率阈值（例如：60秒内连接超过10次）。一旦触发阈值，系统自动调用 `iptables` 将恶意IP阻拦。
*   **✅ 安全白名单机制**: 配置强大的白名单系统，包含 IP 白名单和 代理模块白名单。被标记的 IP 或相关 FRP 服务（模块）不受自动封禁的约束，防止误杀关键业务或管理通道。
*   **⚙️ 图形化后台配置**: 配置与封禁历史统一保存到 SQLite，可通过“系统设置”面板修改防御策略。

## 环境依赖

*   **操作系统**: plugin 模式不限；iptables 模式需要 Linux 且已安装 `iptables`
*   **权限要求**: 仅 iptables 模式需要 root 或 `CAP_NET_ADMIN`
*   **构建环境**: Go 1.22+、Node.js 及 npm

## 配置与启动

所有设置和 IP 封禁历史保存在 SQLite（默认 `data/frp-pv.db`），不再读取或生成 `config.json`。监听地址和端口只通过启动参数指定：

```bash
./frp-pv -db data/frp-pv.db -host 0.0.0.0 -port 5508 -static static
```

其余设置通过右下角【系统设置】修改，包括服务器位置、地理缓存、未知位置处理、plugin/iptables 模式、递增封禁上限、永久封禁及 IP/服务白名单。

如需在面板中查看 frps/frpc 关键日志，可在【系统设置 → FRP 日志】填写日志文件路径。服务只读取文件尾部有限内容，并筛选连接、代理、断开、警告和错误信息；运行用户必须拥有该文件的读取权限。

递增封禁按历史次数逐次翻倍（例如 1、2、4、8 小时），并限制在配置的最长时长（例如 24 小时）；手动解封和自然过期不会清除历史次数。iptables 模式使用独立 `FRP_PV` 链，frp plugin 请求会先返回允许，再异步统计，由内核规则负责实际拦截。

## 安装与启动

1. **配置环境**
   ```bash
   # 克隆/上传项目代码到 /root/frp_PV 目录
   cd /root/frp_PV
   ```
   
2. **构建并启动系统**
   ```bash
   make
   ./dist/frp-pv -db ./dist/data/frp-pv.db -host 0.0.0.0 -port 5508 -static ./dist/static
   ```

3. **配置 Systemd 服务 (强烈推荐)**
   可自行创建 systemd 服务，将 `ExecStart` 指向上面的 `dist/frp-pv` 启动命令。

   * 重新加载 systemd 守护进程：
     ```bash
     systemctl daemon-reload
     ```
   * 启动并设置开机自启：
     ```bash
     systemctl start frp_pv
     systemctl enable frp_pv
     ```
   * 查看运行状态：
     ```bash
     systemctl status frp_pv
     ```
   * 停止服务：
     ```bash
     systemctl stop frp_pv
     ```

4. **后台常驻运行 (普通替代方法)**
   如果不想使用 systemd，也可以使用 `nohup`、`screen` 进行简单的守护：
   ```bash
   nohup ./dist/frp-pv -db ./dist/data/frp-pv.db -host 0.0.0.0 -port 5508 -static ./dist/static > pv.log 2>&1 &
   ```

5. **访问面板**
   * 打开浏览器访问：`http://服务器IP:5508`
   * 初次使用时密码为空，可直接进入；推荐登录后在“系统设置”中设置密码。

## URL 演示模式

登录后可通过 URL 的 hash 参数直接进入大屏演示，例如：

```text
http://服务器IP:5508/#demo=1&map=carto_dark&ui=0
```

- `demo=1`：自动开启新连接演示模式
- `map=底图名称`：指定底图，也可写为 `imagery=底图名称`
- `ui=0`：隐藏侧边栏、工具栏、状态栏及弹窗，也可写为 `hideui=1`
- 参数可组合使用；修改 URL hash 后会立即生效，无需刷新页面

常用底图名称包括 `dark`、`carto_dark`、`carto_dark_nolabels`、`osm`、`arcgis`、`google_satellite` 和 `earth_at_night`。

## 注意事项

- **iptables 权限**: iptables 模式需要 Linux root 或 `CAP_NET_ADMIN`。程序启动时会从 SQLite 恢复有效封禁，过期后自动从 `FRP_PV` 链移除。
- **Geo API 限制**: 系统默认使用海外节点友好的 `ipwho.is` JSON API 检索定位数据。如果在内网专网部署，由于缺少地理数据会导致归属地查询失效。
