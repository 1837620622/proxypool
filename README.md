<p align="center">
  <img src="https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="License">
  <img src="https://img.shields.io/badge/Proxies-45000+-brightgreen?style=for-the-badge" alt="Proxies">
  <img src="https://img.shields.io/badge/Deploy-Railway-0B0D0E?style=for-the-badge&logo=railway&logoColor=white" alt="Railway">
  <img src="https://img.shields.io/badge/Deploy-Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Vercel">
</p>

<h1 align="center">🌐 Proxy Pool</h1>

<p align="center">
  <b>高质量免费代理池 | High Quality Free Proxy Pool</b>
</p>

<p align="center">
  自动采集、去重、检测存活、质量评分的代理池系统<br>
  支持 HTTP / HTTPS / SOCKS4 / SOCKS5 多协议<br>
  提供美观的 Web 界面和 RESTful API
</p>

---

## ✨ 功能特性

| 功能 | 描述 |
|------|------|
| 🔄 **多源采集** | 自动从多个 GitHub 开源代理源采集代理 |
| 🧹 **智能去重** | 基于 IP:Port 自动去重，避免重复 |
| ⚡ **存活检测** | TCP 连接检测，过滤无效代理 |
| 📊 **质量评分** | 根据延迟自动评估代理质量 (Fast/Good/Slow) |
| 👑 **高速匿名** | 自动分类高速匿名代理和普通代理 |
| ⏰ **自动检测** | 每 15 分钟自动检测代理存活性 |
| 🌍 **多协议支持** | HTTP、HTTPS、SOCKS4、SOCKS5 |
| 🎨 **美观界面** | 现代化暗黑风格 Web 仪表盘 |
| 🌐 **中英双语** | 支持中文/英文界面切换 |
| 📤 **一键导出** | 支持按协议导出 (HTTP/SOCKS4/SOCKS5/高速匿名) |
| 🔌 **RESTful API** | 提供完整的 API 接口，内置 API 文档页面 |

---

##  快速开始

### 本地运行

```bash
# 克隆项目
git clone https://github.com/1837620622/proxypool.git
cd proxypool

# 安装依赖
npm install

# 启动服务
npm start

# 访问 http://localhost:3000
```

### Docker 部署

```bash
# 构建镜像
docker build -t proxypool .

# 运行容器
docker run -d -p 3000:3000 --name proxypool proxypool
```

### 🚂 Railway 部署 (推荐)

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/proxypool)

1. 点击上方按钮或访问 [Railway](https://railway.app)
2. 选择 **Deploy from GitHub repo**
3. 连接此仓库 `1837620622/proxypool`
4. Railway 会自动检测并部署，无需额外配置
5. 部署完成后获取公网域名

### ▲ Vercel 部署

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/1837620622/proxypool)

1. 点击上方按钮一键部署
2. 或手动导入 GitHub 仓库
3. Framework Preset 选择 **Other**
4. 部署完成后即可访问

> ⚠️ **注意**: Vercel 免费版有执行时间限制，建议使用 Railway 部署以获得更好体验

---

## 📡 API 接口

### 获取代理列表

```
GET /api/proxies
```

| 参数 | 类型 | 描述 |
|------|------|------|
| country | string | 国家代码 (如 US, CN, DE) |
| protocol | string | 协议类型 (http, https, socks4, socks5) |
| anonymity | string | 匿名度 (elite, anonymous, transparent) |

**示例:**
```bash
curl "http://localhost:3000/api/proxies?protocol=socks5&country=US"
```

### 导出代理

```
GET /api/export
```

| 参数 | 类型 | 描述 |
|------|------|------|
| format | string | 导出格式: txt (默认) 或 json |
| protocol | string | 协议筛选 |
| speed | string | 速度筛选: fast, good, slow |
| limit | string | 导出数量，支持数字或 `all` (导出全部) |

