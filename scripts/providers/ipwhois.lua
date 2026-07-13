-- ipwhois.app — 中文, 城市 + 坐标 + ISP
name   = "ipwhois"
weight = 8

function lookup(ip)
    local resp, err = http.get("https://ipwhois.app/json/" .. ip .. "?lang=zh-CN")
    if err then return nil, err end
    if resp.status ~= 200 then return nil, "HTTP " .. resp.status end

    local d, jerr = json.decode(resp.body)
    if jerr then return nil, jerr end
    if not d.success and (not d.country or d.country == "") then
        return nil, "ipwhois: lookup failed"
    end

    return {
        country  = d.country or "",
        region   = translate.strip_country_prefix(d.country or "", d.region or ""),
        city     = d.city or "",
        lat      = d.latitude,
        lon      = d.longitude,
        isp      = translate.isp(d.isp or ""),
        ip       = d.ip or ip,
    }
end
