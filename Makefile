.PHONY: all backend frontend assemble cross clean dev-backend dev-frontend

DIST    := dist
BIN     := $(DIST)/frp-pv
STATIC  := $(DIST)/static
SCRIPTS := $(DIST)/scripts

# ── 默认: 构建全套并组装到 dist/ ──
all: cross frontend assemble

# ── Go 后端 (本机) ──
backend:
	cd backend && go build -o ../$(BIN) ./cmd/server

# ── React 前端 ──
frontend:
	cd frontend && npm install && npm run build

# ── 组装产出目录 ──
assemble:
	@mkdir -p $(DIST)/data
	@rm -rf $(STATIC) $(SCRIPTS)
	cp -r frontend/dist $(STATIC)
	cp -r scripts $(SCRIPTS)
	@echo "✓ 产出已组装到 $(DIST)/"

# ── 交叉编译 (Linux amd64) ──
cross:
	cd backend && GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -o ../$(BIN) ./cmd/server

# ── 开发模式 ──
dev-backend:
	cd backend && go run ./cmd/server -db ../data/frp-pv.db -host 0.0.0.0 -port 5008 -static ../frontend/dist

dev-frontend:
	cd frontend && npm run dev

# ── 清理 ──
clean:
	rm -rf $(DIST) frontend/dist frontend/node_modules
