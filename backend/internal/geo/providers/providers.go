// Package providers 实现各 IP 地理查询源.
package providers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"frp-pv/internal/geo"
)

// ═══════════════════════════════════════════════════════════
//  ip-api.com  (免费, 45 req/min, 支持中文)
// ═══════════════════════════════════════════════════════════

// IPAPI 通过 ip-api.com 查询 IP 地理位置.
type IPAPI struct {
	client *http.Client
}

// NewIPAPI 构造 IPAPI 提供者.
func NewIPAPI() *IPAPI {
	return &IPAPI{client: &http.Client{Timeout: 5 * time.Second}}
}

func (p *IPAPI) Name() string { return "ip-api" }

type ipAPIResp struct {
	Status     string  `json:"status"`
	Country    string  `json:"country"`
	RegionName string  `json:"regionName"`
	City       string  `json:"city"`
	District   string  `json:"district"`
	Lat        float64 `json:"lat"`
	Lon        float64 `json:"lon"`
	ISP        string  `json:"isp"`
	Query      string  `json:"query"`
}

func (p *IPAPI) Lookup(ip string) (*geo.Info, error) {
	url := fmt.Sprintf(
		"http://ip-api.com/json/%s?lang=zh-CN&fields=status,country,regionName,city,district,lat,lon,isp,query",
		ip,
	)
	resp, err := p.client.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var d ipAPIResp
	if err := json.NewDecoder(resp.Body).Decode(&d); err != nil {
		return nil, err
	}
	if d.Status != "success" {
		return nil, fmt.Errorf("ip-api: status=%s for %s", d.Status, ip)
	}

	lat, lon := d.Lat, d.Lon
	return &geo.Info{
		Lat: &lat, Lon: &lon,
		Country: d.Country, Region: d.RegionName,
		City: d.City, District: d.District,
		ISP: d.ISP, IP: d.Query,
	}, nil
}

// ═══════════════════════════════════════════════════════════
//  ipwho.is  (免费, 10k/月)
// ═══════════════════════════════════════════════════════════

// IPWho 通过 ipwho.is 查询.
type IPWho struct {
	client *http.Client
}

// NewIPWho 构造提供者.
func NewIPWho() *IPWho {
	return &IPWho{client: &http.Client{Timeout: 5 * time.Second}}
}

func (p *IPWho) Name() string { return "ipwho" }

type ipWhoResp struct {
	Success bool    `json:"success"`
	IP      string  `json:"ip"`
	Country string  `json:"country"`
	Region  string  `json:"region"`
	City    string  `json:"city"`
	Lat     float64 `json:"latitude"`
	Lon     float64 `json:"longitude"`
	ISP     string  `json:"connection>isp"`
}

// ipWhoRaw 用于解析嵌套 JSON.
type ipWhoRaw struct {
	Success    bool    `json:"success"`
	IP         string  `json:"ip"`
	Country    string  `json:"country"`
	Region     string  `json:"region"`
	City       string  `json:"city"`
	Lat        float64 `json:"latitude"`
	Lon        float64 `json:"longitude"`
	Connection struct {
		ISP string `json:"isp"`
	} `json:"connection"`
}

func (p *IPWho) Lookup(ip string) (*geo.Info, error) {
	url := "https://ipwho.is/" + ip
	resp, err := p.client.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var d ipWhoRaw
	if err := json.NewDecoder(resp.Body).Decode(&d); err != nil {
		return nil, err
	}
	if !d.Success {
		return nil, fmt.Errorf("ipwho: lookup failed for %s", ip)
	}

	lat, lon := d.Lat, d.Lon
	return &geo.Info{
		Lat: &lat, Lon: &lon,
		Country: d.Country, Region: d.Region,
		City: d.City, ISP: d.Connection.ISP,
		IP: d.IP,
	}, nil
}
