// Package luaprovider 通过嵌入式 Lua 5.1 VM 实现运行时可插拔 IP 地理定位 provider 和 geocoder.
//
// 目录结构:
//
//	scripts/lib/       — 共享 Lua 库 (translate.lua 等, 自动预加载)
//	scripts/providers/ — IP 地理查询脚本 (.lua), 启动时自动扫描
//	scripts/geocoders/ — 正/逆向地理编码脚本 (.lua), 启动时自动扫描
//
// 内置 Lua 模块 (全局可用):
//
//	http      — http.get(url) / http.post(url, body, headers)
//	json      — json.decode(str) / json.encode(table)
//	re        — re.match(pattern, str) / re.find / re.replace
//	translate — translate.country / translate.isp / translate.admin 等 (来自 lib/translate.lua)
//
// Provider 脚本格式:
//
//	name   = "my-api"          -- 必填: provider 名称
//	weight = 3                 -- 可选: 投票权重, 默认 1
//
//	function lookup(ip)        -- 必填: 查询函数
//	    local resp = http.get("https://api.example.com/" .. ip)
//	    local data = json.decode(resp.body)
//	    return {
//	        country = data.country,
//	        region  = data.region,
//	        city    = data.city,
//	        lat     = data.latitude,
//	        lon     = data.longitude,
//	        isp     = data.isp,
//	    }
//	end
package luaprovider
