-- ═══════════════════════════════════════════════════════════
--  示例: ip-api.com (Lua 版)
--  这是一个完整的 provider 示例, 演示如何用 Lua 编写.
--  如果你已有内置的 Go 版 ip-api, 可以删除此文件.
-- ═══════════════════════════════════════════════════════════

name   = "lua-ip-api"   -- 加 lua- 前缀避免与内置冲突
weight = 2              -- 比内置的低, 仅做演示

function lookup(ip)
    local url = "http://ip-api.com/json/" .. ip
        .. "?lang=zh-CN&fields=status,country,regionName,city,district,lat,lon,isp,query"

    local resp, err = http.get(url)
    if err then
        return nil, err
    end
    if resp.status ~= 200 then
        return nil, "HTTP " .. resp.status
    end

    local data, jerr = json.decode(resp.body)
    if jerr then
        return nil, jerr
    end
    if data.status ~= "success" then
        return nil, "ip-api: " .. (data.message or "failed")
    end

    return {
        country  = data.country or "",
        region   = translate.strip_country_prefix(data.country or "", data.regionName or ""),
        city     = data.city or "",
        district = data.district or "",
        lat      = data.lat,
        lon      = data.lon,
        isp      = translate.isp(data.isp or ""),
        ip       = data.query or ip,
    }
end
