# 電子留言板（Docker + Nginx + Tailscale + SQLite + PWA）

本專案提供一個可直接部署執行的電子留言板系統，具備：
1. 註冊
2. 登入（未登入時提醒使用者還未擁有帳號）
3. 主題切換（深/淺）
4. 權限（管理員/版主/使用者）
5. 新增/套用標籤
6. 利用留言/標籤搜尋
7. 添加圖片
8. 檢舉功能
10. 編輯留言
11. 按讚/倒讚留言
12. 回覆留言
13. 加入表情符號
14. 通知（SSE 即時通知 + 站內通知）
15. 帳號設定頁面
16. PWA（可安裝、離線快取 App Shell）

技術架構：
- 前端：原生 HTML/CSS/JS，透過 Nginx 提供靜態檔案
- 後端：Node.js + Express（REST API + SSE），SQLite 持久化
- 反向代理：Nginx，/api 與 /uploads 轉發至 backend
- 部署：docker compose（bridge 預設）
- Tailscale：可選；透過 TS_AUTHKEY 加入 tailnet 後，可在私網或跨網段存取

## 目錄結構

- docker-compose.yml
- .env.example（請複製為 .env 並填入）
- nginx/
  - nginx.conf
- backend/
  - Dockerfile
  - package.json
  - src/
    - index.js
    - db.js
    - auth.js
    - schema.sql
    - routes/
      - auth.js
      - messages.js
      - tags.js
      - uploads.js
      - notifications.js
      - users.js
    - utils/
      - notify.js
  - uploads/（持久化上傳目錄）
- frontend/
  - public/
    - index.html
    - styles.css
    - app.js
    - manifest.webmanifest
    - sw.js
    - icons/
      - icon-192.png（範例占位圖）
      - icon-512.png（範例占位圖）

## 快速開始

1) 準備環境變數
- 複製 .env.example 為 .env
- 重要：請修改 JWT_SECRET 與預設管理員密碼 ADMIN_PASSWORD
- 若要啟用 Tailscale，請在 .env 內填入 TS_AUTHKEY（或於環境變數提供）

2) 啟動
```bash
docker compose up -d
```

3) 存取服務
- 瀏覽器開啟：http://localhost:8080
- 預設管理員帳號：
  - 帳號：admin
  - 密碼：你在 .env 設定的 ADMIN_PASSWORD

4) 升權與角色
- 預設會自動建立一個 admin 角色
- 管理員可在「帳號設定」頁面將使用者升為版主（moderator）

5) 影像上傳
- 檔案會儲存在 backend/uploads（已持久化為 volume）

6) PWA
- 進入網站後可從瀏覽器「安裝應用程式」
- 可離線瀏覽已快取的 App Shell 與最近資料（基礎快取策略）

7) Tailscale（可選）
- 需提供 TS_AUTHKEY（預設 ephemeral key）
- 啟動後，Nginx 與 backend 可透過 tailnet 被其他節點存取
- 你也可以只用 LAN 存取（已在 bridge 模式且對外暴露 8080）

## 常見操作

- 停止
```bash
docker compose down
```

- 重新啟動
```bash
docker compose restart
```

- 查看 Logs
```bash
docker compose logs -f backend
docker compose logs -f nginx
docker compose logs -f tailscale
```

## 安全建議
- 務必更改 JWT_SECRET 與 ADMIN_PASSWORD
- 若公開到網際網路，請配置 HTTPS（可在 Nginx 加入 TLS 或放在反代/Load Balancer 後）
- 可新增 rate limit、CSP、CSRF 防護（目前簡化以 SameSite Lax Cookie）

## 功能對照
- 註冊/登入：POST /api/auth/*
- 權限：admin/moderator/user，透過 JWT 校驗
- 主題切換：前端 LocalStorage + CSS 變數
- 標籤：CRUD + 套用到留言
- 搜尋：文字關鍵字 + 標籤
- 圖片：multipart/form-data 上傳
- 檢舉：使用者可檢舉留言，管理員/版主處理
- 編輯留言：作者可編輯，管理員/版主可管理
- 讚/倒讚：同一使用者對同一留言只有一個狀態（+1/-1/取消）
- 回覆：樹狀結構（parent_id）
- 表情符號：原生 emoji 選單
- 通知：SSE 即時顯示（例如有人回覆/標記/按讚），另提供未讀列表
- 帳號設定：更新顯示名稱、密碼、主題偏好
- PWA：manifest + service worker

## 預設連接埠
- Host 8080 -> Nginx（對外）
- Nginx -> Backend:3000（內部）

## 備註
- 本專案以簡潔可運行為目標，並未涵蓋所有生產等級強化（如：更嚴格的資料驗證、XSS 清理、CSRF Token、影像掃描、分片上傳、ACL 細緻化等）。請視需要強化。# MessageBoard
