VENV ?= .venv
PYTHON ?= python3
VENV_PYTHON := $(VENV)/bin/python
VENV_PIP := $(VENV)/bin/pip

.PHONY: help venv upgrade-pip dev-install pi-install verify-imports run run-pi run-logger run-watcher clean-venv

help:
	@echo "Available targets:"
	@echo "  make venv            - Create local virtual environment at $(VENV)"
	@echo "  make upgrade-pip     - Upgrade pip/setuptools/wheel in $(VENV)"
	@echo "  make dev-install     - Install macOS/desktop dev dependencies"
	@echo "  make pi-install      - Install Raspberry Pi dependencies"
	@echo "  make verify-imports  - Smoke-test core Python imports"
	@echo "  make run             - Run kiln controller (desktop/macOS deps)"
	@echo "  make run-pi          - Run kiln controller (Raspberry Pi deps)"
	@echo "  make run-logger      - Run kiln logger against localhost"
	@echo "  make run-watcher     - Run watcher script"
	@echo "  make clean-venv      - Remove local virtual environment"

venv:
	@test -d $(VENV) || $(PYTHON) -m venv $(VENV)

upgrade-pip: venv
	$(VENV_PYTHON) -m pip install --upgrade pip wheel "setuptools<81"

dev-install: upgrade-pip
	$(VENV_PIP) install -r requirements-dev.txt

pi-install: upgrade-pip
	$(VENV_PIP) install -r requirements.txt

verify-imports: dev-install
	$(VENV_PYTHON) -c "import bottle, gevent, websocket, requests"

run: dev-install
	$(VENV_PYTHON) kiln-controller.py

run-pi: pi-install
	$(VENV_PYTHON) kiln-controller.py

run-logger: dev-install
	$(VENV_PYTHON) kiln-logger.py --hostname localhost:8081 --csvfile /tmp/kilnstats.csv

run-watcher: dev-install
	$(VENV_PYTHON) watcher.py

clean-venv:
	rm -rf $(VENV)