-- ipwho.is — 中文, 城市 + 坐标 + ISP
name   = "ipwho"
weight = 8

function lookup(ip)
    local resp, err = http.get("https://ipwho.is/" .. ip)
    if err then return nil, err end
    if resp.status ~= 200 then return nil, "HTTP " .. resp.status end

    local d, jerr = json.decode(resp.body)
    if jerr then return nil, jerr end
    if not d.success then
        return nil, "ipwho: lookup failed"
    end

    local isp = ""
    if d.connection and d.connection.isp then
        isp = d.connection.isp
    end

    return {
        country  = translate.country(d.country_code or d.country or ""),
        region   = translate.admin(translate.strip_country_prefix(d.country or "", d.region or "")),
        city     = translate.admin(d.city or ""),
        lat      = d.latitude,
        lon      = d.longitude,
        isp      = translate.isp(isp),
        ip       = d.ip or ip,
    }
end
