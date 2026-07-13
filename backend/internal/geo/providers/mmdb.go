package providers

import (
	"fmt"
	"net"
	"path/filepath"
	"strings"

	"frp-pv/internal/geo"

	"github.com/oschwald/geoip2-golang"
)

// MMDB 离线 MaxMind DB 查询 (城市级 + 坐标).
type MMDB struct {
	reader *geoip2.Reader
	name   string // 文件名去后缀作为 provider 名称
}

// NewMMDB 打开指定路径的 .mmdb 文件.
func NewMMDB(path string) (*MMDB, error) {
	r, err := geoip2.Open(path)
	if err != nil {
		return nil, fmt.Errorf("mmdb: %w", err)
	}
	name := strings.TrimSuffix(filepath.Base(path), ".mmdb")
	name = strings.ToLower(name)
	return &MMDB{reader: r, name: name}, nil
}

func (m *MMDB) Name() string { return m.name }

// IsOffline 实现 geo.OfflineProvider, 标记 MMDB 为离线查询源.
func (m *MMDB) IsOffline() bool { return true }

func (m *MMDB) Lookup(ip string) (*geo.Info, error) {
	parsed := net.ParseIP(ip)
	if parsed == nil {
		return nil, fmt.Errorf("mmdb[%s]: invalid IP %q", m.name, ip)
	}

	rec, err := m.reader.City(parsed)
	if err != nil {
		return nil, fmt.Errorf("mmdb[%s]: %w", m.name, err)
	}

	country := rec.Country.Names["zh-CN"]
	if country == "" {
		country = translateGeo(rec.Country.Names["en"], nil)
	}

	region := ""
	if len(rec.Subdivisions) > 0 {
		region = rec.Subdivisions[0].Names["zh-CN"]
		if region == "" {
			region = translateGeo(rec.Subdivisions[0].Names["en"], regionZh)
		}
	}

	city := rec.City.Names["zh-CN"]
	if city == "" {
		city = rec.City.Names["en"]
	}

	// 拆分 "City (District)" 模式, 如 "Jinrongjie (Xicheng District)"
	var district string
	city, district = splitCityDistrict(city)
	if district != "" {
		district = translateGeo(district, districtZh)
	}

	lat := rec.Location.Latitude
	lon := rec.Location.Longitude

	return &geo.Info{
		Lat:      &lat,
		Lon:      &lon,
		Country:  country,
		Region:   region,
		City:     city,
		District: district,
		IP:       ip,
	}, nil
}

// splitCityDistrict 拆分 "Name (District)" 格式.
func splitCityDistrict(city string) (string, string) {
	idx := strings.Index(city, "(")
	trimmed := strings.TrimSpace(city)
	if idx > 0 && strings.HasSuffix(trimmed, ")") {
		c := strings.TrimSpace(city[:idx])
		d := strings.TrimSpace(trimmed[strings.Index(trimmed, "(")+1 : len(trimmed)-1])
		return c, d
	}
	return city, ""
}

// translateGeo 英文地名 → 中文, 查表未命中则原样返回.
func translateGeo(en string, table map[string]string) string {
	if en == "" {
		return ""
	}
	if table != nil {
		key := strings.ToLower(strings.TrimSpace(en))
		if zh, ok := table[key]; ok {
			return zh
		}
	}
	// 通用国名表 (无论 table 是否为 nil 都查)
	key := strings.ToLower(strings.TrimSpace(en))
	if zh, ok := countryZh[key]; ok {
		return zh
	}
	return en
}

// ── 英中翻译表 (仅覆盖 MMDB 常见英文回退) ──────────────

var countryZh = map[string]string{
	"china": "中国", "united states": "美国", "japan": "日本",
	"south korea": "韩国", "singapore": "新加坡", "germany": "德国",
	"france": "法国", "united kingdom": "英国", "australia": "澳大利亚",
	"canada": "加拿大", "russia": "俄罗斯", "india": "印度",
	"brazil": "巴西", "hong kong": "中国香港", "taiwan": "中国台湾",
}

var regionZh = map[string]string{
	"anhui": "安徽", "beijing": "北京", "chongqing": "重庆",
	"fujian": "福建", "gansu": "甘肃", "guangdong": "广东",
	"guangxi": "广西", "guizhou": "贵州", "hainan": "海南",
	"hebei": "河北", "heilongjiang": "黑龙江", "henan": "河南",
	"hubei": "湖北", "hunan": "湖南", "inner mongolia": "内蒙古",
	"jiangsu": "江苏", "jiangxi": "江西", "jilin": "吉林",
	"liaoning": "辽宁", "ningxia": "宁夏", "qinghai": "青海",
	"shaanxi": "陕西", "shandong": "山东", "shanghai": "上海",
	"shanxi": "山西", "sichuan": "四川", "tianjin": "天津",
	"tibet": "西藏", "xinjiang": "新疆", "yunnan": "云南",
	"zhejiang": "浙江",
}

var districtZh = map[string]string{
	"dongcheng district": "东城区", "xicheng district": "西城区",
	"chaoyang district": "朝阳区", "haidian district": "海淀区",
	"fengtai district": "丰台区", "shijingshan district": "石景山区",
	"changping district": "昌平区", "tongzhou district": "通州区",
	"daxing district": "大兴区", "fangshan district": "房山区",
	"shunyi district": "顺义区", "mentougou district": "门头沟区",
	"huairou district": "怀柔区", "pinggu district": "平谷区",
	"pudong new area": "浦东新区", "huangpu district": "黄浦区",
	"xuhui district": "徐汇区", "minhang district": "闵行区",
	"tianhe district": "天河区", "nanshan district": "南山区",
	"futian district": "福田区",
}

// Close 释放 MMDB 资源.
func (m *MMDB) Close() error {
	if m.reader != nil {
		return m.reader.Close()
	}
	return nil
}
