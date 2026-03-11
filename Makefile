.PHONY: all backend frontend dev-backend dev-frontend clean

# ── 默认: 构建全套 ──
all: frontend backend

# ── Go 后端 ──
backend:
	cd backend && go build -o ../bin/frp-pv ./cmd/server

# ── React 前端 ──
frontend:
	cd frontend && npm install && npm run build

# ── 开发模式 ──
dev-backend:
	cd backend && go run ./cmd/server -config ../config.json -static ../frontend/dist

dev-frontend:
	cd frontend && npm run dev

# ── 清理 ──
clean:
	rm -rf bin/ frontend/dist/ frontend/node_modules/
