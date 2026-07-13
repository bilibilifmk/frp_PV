-- ipquery.io — 英文, 城市 + 坐标 + ISP
name   = "ipquery"
weight = 5

function lookup(ip)
    local resp, err = http.get("https://api.ipquery.io/" .. ip)
    if err then return nil, err end
    if resp.status ~= 200 then return nil, "HTTP " .. resp.status end

    local d, jerr = json.decode(resp.body)
    if jerr then return nil, jerr end

    local loc = d.location or {}
    local isp_info = d.isp or {}

    local cc = loc.country_code or ""
    local country = translate.country(cc)
    if country == cc and loc.country and loc.country ~= "" then
        country = translate.country(loc.country)
    end

    local city, district = translate.split_city_district(loc.city or "")

    local isp = isp_info.isp or ""
    if isp == "" then isp = isp_info.org or "" end

    return {
        country  = country,
        region   = translate.admin(loc.state or ""),
        city     = translate.admin(city),
        district = district,
        lat      = loc.latitude,
        lon      = loc.longitude,
        isp      = translate.isp(isp),
        ip       = d.ip or ip,
    }
end
