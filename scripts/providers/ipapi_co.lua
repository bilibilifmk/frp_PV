-- ipapi.co — 英文, 城市 + 坐标
name   = "ipapi.co"
weight = 2

function lookup(ip)
    local resp, err = http.get("https://ipapi.co/" .. ip .. "/json/")
    if err then return nil, err end
    if resp.status ~= 200 then return nil, "HTTP " .. resp.status end

    local d, jerr = json.decode(resp.body)
    if jerr then return nil, jerr end
    if d.error then
        return nil, "ipapi.co: error"
    end

    return {
        country  = translate.country(d.country_code or ""),
        region   = translate.admin(d.region or ""),
        city     = translate.admin(d.city or ""),
        lat      = d.latitude,
        lon      = d.longitude,
        isp      = translate.isp(d.org or ""),
        ip       = d.ip or ip,
    }
end
