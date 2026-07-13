-- ═══════════════════════════════════════════════════════════
--  示例: 自定义 API 模板
--  假设你有一个私有 IP 查询 API, 返回标准 JSON.
-- ═══════════════════════════════════════════════════════════

name   = "my-private-api"
weight = 10               -- 高权重 = 高优先级

-- 如果你的 API 需要鉴权, 在 headers 里加 token
local API_KEY = "your-api-key-here"

function lookup(ip)
    local resp, err = http.get(
        "https://api.example.com/geo/" .. ip,
        { ["Authorization"] = "Bearer " .. API_KEY }
    )
    if err then return nil, err end
    if resp.status ~= 200 then return nil, "HTTP " .. resp.status end

    local data = json.decode(resp.body)

    return {
        country  = translate.country(data.country_code or ""),
        region   = translate.admin(data.state or ""),
        city     = translate.admin(data.city or ""),
        district = data.district or "",
        lat      = data.lat,
        lon      = data.lng,
        isp      = translate.isp(data.org or ""),
    }
end
