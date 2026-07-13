package services

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

const firewallChain = "FRP_PV"

// IPTables 只操作独立链，不修改宿主机已有规则。
type IPTables struct{}

func NewIPTables() *IPTables { return &IPTables{} }

func (f *IPTables) run(args ...string) error {
	if runtime.GOOS != "linux" {
		return fmt.Errorf("iptables 模式仅支持 Linux")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "iptables", append([]string{"-w", "2"}, args...)...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("iptables %v: %v (%s)", args, err, stderr.String())
	}
	return nil
}

func (f *IPTables) Ensure() error {
	if err := f.run("-N", firewallChain); err != nil {
		// 链已存在也是非零状态，以检查命令确认即可。
		if check := f.run("-L", firewallChain, "-n"); check != nil {
			return err
		}
	}
	if err := f.run("-C", "INPUT", "-j", firewallChain); err != nil {
		return f.run("-I", "INPUT", "1", "-j", firewallChain)
	}
	return nil
}

func (f *IPTables) Block(ip string) error {
	if err := f.Ensure(); err != nil {
		return err
	}
	if f.run("-C", firewallChain, "-s", ip, "-j", "DROP") == nil {
		return nil
	}
	return f.run("-A", firewallChain, "-s", ip, "-j", "DROP")
}

func (f *IPTables) Unblock(ip string) error {
	if runtime.GOOS != "linux" {
		return nil
	}
	err := f.run("-D", firewallChain, "-s", ip, "-j", "DROP")
	if isMissingRule(err) {
		return nil
	}
	return err
}

func (f *IPTables) Flush() error {
	if runtime.GOOS != "linux" {
		return nil
	}
	err := f.run("-F", firewallChain)
	if isMissingRule(err) {
		return nil
	}
	return err
}

func isMissingRule(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "No chain/target/match") || strings.Contains(msg, "does a matching rule exist")
}
