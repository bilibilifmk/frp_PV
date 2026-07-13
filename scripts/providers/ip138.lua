-- ip138.com / ipshudi.com — 中文, 区级精度, 含 ISP, 无坐标
-- 网页抓取版, 无需 token
-- ip138 对数据中心 IP 会重定向到 ipshudi.com, 两种格式均兼容
name   = "ip138"
weight = 8

function lookup(ip)
    -- ipshudi.com 格式稳定, 直接用它
    local url = "https://www.ipshudi.com/" .. ip .. ".htm"
    local resp, err = http.get(url, {
        ["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        ["Accept-Language"] = "zh-CN,zh;q=0.9",
    })
    if err then return nil, err end
    if resp.status ~= 200 then return nil, "HTTP " .. resp.status end

    -- 精确匹配: <td class="th">归属地</td><td>...<span>中国 北京市  昌平区</span>
    local loc_match = re.match("<td[^>]*class=\"th\"[^>]*>归属地</td>[\\s\\S]*?<td[^>]*>[\\s\\S]*?<span>([^<]+)</span>", resp.body)
    if not loc_match then return nil, "ip138: parse failed" end
    local location = loc_match[2]

    -- 精确匹配: <td class="th">运营商</td><td>...<span>联通</span>
    local isp_match = re.match("<td[^>]*class=\"th\"[^>]*>运营商</td>[\\s\\S]*?<td[^>]*>[\\s\\S]*?<span>([^<]+)</span>", resp.body)
    local isp = isp_match and isp_match[2] or ""

    -- 拆地址 (空格分隔: "中国 北京市  昌平区")
    local country, region, city, district = parse_address(location)

    -- 去行政后缀, 与其他 provider 对齐 (北京市→北京, 广东省→广东, 广州市→广州)
    region = strip_admin(region)
    city   = strip_admin(city)

    return {
        country  = country,
        region   = region,
        city     = city,
        district = district,
        isp      = translate.isp(isp),
        ip       = ip,
    }
end

local municipalities = { ["北京市"]=true, ["上海市"]=true, ["天津市"]=true, ["重庆市"]=true }
function is_municipality(s)
    return municipalities[s] or false
end

--- 去除行政后缀: 北京市→北京, 广东省→广东, 内蒙古自治区→内蒙古
function strip_admin(s)
    if s == "" then return s end
    local m = re.match("^(.+?)(?:自治区|特别行政区|省|市)$", s)
    if m then return m[2] end
    return s
end

--- 拆分地址字符串
--- 输入可能是空格分隔 "中国 北京市  昌平区" 或连写 "中国北京市昌平区"
function parse_address(addr)
    -- 先按空格拆
    local parts = {}
    for word in string.gmatch(addr, "%S+") do
        table.insert(parts, word)
    end

    if #parts >= 4 then
        return parts[1], parts[2], parts[3], parts[4]
    elseif #parts == 3 then
        -- 直辖市 "中国 北京市 昌平区" → region=北京市, city="", district=昌平区
        -- 普通省 "中国 广东省 广州市" → region=广东省, city=广州市, district=""
        if is_municipality(parts[2]) then
            return parts[1], parts[2], "", parts[3]
        else
            return parts[1], parts[2], parts[3], ""
        end
    elseif #parts == 2 then
        return parts[1], parts[2], "", ""
    elseif #parts == 1 then
        -- 连写模式: 用正则拆
        return parse_joined(parts[1])
    end

    return addr, "", "", ""
end

--- 拆连写中文地址 "中国北京市昌平区"
function parse_joined(addr)
    -- 直辖市
    local m = re.match("^(中国)(北京|上海|天津|重庆)市?(.*)", addr)
    if m then
        return m[2], m[3], "", m[4]
    end

    -- 普通省份+市+区
    m = re.match("^(中国)(.*?(?:省|自治区))(.*?(?:市|自治州|地区|盟))(.*)", addr)
    if m then
        return m[2], m[3], m[4], m[5]
    end

    -- 省份+余下
    m = re.match("^(中国)(.*?(?:省|自治区))(.*)", addr)
    if m then
        return m[2], m[3], m[4], ""
    end

    -- 中国+余下
    m = re.match("^(中国)(.*)", addr)
    if m then
        return m[2], m[3], "", ""
    end

    return addr, "", "", ""
end
