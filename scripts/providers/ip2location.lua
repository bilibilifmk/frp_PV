-- ip2location.io — 英文, 城市 + 坐标 + ASN
name   = "ip2location"
weight = 5

function lookup(ip)
    local resp, err = http.get("https://api.ip2location.io/?ip=" .. ip)
    if err then return nil, err end
    if resp.status ~= 200 then return nil, "HTTP " .. resp.status end

    local d, jerr = json.decode(resp.body)
    if jerr then return nil, jerr end
    if not d.country_code or d.country_code == "" then
        return nil, "ip2location: empty response"
    end

    return {
        country  = translate.country(d.country_code or ""),
        region   = translate.admin(d.region_name or ""),
        city     = translate.admin(d.city_name or ""),
        lat      = d.latitude,
        lon      = d.longitude,
        isp      = translate.isp(d.as or ""),
        ip       = d.ip or ip,
    }
end
