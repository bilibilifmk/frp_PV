package providers

import (
	"compress/gzip"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

const (
	// DB-IP 免费城市级 MMDB (每月更新, 无需 API key).
	dbipURLTemplate = "https://download.db-ip.com/free/dbip-city-lite-%s.mmdb.gz"
	downloadTimeout = 120 * time.Second
	targetFilename  = "dbip-city-lite.mmdb"
)

// EnsureMMDB 检查 dataDir 下是否有 .mmdb 文件, 没有则自动下载.
// 返回值: 是否执行了下载, 以及可能的错误.
func EnsureMMDB(dataDir string) (downloaded bool, err error) {
	// 确保目录存在
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return false, fmt.Errorf("创建 data 目录失败: %w", err)
	}

	// 检查是否已有 .mmdb 文件
	files, _ := filepath.Glob(filepath.Join(dataDir, "*.mmdb"))
	if len(files) > 0 {
		return false, nil
	}

	log.Println("[GEO] data/ 下未找到 .mmdb 文件, 开始自动下载...")

	// 按当前月份构造 URL
	now := time.Now()
	url := fmt.Sprintf(dbipURLTemplate, now.Format("2006-01"))

	dest := filepath.Join(dataDir, targetFilename)
	if err := downloadGzMMDB(url, dest); err != nil {
		// 如果当月的还没发布, 试上个月的
		prev := now.AddDate(0, -1, 0)
		urlPrev := fmt.Sprintf(dbipURLTemplate, prev.Format("2006-01"))
		log.Printf("[GEO] 当月 MMDB 下载失败, 尝试上月: %v", err)
		if err2 := downloadGzMMDB(urlPrev, dest); err2 != nil {
			return false, fmt.Errorf("MMDB 下载失败: 当月: %v, 上月: %v", err, err2)
		}
	}

	log.Printf("[GEO] ✓ MMDB 已下载: %s", dest)
	return true, nil
}

// downloadGzMMDB 从 URL 下载 gzip 压缩的 MMDB 并解压保存.
func downloadGzMMDB(url, dest string) error {
	log.Printf("[GEO] 正在下载: %s", url)

	client := &http.Client{Timeout: downloadTimeout}
	resp, err := client.Get(url)
	if err != nil {
		return fmt.Errorf("HTTP 请求失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	gz, err := gzip.NewReader(resp.Body)
	if err != nil {
		return fmt.Errorf("gzip 解压失败: %w", err)
	}
	defer gz.Close()

	// 先写临时文件, 完成后原子重命名
	tmp := dest + ".tmp"
	f, err := os.Create(tmp)
	if err != nil {
		return fmt.Errorf("创建临时文件失败: %w", err)
	}

	n, err := io.Copy(f, gz)
	f.Close()
	if err != nil {
		os.Remove(tmp)
		return fmt.Errorf("写入失败: %w", err)
	}

	if err := os.Rename(tmp, dest); err != nil {
		os.Remove(tmp)
		return fmt.Errorf("重命名失败: %w", err)
	}

	log.Printf("[GEO] 下载完成: %.1f MB", float64(n)/1024/1024)
	return nil
}
