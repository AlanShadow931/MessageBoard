FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

# 只先複製 package.json（與可選的 package-lock.json*，若沒有也不會出錯）
COPY package.json package-lock.json* ./

# 若沒有 lock 檔，npm ci 會失敗；改用 npm install
RUN npm install --omit=dev

# 再複製原始碼
COPY src ./src

# 建立資料與上傳目錄
RUN mkdir -p /app/data /app/uploads

EXPOSE 3000
CMD ["node", "src/index.js"]