-- ipinfo.io — 英文, 城市 + 坐标 + ASN
name   = "ipinfo"
weight = 6

function lookup(ip)
    local resp, err = http.get("https://ipinfo.io/" .. ip .. "/json")
    if err then return nil, err end
    if resp.status ~= 200 then return nil, "HTTP " .. resp.status end

    local d, jerr = json.decode(resp.body)
    if jerr then return nil, jerr end
    if d.bogon then
        return nil, "ipinfo: bogon IP"
    end

    local lat, lon = nil, nil
    if d.loc then
        local parts = {}
        for v in string.gmatch(d.loc, "[^,]+") do
            table.insert(parts, tonumber(v))
        end
        if #parts == 2 then
            lat = parts[1]
            lon = parts[2]
        end
    end

    -- org: "AS12345 SomeName" → strip AS prefix
    local isp = d.org or ""
    if string.sub(isp, 1, 2) == "AS" then
        local idx = string.find(isp, " ")
        if idx then
            isp = string.sub(isp, idx + 1)
        end
    end

    return {
        country  = translate.country(d.country or ""),
        region   = translate.admin(d.region or ""),
        city     = translate.admin(d.city or ""),
        lat      = lat,
        lon      = lon,
        isp      = translate.isp(isp),
        ip       = d.ip or ip,
    }
end
