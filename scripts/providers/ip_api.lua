-- ip-api.com — 中文, 区级 + 坐标 + ISP
name   = "ip-api"
weight = 3

function lookup(ip)
    local url = "http://ip-api.com/json/" .. ip
        .. "?lang=zh-CN&fields=status,country,regionName,city,district,lat,lon,isp,query"

    local resp, err = http.get(url)
    if err then return nil, err end
    if resp.status ~= 200 then return nil, "HTTP " .. resp.status end

    local d, jerr = json.decode(resp.body)
    if jerr then return nil, jerr end
    if d.status ~= "success" then
        return nil, "ip-api: " .. (d.message or "failed")
    end

    return {
        country  = d.country or "",
        region   = translate.strip_country_prefix(d.country or "", d.regionName or ""),
        city     = d.city or "",
        district = d.district or "",
        lat      = d.lat,
        lon      = d.lon,
        isp      = translate.isp(d.isp or ""),
        ip       = d.query or ip,
    }
end
