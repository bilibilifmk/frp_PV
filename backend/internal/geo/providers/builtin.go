package providers

import (
	"log"
	"path/filepath"

	"frp-pv/internal/geo"
)

// BuiltinProviders 扫描 dataDir 下的所有 .mmdb 文件并加载为内置 provider.
func BuiltinProviders(dataDir string) []geo.ProviderEntry {
	files, _ := filepath.Glob(filepath.Join(dataDir, "*.mmdb"))
	var entries []geo.ProviderEntry
	for _, f := range files {
		p, err := NewMMDB(f)
		if err != nil {
			log.Printf("[GEO] MMDB 不可用 %s: %v", filepath.Base(f), err)
			continue
		}
		entries = append(entries, geo.ProviderEntry{Provider: p, Weight: 10})
		log.Printf("[GEO] ✓ MMDB 已加载: %s", filepath.Base(f))
	}
	if len(entries) == 0 {
		log.Printf("[GEO] data/ 下未找到 .mmdb 文件")
	}
	return entries
}
