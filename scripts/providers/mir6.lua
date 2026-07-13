-- mir6.com — 中文, 区级精度, 含 ISP, 无坐标
-- API: https://api.mir6.com/api/ip?ip=x.x.x.x&type=json
-- 注意: data.city 实际存的是区/县, data.districts 通常为空
name   = "mir6"
weight = 7

function lookup(ip)
    local resp, err = http.get("https://api.mir6.com/api/ip?ip=" .. ip .. "&type=json")
    if err then return nil, err end
    if resp.status ~= 200 then return nil, "HTTP " .. resp.status end

    local d, jerr = json.decode(resp.body)
    if jerr then return nil, jerr end
    if d.code ~= 200 then
        return nil, "mir6: code=" .. tostring(d.code)
    end

    local data = d.data or {}
    -- districts 优先; 若为空则取 city (mir6 的 city 实际放的是区)
    local district = data.districts or ""
    if district == "" then district = data.city or "" end

    return {
        country  = data.country or "",
        region   = data.province or "",
        district = district,
        isp      = translate.isp(data.isp or ""),
        ip       = data.ip or ip,
    }
end
