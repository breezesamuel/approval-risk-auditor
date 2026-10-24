FROM node:20-alpine

# Apify Actor 镜像（Node）
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

CMD ["node", "src/main.js"]
