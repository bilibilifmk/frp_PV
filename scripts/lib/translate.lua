-- translate.lua — 纯 Lua 实现的翻译模块
-- 提供 country / isp / admin / strip_country_prefix / split_city_district 函数
-- 被 stdlib 自动加载为全局 translate 表, Lua 脚本无需 require

local M = {}

-- ── 国家代码 (ISO 3166-1 alpha-2) → 中文 ──────────────

local cc_map = {
    CN = "中国", US = "美国", JP = "日本", KR = "韩国",
    SG = "新加坡", HK = "中国香港", TW = "中国台湾",
    DE = "德国", FR = "法国", GB = "英国", AU = "澳大利亚",
    CA = "加拿大", RU = "俄罗斯", IN = "印度", ID = "印度尼西亚",
    BR = "巴西", NL = "荷兰", TH = "泰国", VN = "越南",
    MY = "马来西亚", PH = "菲律宾", IT = "意大利", ES = "西班牙",
    SE = "瑞典", CH = "瑞士", MO = "中国澳门",
    NZ = "新西兰", IE = "爱尔兰", PL = "波兰", FI = "芬兰",
    NO = "挪威", DK = "丹麦", PT = "葡萄牙", AT = "奥地利",
    BE = "比利时", CZ = "捷克", MX = "墨西哥", AR = "阿根廷",
    CL = "智利", CO = "哥伦比亚", ZA = "南非", UA = "乌克兰",
    SA = "沙特阿拉伯", AE = "阿联酋", IL = "以色列", EG = "埃及",
    TR = "土耳其", PK = "巴基斯坦", BD = "孟加拉",
}

-- ── 国家全名 → 中文简称 ────────────────────────────────

local country_names = {
    ["中华人民共和国"] = "中国", ["美利坚合众国"] = "美国",
    ["大韩民国"] = "韩国", ["日本国"] = "日本",
    ["United States"] = "美国", ["United States of America"] = "美国",
    ["United Kingdom"] = "英国", ["Japan"] = "日本",
    ["South Korea"] = "韩国", ["Republic of Korea"] = "韩国",
    ["North Korea"] = "朝鲜", ["China"] = "中国",
    ["Singapore"] = "新加坡", ["Russia"] = "俄罗斯",
    ["Russian Federation"] = "俄罗斯", ["Germany"] = "德国",
    ["France"] = "法国", ["Australia"] = "澳大利亚",
    ["Canada"] = "加拿大", ["Brazil"] = "巴西",
    ["India"] = "印度", ["Indonesia"] = "印度尼西亚",
    ["Thailand"] = "泰国", ["Vietnam"] = "越南",
    ["Malaysia"] = "马来西亚", ["Philippines"] = "菲律宾",
    ["Netherlands"] = "荷兰", ["Italy"] = "意大利",
    ["Spain"] = "西班牙", ["Sweden"] = "瑞典",
    ["Switzerland"] = "瑞士", ["Taiwan"] = "台湾", ["Hong Kong"] = "香港",
    ["香港"] = "中国香港", ["台湾"] = "中国台湾", ["中华民国"] = "中国台湾",
}

-- ── ISP 英文关键词 → 中文简称 ──────────────────────────

local isp_en = {
    ["china unicom"]  = "联通", ["china telecom"] = "电信",
    ["china mobile"]  = "移动", ["chinanet"]      = "电信",
    ["cmnet"]         = "移动", ["cernet"]        = "教育网",
    ["tencent"]       = "腾讯云", ["alibaba"]     = "阿里云",
    ["aliyun"]        = "阿里云", ["huawei cloud"] = "华为云",
    ["amazon"]        = "AWS",   ["google"]       = "GCP",
    ["microsoft"]     = "Azure", ["cloudflare"]   = "Cloudflare",
    ["digitalocean"]  = "DigitalOcean", ["linode"] = "Linode",
    ["vultr"]         = "Vultr", ["ovh"]          = "OVH",
    ["hetzner"]       = "Hetzner",
}

local isp_full = {
    ["中国联通"] = "联通", ["中国电信"] = "电信", ["中国移动"] = "移动",
    ["中国铁通"] = "铁通", ["中国教育网"] = "教育网",
}

-- ── 省名英文 → 中文 ────────────────────────────────────

