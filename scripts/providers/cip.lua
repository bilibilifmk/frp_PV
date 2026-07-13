-- cip.cc — 中文纯文本, 含 ISP, 无坐标
-- 需要伪装 curl UA 才能拿到纯文本格式
name   = "cip.cc"
weight = 4

function lookup(ip)
    local resp, err = http.get(
        "https://www.cip.cc/" .. ip,
        { ["User-Agent"] = "curl/7.0" }
    )
    if err then return nil, err end

    -- 正则提取 "地址 : xxx" 和 "运营商 : xxx"
    local addr_match = re.match("地址\\s*:\\s*(.+?)\\n", resp.body)
    local isp_match  = re.match("运营商\\s*:\\s*(.+?)\\n", resp.body)

    if not addr_match then
        return nil, "cip.cc: parse failed"
    end

    -- 地址字段按空格拆分: "中国  北京  北京  海淀区"
    local parts = {}
    for word in string.gmatch(addr_match[2], "%S+") do
        table.insert(parts, word)
    end

    return {
        country  = parts[1] or "",
        region   = parts[2] or "",
        city     = parts[3] or "",
        district = parts[4] or "",
        isp      = isp_match and translate.isp(isp_match[2]) or "",
        ip       = ip,
    }
end
