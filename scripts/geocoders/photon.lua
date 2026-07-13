-- Photon (komoot) — 正向 + 逆向地理编码, 基于 OSM
-- 服务器在德国, SSL 握手通常 2-3 秒, 整体受 5s HTTP 超时保护
name   = "photon"
weight = 4

function forward(query)
    if not query or query == "" then return nil, "empty query" end

    local resp, err = http.get(
        "https://photon.komoot.io/api/"
        .. "?q=" .. http.url_encode(query)
        .. "&limit=1"
    )
    if err then return nil, err end
    if resp.status ~= 200 then return nil, "HTTP " .. resp.status end

    local data, jerr = json.decode(resp.body)
    if jerr then return nil, jerr end

    local features = data.features
    if not features or #features == 0 then return nil, "no results" end

    local coords = features[1].geometry and features[1].geometry.coordinates
    if not coords then return nil, "no coordinates" end

    -- GeoJSON: [lon, lat]
    return {
        lat = coords[2],
        lon = coords[1],
    }
end

function reverse(lat, lon)
    local resp, err = http.get(
        "https://photon.komoot.io/reverse"
        .. "?lat=" .. tostring(lat)
        .. "&lon=" .. tostring(lon)
        .. "&lang=default"
    )
    if err then return nil, err end
    if resp.status ~= 200 then return nil, "HTTP " .. resp.status end

    local data, jerr = json.decode(resp.body)
    if jerr then return nil, jerr end

    local features = data.features
    if not features or #features == 0 then return nil, "no features" end

    local p = features[1].properties or {}
    return {
        country  = p.country or "",
        region   = p.state or "",
        city     = p.city or p.municipality or "",
        district = p.district or p.county or "",
        locality = p.locality or "",
        street   = p.street or "",
    }
end