local province_en = {
    anhui = "安徽", beijing = "北京", chongqing = "重庆",
    fujian = "福建", gansu = "甘肃", guangdong = "广东",
    guangxi = "广西", guizhou = "贵州", hainan = "海南",
    hebei = "河北", heilongjiang = "黑龙江", henan = "河南",
    hubei = "湖北", hunan = "湖南", ["inner mongolia"] = "内蒙古",
    jiangsu = "江苏", jiangxi = "江西", jilin = "吉林",
    liaoning = "辽宁", ningxia = "宁夏", qinghai = "青海",
    shaanxi = "陕西", shandong = "山东", shanghai = "上海",
    shanxi = "山西", sichuan = "四川", tianjin = "天津",
    tibet = "西藏", xinjiang = "新疆", yunnan = "云南",
    zhejiang = "浙江", taiwan = "台湾",
    ["hong kong"] = "香港", macau = "澳门",
}

-- ── 城市名英文 → 中文 ──────────────────────────────────

local city_en = {
    beijing = "北京", shanghai = "上海", guangzhou = "广州",
    shenzhen = "深圳", chengdu = "成都", wuhan = "武汉",
    hangzhou = "杭州", nanjing = "南京", chongqing = "重庆",
    tianjin = "天津", suzhou = "苏州", changsha = "长沙",
    zhengzhou = "郑州", hefei = "合肥", fuzhou = "福州",
    jinan = "济南", qingdao = "青岛", dalian = "大连",
    shenyang = "沈阳", harbin = "哈尔滨", changchun = "长春",
    nanning = "南宁", guiyang = "贵阳", lhasa = "拉萨",
    urumqi = "乌鲁木齐", hohhot = "呼和浩特", lanzhou = "兰州",
    yinchuan = "银川", xining = "西宁", haikou = "海口",
    taiyuan = "太原", shijiazhuang = "石家庄", nanchang = "南昌",
    kunming = "昆明", xiamen = "厦门", ningbo = "宁波",
    wuxi = "无锡", dongguan = "东莞", foshan = "佛山",
    wenzhou = "温州", zhuhai = "珠海", changzhou = "常州",
    xian = "西安", ["xi'an"] = "西安",
}

-- ── 区/县名英文 → 中文 (API 常返回的主要城市区名) ──────

local district_en = {
    -- 北京
    ["dongcheng district"]    = "东城区",  ["xicheng district"]     = "西城区",
    ["chaoyang district"]     = "朝阳区",  ["haidian district"]     = "海淀区",
    ["fengtai district"]      = "丰台区",  ["shijingshan district"] = "石景山区",
    ["tongzhou district"]     = "通州区",  ["shunyi district"]      = "顺义区",
    ["changping district"]    = "昌平区",  ["daxing district"]      = "大兴区",
    ["fangshan district"]     = "房山区",  ["mentougou district"]   = "门头沟区",
    ["huairou district"]      = "怀柔区",  ["pinggu district"]      = "平谷区",
    ["miyun district"]        = "密云区",  ["yanqing district"]     = "延庆区",
    -- 上海
    ["pudong new area"]       = "浦东新区", ["huangpu district"]    = "黄浦区",
    ["xuhui district"]        = "徐汇区",  ["changning district"]  = "长宁区",
    ["jing'an district"]      = "静安区",  ["putuo district"]       = "普陀区",
    ["hongkou district"]      = "虹口区",  ["yangpu district"]      = "杨浦区",
    ["minhang district"]      = "闵行区",  ["baoshan district"]     = "宝山区",
    ["jiading district"]      = "嘉定区",  ["songjiang district"]   = "松江区",
    ["qingpu district"]       = "青浦区",  ["fengxian district"]    = "奉贤区",
    -- 广州
    ["tianhe district"]       = "天河区",  ["yuexiu district"]      = "越秀区",
    ["haizhu district"]       = "海珠区",  ["liwan district"]       = "荔湾区",
    ["baiyun district"]       = "白云区",  ["panyu district"]       = "番禺区",
    ["huangpu"]               = "黄埔区",  ["nansha district"]      = "南沙区",
    -- 深圳
    ["nanshan district"]      = "南山区",  ["futian district"]      = "福田区",
    ["luohu district"]        = "罗湖区",  ["longgang district"]    = "龙岗区",
    ["longhua district"]      = "龙华区",  ["baoan district"]       = "宝安区",
    -- 通用后缀
    dongcheng = "东城区",  xicheng = "西城区",
    chaoyang  = "朝阳区",  haidian  = "海淀区",
    fengtai   = "丰台区",  changping = "昌平区",
    pudong    = "浦东新区", tianhe    = "天河区",
    nanshan   = "南山区",  futian    = "福田区",
}

-- ── 翻译函数 ───────────────────────────────────────────

--- 国家代码或全名 → 简体中文
function M.country(raw)
    if not raw or raw == "" then return "" end
    -- 2-3 字母全大写 → 国家代码
    if #raw <= 3 and raw == raw:upper() then
        return cc_map[raw] or raw
    end
    return country_names[raw] or raw
