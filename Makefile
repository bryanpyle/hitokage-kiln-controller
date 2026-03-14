VENV ?= .venv
PYTHON ?= python3
VENV_PYTHON := $(VENV)/bin/python
VENV_PIP := $(VENV)/bin/pip

FRONTEND_DIR := frontend

# Load nvm so `npm` is available regardless of how make is invoked
# Falls back gracefully if nvm is not installed
NVM_SCRIPT := $(HOME)/.nvm/nvm.sh
define npm_run
	bash -c 'export NVM_DIR="$$HOME/.nvm"; [ -s "$(NVM_SCRIPT)" ] && source "$(NVM_SCRIPT)"; cd $(FRONTEND_DIR) && $(1)'
endef

.PHONY: help venv upgrade-pip dev-install pi-install verify-imports \
        run run-pi run-logger run-watcher \
        backend backend-pi \
        frontend frontend-dev frontend-build \
        dev clean-venv

help:
	@echo "Available targets:"
	@echo ""
	@echo "  Python environment"
	@echo "  make venv            - Create local virtual environment at $(VENV)"
	@echo "  make upgrade-pip     - Upgrade pip/setuptools/wheel in $(VENV)"
	@echo "  make dev-install     - Install macOS/desktop dev dependencies (incl. FastAPI)"
	@echo "  make pi-install      - Install Raspberry Pi dependencies (incl. FastAPI)"
	@echo "  make verify-imports  - Smoke-test core Python imports"
	@echo ""
	@echo "  Backend (FastAPI)"
	@echo "  make backend         - Run FastAPI backend (macOS/desktop sim mode)"
	@echo "  make backend-pi      - Run FastAPI backend (Raspberry Pi hardware)"
	@echo ""
	@echo "  Frontend (React + Vite)"
	@echo "  make frontend        - Install frontend npm dependencies"
	@echo "  make frontend-dev    - Start Vite dev server (proxies API to :8081)"
	@echo "  make frontend-build  - Build production React bundle into frontend/dist"
	@echo ""
	@echo "  Combined"
	@echo "  make dev             - Install all deps (Python + npm)"
	@echo ""
	@echo "  Legacy (bottle/gevent)"
	@echo "  make run             - Run legacy kiln-controller.py (desktop/macOS deps)"
	@echo "  make run-pi          - Run legacy kiln-controller.py (Raspberry Pi deps)"
	@echo "  make run-logger      - Run kiln logger against localhost"
	@echo "  make run-watcher     - Run watcher script"
	@echo ""
	@echo "  Cleanup"
	@echo "  make clean-venv      - Remove local virtual environment"

# ── Python venv ──────────────────────────────────────────────────────────────

venv:
	@test -d $(VENV) || $(PYTHON) -m venv $(VENV)

upgrade-pip: venv
	$(VENV_PYTHON) -m pip install --upgrade pip wheel "setuptools<81"

dev-install: upgrade-pip
	$(VENV_PIP) install -r requirements-dev.txt

pi-install: upgrade-pip
	$(VENV_PIP) install -r requirements.txt

verify-imports: dev-install
	$(VENV_PYTHON) -c "import fastapi, uvicorn, bottle, gevent, websocket, requests"

# ── FastAPI backend ───────────────────────────────────────────────────────────

backend: dev-install
	$(VENV_PYTHON) backend/main.py

backend-pi: pi-install
	$(VENV_PYTHON) backend/main.py

# ── React frontend ────────────────────────────────────────────────────────────

frontend:
	$(call npm_run,npm install)

frontend-dev: frontend
	$(call npm_run,npm run dev)

frontend-build: frontend
	$(call npm_run,npm run build)

# ── Combined dev setup ────────────────────────────────────────────────────────

dev: dev-install frontend
	@echo ""
	@echo "All dependencies installed."
	@echo "Run 'make backend' in one terminal and 'make frontend-dev' in another."

# ── Legacy bottle/gevent server ───────────────────────────────────────────────

run: dev-install
	$(VENV_PYTHON) kiln-controller.py

run-pi: pi-install
	$(VENV_PYTHON) kiln-controller.py

run-logger: dev-install
	$(VENV_PYTHON) kiln-logger.py --hostname localhost:8081 --csvfile /tmp/kilnstats.csv

run-watcher: dev-install
	$(VENV_PYTHON) watcher.py

# ── Cleanup ───────────────────────────────────────────────────────────────────

clean-venv:
	rm -rf $(VENV)