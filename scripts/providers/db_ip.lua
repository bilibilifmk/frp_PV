-- db-ip.com — 英文, 城市级, 无坐标
name   = "db-ip"
weight = 2

function lookup(ip)
    local resp, err = http.get("https://api.db-ip.com/v2/free/" .. ip)
    if err then return nil, err end
    if resp.status ~= 200 then return nil, "HTTP " .. resp.status end

    local d, jerr = json.decode(resp.body)
    if jerr then return nil, jerr end
    if d.error and d.error ~= "" then
        return nil, "db-ip: " .. d.error
    end

    local city, district = translate.split_city_district(d.city or "")

    return {
        country  = translate.country(d.countryCode or ""),
        city     = translate.admin(city),
        district = district,
        ip       = d.ipAddress or ip,
    }
end
