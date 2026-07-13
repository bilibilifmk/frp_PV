-- freeipapi.com — 英文, 城市 + 坐标
name   = "freeipapi"
weight = 2

function lookup(ip)
    local resp, err = http.get("https://freeipapi.com/api/json/" .. ip)
    if err then return nil, err end
    if resp.status ~= 200 then return nil, "HTTP " .. resp.status end

    local d, jerr = json.decode(resp.body)
    if jerr then return nil, jerr end
    if not d.countryCode or d.countryCode == "" then
        return nil, "freeipapi: empty response"
    end

    local city, district = translate.split_city_district(d.cityName or "")

    return {
        country  = translate.country(d.countryCode or ""),
        region   = translate.admin(d.regionName or ""),
        city     = translate.admin(city),
        district = district,
        lat      = d.latitude,
        lon      = d.longitude,
        isp      = translate.isp(d.asnOrganization or ""),
        ip       = d.ipAddress or ip,
    }
end
