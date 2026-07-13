-- BigDataCloud — 逆向地理编码, 免费, 中文, 区级
-- 仅支持 reverse (坐标 → 地址)
name = "bigdata"

function reverse(lat, lon)
    local resp, err = http.get(
        "https://api.bigdatacloud.net/data/reverse-geocode-client"
        .. "?latitude=" .. tostring(lat)
        .. "&longitude=" .. tostring(lon)
        .. "&localityLanguage=zh-Hans"
    )
    if err then return nil, err end
    if resp.status ~= 200 then return nil, "HTTP " .. resp.status end

    local d, jerr = json.decode(resp.body)
    if jerr then return nil, jerr end

    return {
        country  = translate.country(d.countryName or ""),
        region   = d.principalSubdivision or "",
        city     = d.city or "",
        district = d.locality or "",
    }
end
