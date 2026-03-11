package geo

import (
	"log"
	"sync"
)

// Provider 是 IP 地理查询提供者的抽象接口.
type Provider interface {
	Name() string
	Lookup(ip string) (*Info, error)
}

// Service 多源 IP 地理查询 + 内存缓存.
type Service struct {
	providers []Provider
	cache     sync.Map // ip → *Info
}

// NewService 用给定的 Provider 列表构造服务 (按顺序 fallback).
func NewService(providers ...Provider) *Service {
	return &Service{providers: providers}
}

// Lookup 同步查询 (优先缓存).
func (s *Service) Lookup(ip string) *Info {
	if ip == "" {
		return s.lookupSelf()
	}
	if v, ok := s.cache.Load(ip); ok {
		return v.(*Info)
	}
	for _, p := range s.providers {
		info, err := p.Lookup(ip)
		if err == nil && info != nil {
			s.cache.Store(ip, info)
			return info
		}
		log.Printf("[GEO] %s lookup %s failed: %v", p.Name(), ip, err)
	}
	return nil
}

// LookupAsync 异步查询, 完成后调用 callback.
func (s *Service) LookupAsync(ip string, callback func(string, *Info)) {
	go func() {
		info := s.Lookup(ip)
		if callback != nil {
			callback(ip, info)
		}
	}()
}

// GetCached 仅查缓存, 不发起网络请求.
func (s *Service) GetCached(ip string) *Info {
	if v, ok := s.cache.Load(ip); ok {
		return v.(*Info)
	}
	return nil
}

// DetectServerLocation 查询本机公网 IP 定位.
func (s *Service) DetectServerLocation() *Info {
	return s.lookupSelf()
}

func (s *Service) lookupSelf() *Info {
	for _, p := range s.providers {
		info, err := p.Lookup("") // 空 IP → 查本机
		if err == nil && info != nil {
			return info
		}
	}
	return nil
}