end

--- 英文/中文全称 ISP → 中文简称
function M.isp(raw)
    if not raw or raw == "" then return "" end
    local low = raw:lower()
    for key, cn in pairs(isp_en) do
        if low:find(key, 1, true) then return cn end
    end
    for full, short in pairs(isp_full) do
        if raw:find(full, 1, true) then return short end
    end
    if #raw > 30 then
        local sp = raw:find(" ")
        if sp then return raw:sub(1, sp - 1) end
    end
    return raw
end

--- 判断字符是否为汉字 (CJK Unified Ideographs)
local function is_han(byte1, byte2, byte3)
    -- UTF-8: 汉字范围 U+4E00..U+9FFF → 0xE4B880..0xE9BFA0
    if not byte1 then return false end
    if byte1 < 0xE4 or byte1 > 0xE9 then return false end
    if byte1 == 0xE4 then
        return byte2 ~= nil and byte2 >= 0xB8
    end
    if byte1 == 0xE9 then
        return byte2 ~= nil and byte2 <= 0xBF
    end
    return true
end

--- 字符串是否含汉字
local function has_chinese(s)
    local i = 1
    while i <= #s do
        local b = s:byte(i)
        if b >= 0xE0 and b <= 0xEF then
            if is_han(b, s:byte(i + 1), s:byte(i + 2)) then
                return true
            end
            i = i + 3
        elseif b >= 0xC0 then
            i = i + 2
        else
            i = i + 1
        end
    end
    return false
end

--- 提取字符串前缀的连续中文字符
local function extract_chinese_prefix(s)
    local result = {}
    local i = 1
    while i <= #s do
        local b = s:byte(i)
        if b >= 0xE0 and b <= 0xEF then
            -- 3 字节 UTF-8
            if is_han(b, s:byte(i + 1), s:byte(i + 2)) then
                result[#result + 1] = s:sub(i, i + 2)
                i = i + 3
            else
                break
            end
        elseif b >= 0xC0 then
            break
        else
            -- ASCII: 允许 ·、-、空格 继续
            local ch = s:sub(i, i)
            if ch == "\194" then
                -- 可能是 · (U+00B7 = C2 B7)
                if s:byte(i + 1) == 0xB7 then
                    result[#result + 1] = s:sub(i, i + 1)
                    i = i + 2
                else
                    break
                end
            elseif ch == "-" then
                result[#result + 1] = ch
                i = i + 1
            elseif ch == " " then
                -- 空格后如果还有汉字就继续, 否则停
                local nb = s:byte(i + 1)
                if nb and nb >= 0xE0 and nb <= 0xEF then
                    i = i + 1  -- 跳过空格
                else
                    break
                end
            else
                break
            end
        end
    end
    local prefix = table.concat(result)
    -- 去首尾的 ·、-、空格
    prefix = prefix:gsub("^[·%- ]+", ""):gsub("[·%- ]+$", "")
    return prefix
end

--- 英文省/市名 → 中文, 也处理 '古洞 Kwu Tung' 双语格式
function M.admin(raw)
    if not raw or raw == "" then return raw end
    if has_chinese(raw) then
        local prefix = extract_chinese_prefix(raw)
        if prefix ~= "" then return prefix end
        return raw
    end
    local key = raw:lower():gsub("^%s+", ""):gsub("%s+$", "")
    return province_en[key] or city_en[key] or country_names[raw] or raw
end

--- 英文区/县名 → 中文
function M.district(raw)
    if not raw or raw == "" then return raw end
    if has_chinese(raw) then
        local prefix = extract_chinese_prefix(raw)
        if prefix ~= "" then return prefix end
        return raw
    end
    local key = raw:lower():gsub("^%s+", ""):gsub("%s+$", "")
    return district_en[key] or raw
end

--- 去地区字段中的国名前缀: "中国北京市" → "北京市"
function M.strip_country_prefix(country, value)
    if country ~= "" and value:sub(1, #country) == country then
        value = value:sub(#country + 1)
    end
    -- 去前导 , ， 空格 tab
    value = value:gsub("^[,%s，\t]+", "")
    return value
end

--- 拆括号里的区级: "Singapore (Downtown Core)" → "Singapore", "Downtown Core"
--- 拆完后自动翻译 city 和 district
function M.split_city_district(raw)
    local idx = raw:find("%(")
    if idx and idx > 1 and raw:sub(-1) == ")" then
        local city = raw:sub(1, idx - 1):gsub("%s+$", "")
        local dist = raw:sub(idx + 1, -2):gsub("^%s+", ""):gsub("%s+$", "")
        return M.admin(city), M.district(dist)
    end
    return raw, ""
end

return M
