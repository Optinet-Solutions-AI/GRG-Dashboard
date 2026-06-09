# Playwright's official image ships Chromium + all OS deps for this exact version,
# so we skip re-downloading the browser at npm install time.
FROM mcr.microsoft.com/playwright:v1.60.0-jammy

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY capture.mjs ./
CMD ["node", "capture.mjs"]
