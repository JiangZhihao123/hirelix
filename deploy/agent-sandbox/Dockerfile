FROM node:22.23.4-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-openpyxl python3-docx \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/hirelix-sandbox
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY helper.cjs /opt/hirelix-sandbox/helper.cjs
ENV NODE_PATH=/opt/hirelix-sandbox/node_modules HOME=/tmp LANG=C.UTF-8
WORKDIR /work
USER 1000:1000