**示例:**
```bash
# 导出100个快速HTTP代理为TXT
curl "http://localhost:3000/api/export?protocol=http&speed=fast&limit=100" -o proxies.txt

# 导出为JSON格式
curl "http://localhost:3000/api/export?format=json&limit=50"
```

### 获取随机代理

```
GET /api/random
```

| 参数 | 类型 | 描述 |
|------|------|------|
| protocol | string | 协议筛选 |
| speed | string | 速度筛选 |
| count | number | 数量 (最大50) |

**示例:**
```bash
# 获取1个随机快速SOCKS5代理
curl "http://localhost:3000/api/random?protocol=socks5&speed=fast"
```

### 获取统计信息

```
GET /api/stats
```

### 手动刷新代理池

```
POST /api/refresh
```

### 手动检测代理存活性

```
POST /api/check
```

触发后台检测所有代理的存活性，检测结果会更新代理的速度评分。

### 获取检测进度

```
GET /api/check-progress
```

返回当前检测进度：
```json
{
  "checking": true,
  "current": 1000,
  "total": 45000
}
```

### 获取高速匿名代理

```
GET /api/elite
```

| 参数 | 类型 | 描述 |
|------|------|------|
| protocol | string | 协议筛选 |
| limit | string | 导出数量，支持数字或 `all` |

**示例:**
```bash
# 获取全部高速匿名代理
curl "http://localhost:3000/api/elite?limit=all"
```

### 获取普通代理

```
GET /api/normal
```

| 参数 | 类型 | 描述 |
|------|------|------|
| protocol | string | 协议筛选 |
| limit | string | 导出数量，支持数字或 `all` |

---

## 📁 项目结构

```
proxypool/
├── public/                 # 前端静态资源
│   ├── index.html          # 主页面
│   ├── style.css           # 样式文件
│   └── app.js              # 前端逻辑
├── server.js               # 后端服务
├── package.json            # 项目配置
├── Dockerfile              # Docker 配置
├── vercel.json             # Vercel 部署配置
├── railway.json            # Railway 部署配置
├── nixpacks.toml           # Nixpacks 构建配置
├── LICENSE                 # MIT 开源协议
└── README.md               # 项目说明
```

---

## 🔧 代理源

当前已集成以下开源代理源：

| 源 | 协议 | 地址 |
|----|------|------|
| FreeProxy | HTTP/HTTPS/SOCKS4/SOCKS5 | [CharlesPikachu/freeproxy](https://github.com/CharlesPikachu/freeproxy) |
| OpenProxyList | HTTPS/SOCKS4/SOCKS5 | [roosterkid/openproxylist](https://github.com/roosterkid/openproxylist) |
| Proxy-Scraper | HTTP/SOCKS4/SOCKS5 | [zebbern/Proxy-Scraper](https://github.com/zebbern/Proxy-Scraper) |

---

## ⚙️ 配置说明

在 `server.js` 中可以调整以下配置：

```javascript
const QUALITY_CONFIG = {
    maxLatency: 5000,    // 最大延迟阈值(ms)
    fastLatency: 800,    // 快速代理阈值(ms)
    goodLatency: 1500,   // 良好代理阈值(ms)
    timeout: 2000,       // 检测超时时间(ms)
    batchSize: 500,      // 并发批次大小
    batchDelay: 10       // 批次间延迟(ms)
};
```

---

## 📊 统计数据

- 🔢 **海量代理**: 自动汇聚 45,000+ 代理
- ⚡ **快速代理**: 40,000+ 快速可用代理
- 🌍 **全球覆盖**: 100+ 国家/地区
- 🔄 **自动更新**: 每小时自动更新代理池
- 🖱️ **手动检测**: 用户可一键触发存活检测

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

## 📬 联系方式

- **微信**: 1837620622 (传康kk)
- **邮箱**: 2040168455@qq.com
- **B站/咸鱼**: 万能程序员

---

## 📄 开源协议

本项目采用 [MIT License](LICENSE) 开源协议。

---

<p align="center">
  <b>⭐ 如果这个项目对你有帮助，请给个 Star！</b>
</p>
