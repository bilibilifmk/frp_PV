-- Nominatim (OpenStreetMap) — 正向 + 逆向地理编码
-- forward: 地址文本 → 坐标
-- reverse: 坐标 → 精细地址 (含 district/locality/street)
name   = "nominatim"
weight = 4

-- Nominatim 有时同时返回简繁体, 以 ';' 或 ' / ' 分隔, 取第一段
local function clean(s)
    if not s or s == "" then return "" end
    local idx = string.find(s, ";")
    if idx then return string.sub(s, 1, idx - 1) end
    idx = string.find(s, " / ", 1, true)
    if idx then return string.sub(s, 1, idx - 1) end
    return s
end

function forward(query)
    if not query or query == "" then return nil, "empty query" end

    local resp, err = http.get(
        "https://nominatim.openstreetmap.org/search"
        .. "?q=" .. http.url_encode(query)
        .. "&format=json&limit=1",
        { ["User-Agent"] = "frp-pv-geocoder/1.0" }
    )
    if err then return nil, err end
    if resp.status ~= 200 then return nil, "HTTP " .. resp.status end

    local data, jerr = json.decode(resp.body)
    if jerr then return nil, jerr end
    if not data or #data == 0 then return nil, "no results" end

    return {
        lat = tonumber(data[1].lat),
        lon = tonumber(data[1].lon),
    }
end

function reverse(lat, lon)
    local resp, err = http.get(
        "https://nominatim.openstreetmap.org/reverse"
        .. "?lat=" .. tostring(lat)
        .. "&lon=" .. tostring(lon)
        .. "&format=json&zoom=14"
        .. "&accept-language=zh-Hans,zh;q=0.9",
        { ["User-Agent"] = "frp-pv-geocoder/1.0" }
    )
    if err then return nil, err end
    if resp.status ~= 200 then return nil, "HTTP " .. resp.status end

    local data, jerr = json.decode(resp.body)
    if jerr then return nil, jerr end
    if data.error then return nil, data.error end

    local addr = data.address or {}
    return {
        country  = clean(addr.country or ""),
        region   = clean(addr.state or ""),
        city     = clean(addr.city or addr.town or addr.municipality or ""),
        district = clean(addr.city_district or addr.suburb or addr.county or addr.borough or ""),
        locality = clean(addr.neighbourhood or addr.quarter or ""),
        street   = clean(addr.road or ""),
    }
end
