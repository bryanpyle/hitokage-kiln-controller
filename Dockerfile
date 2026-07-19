# ── Stage 1: Build React / Vite frontend ──────────────────────────────────────
FROM node:24-alpine AS frontend-builder

WORKDIR /build

# Install dependencies first (cached layer)
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --frozen-lockfile

# BUILD_VERSION is injected by CI (e.g. "2.0.0-sha-abc1234").
# Falls back to the version in package.json when building locally.
ARG BUILD_VERSION=
ENV BUILD_VERSION=${BUILD_VERSION}

# Build the SPA
COPY frontend/ ./
RUN npm run build


# ── Stage 2: Python runtime ────────────────────────────────────────────────────
FROM python:3.11-slim-bookworm

LABEL org.opencontainers.image.title="Hitokage Kiln Controller"
LABEL org.opencontainers.image.description="FastAPI kiln controller with React SPA"

WORKDIR /app

# Build-time switch: set to "1" for Pi hardware builds to install libgpiod2.
# Simulation builds skip it to keep the image smaller.
ARG INSTALL_GPIO_LIBS=0

# gcc + python3-dev are needed to compile some Python C extensions (e.g. gevent).
# libgpiod2 is the userspace GPIO library required on Raspberry Pi kernels.
RUN apt-get update && apt-get install -y --no-install-recommends \
        gcc \
        python3-dev \
    && if [ "$INSTALL_GPIO_LIBS" = "1" ]; then \
          apt-get install -y --no-install-recommends libgpiod2; \
       fi \
    && rm -rf /var/lib/apt/lists/*

# ---------------------------------------------------------------------------
# ARG REQUIREMENTS controls which pip requirements file is installed:
#
#   requirements.txt      (default) — Pi production build, includes RPi.GPIO.
#                          Build on the Pi itself with:
#                            docker build .
#                          or cross-compile with buildx:
#                            docker buildx build --platform linux/arm64 .
#
#   requirements-dev.txt  — Simulation / x86 Mac build (no RPi.GPIO).
#                          docker build --build-arg REQUIREMENTS=requirements-dev.txt .
# ---------------------------------------------------------------------------
ARG REQUIREMENTS=requirements.txt
COPY requirements.txt requirements-dev.txt ./
RUN pip install --no-cache-dir -r ${REQUIREMENTS}

# Application code
COPY config.py ./
COPY lib/       ./lib/
COPY backend/   ./backend/
COPY storage/   ./storage/

# Copy built React SPA from Stage 1
COPY --from=frontend-builder /build/dist ./frontend/dist

# Profiles and state files live in a volume so they survive container updates
VOLUME ["/app/storage/profiles", "/app/state-data"]

EXPOSE 8081

# Lightweight health check (no extra tools needed — pure stdlib)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c \
        "import urllib.request; urllib.request.urlopen('http://localhost:8081/api/config')" \
        || exit 1

ENV PYTHONUNBUFFERED=1

CMD ["python", "backend/main.py"]
