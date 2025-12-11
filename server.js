const express = require('express');
const axios = require('axios');
const cron = require('node-cron');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { HttpsProxyAgent } = require('https-proxy-agent');
const net = require('net');
const http = require('http');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Store proxies in memory
let proxyPool = [];
let isUpdating = false;
let systemLogs = []; // 系统日志

function addLog(type, message) {
    const log = `[${new Date().toISOString()}] [${type}] ${message}`;
    console.log(log);
    systemLogs.unshift(log);
    if (systemLogs.length > 100) systemLogs.pop();
}

app.use(express.static(path.join(process.cwd(), 'public')));
app.use(express.json());

// 显式处理根路径，确保能够返回 index.html
app.get('/', (req, res) => {
    // ... (保持原有的路径处理逻辑)
    const indexPaths = [
        path.join(process.cwd(), 'public', 'index.html'),
        path.join(__dirname, 'public', 'index.html'),
        path.join(process.cwd(), 'index.html')
    ];
    
    for (const p of indexPaths) {
        // ...
    }
    res.sendFile(path.join(process.cwd(), 'public', 'index.html'), (err) => {
        if (err) {
            console.error('Error sending index.html:', err);
            res.status(500).send('Error loading page. Please check /api/debug for details.');
        }
    });
});

// 调试路由
app.get('/api/debug', (req, res) => {
    // ... (保持原有逻辑)
    const fs = require('fs');
    const debugInfo = {
        cwd: process.cwd(),
        dirname: __dirname,
        filesInCwd: [],
        filesInPublic: [],
        env: process.env
    };
    
    try {
        debugInfo.filesInCwd = fs.readdirSync(process.cwd());
    } catch (e) {
        debugInfo.filesInCwd = e.message;
    }
    
    try {
        const publicPath = path.join(process.cwd(), 'public');
        debugInfo.filesInPublic = fs.existsSync(publicPath) ? fs.readdirSync(publicPath) : 'public directory not found';
    } catch (e) {
        debugInfo.filesInPublic = e.message;
    }
    
    res.json(debugInfo);
});

// 查看系统日志
app.get('/api/logs', (req, res) => {
    res.json(systemLogs);
});

// 测试代理源
app.get('/api/test-source', async (req, res) => {
    const { source } = req.query;
    if (!source || !PROXY_SOURCES[source]) {
        return res.status(400).json({ error: 'Invalid source key', available: Object.keys(PROXY_SOURCES) });
    }

    const srcConfig = PROXY_SOURCES[source];
    try {
        let rawData = null;
        let parsedCount = 0;
        
        if (srcConfig.type === 'json') {
            const response = await axios.get(srcConfig.url, { 
                timeout: 10000,
                headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
            });
            rawData = response.data;
            if (response.data && Array.isArray(response.data.data)) {
                parsedCount = response.data.data.length;
            }
        } else if (srcConfig.type === 'text') {
            const item = srcConfig.urls[0]; // 只测试第一个 URL
            const response = await axios.get(item.url, { 
                timeout: 10000,
                headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
            });
            rawData = response.data.substring(0, 500) + '... (truncated)';
            const parsed = parseTextProxies(response.data, item.protocol);
            parsedCount = parsed.length;
        }

        res.json({
            source: srcConfig.name,
            status: 'success',
            parsedCount,
            sampleRaw: rawData
        });
    } catch (err) {
        res.status(500).json({
            source: srcConfig.name,
            status: 'error',
            message: err.message
        });
    }
});

// ============================================================
// 代理源配置
// ============================================================
const PROXY_SOURCES = {
    // ... (保持 PROXY_SOURCES 内容不变)
    // 源1: CharlesPikachu/freeproxy (JSON格式，带详细信息)
    freeproxy: {
        name: 'FreeProxy',
        url: 'https://raw.githubusercontent.com/CharlesPikachu/freeproxy/master/proxies.json',
        type: 'json'
    },
    // 源2: roosterkid/openproxylist (纯文本格式，该仓库只有HTTPS/SOCKS4/SOCKS5，无HTTP)
    openproxylist: {
        name: 'OpenProxyList',
        urls: [
            { url: 'https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt', protocol: 'Https' },
            { url: 'https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS4_RAW.txt', protocol: 'Socks4' },
            { url: 'https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS5_RAW.txt', protocol: 'Socks5' }
        ],
        type: 'text'
    },
    // 源3: zebbern/Proxy-Scraper (纯文本格式)
    proxyScraper: {
        name: 'ProxyScraper',
        urls: [
            { url: 'https://raw.githubusercontent.com/zebbern/Proxy-Scraper/main/http.txt', protocol: 'Http' },
            { url: 'https://raw.githubusercontent.com/zebbern/Proxy-Scraper/main/socks4.txt', protocol: 'Socks4' },
            { url: 'https://raw.githubusercontent.com/zebbern/Proxy-Scraper/main/socks5.txt', protocol: 'Socks5' }
        ],
        type: 'text'
    }
};

// ============================================================
// 解析纯文本格式的代理列表 (IP:Port)
// ============================================================
function parseTextProxies(text, protocol) {
    const lines = text.split('\n').filter(line => line.trim());
    return lines.map(line => {
        const parts = line.trim().split(':');
        if (parts.length >= 2) {
            return {
                ip: parts[0],
                port: parseInt(parts[1], 10),
                protocol: protocol,
                country: 'Unknown',
                anonymity: 'Unknown',
                speed: 0,
                source: 'text'
            };
        }
        return null;
    }).filter(p => p !== null && !isNaN(p.port));
}

// ============================================================
// 从单个源获取代理
// ============================================================
async function fetchFromSource(sourceKey) {
    const source = PROXY_SOURCES[sourceKey];
    const proxies = [];
    
    try {
        addLog('INFO', `[${source.name}] 开始获取代理...`);
        const axiosConfig = {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        };
        
        if (source.type === 'json') {
            // JSON格式源 (FreeProxy)
            const response = await axios.get(source.url, axiosConfig);
            if (response.data && Array.isArray(response.data.data)) {
                proxies.push(...response.data.data.map(p => ({ ...p, source: source.name })));
            }
        } else if (source.type === 'text') {
            // 文本格式源 (多个URL)
            for (const item of source.urls) {
                try {
                    const response = await axios.get(item.url, axiosConfig);
                    const parsed = parseTextProxies(response.data, item.protocol);
                    parsed.forEach(p => p.source = source.name);
                    proxies.push(...parsed);
                } catch (err) {
                    addLog('ERROR', `[${source.name}] 获取 ${item.protocol} 失败: ${err.message}`);
                }
            }
        }
        
        addLog('INFO', `[${source.name}] 获取到 ${proxies.length} 个代理`);
    } catch (error) {
        addLog('ERROR', `[${source.name}] 获取失败: ${error.message}`);
    }
    
    return proxies;
}

// ... (fetchProxies 保持不变，但其中日志调用已通过 addLog 替换)

async function fetchProxies() {
    addLog('INFO', '开始从所有代理源获取数据...');
    
    const allProxies = [];
    
    // 并行获取所有源
    const results = await Promise.all(
        Object.keys(PROXY_SOURCES).map(key => fetchFromSource(key))
    );
    
    results.forEach(proxies => allProxies.push(...proxies));
    
    addLog('INFO', `总计获取到 ${allProxies.length} 个代理`);
    return allProxies;
}

// ============================================================
// 优质代理筛选配置
// ============================================================
const QUALITY_CONFIG = {
    maxLatency: 5000,        // 最大延迟阈值(ms) - 放宽
    fastLatency: 800,        // 快速代理阈值(ms) - 放宽
    goodLatency: 1500,       // 良好代理阈值(ms) - 放宽
    timeout: 5000,           // 检测超时时间(ms) - 大幅增加以适应 Railway 网络
    batchSize: 50,           // 并发批次大小 - 降低并发避免拥塞
    batchDelay: 200          // 批次间延迟(ms) - 增加间隔
};

// ============================================================
// 检测代理是否存活 (优化速度版)
// ============================================================
async function checkProxy(proxy) {
    const host = proxy.ip;
    const port = proxy.port;

    const tcpStart = Date.now();
    try {
        await new Promise((resolve, reject) => {
            const socket = new net.Socket();
            socket.setTimeout(QUALITY_CONFIG.timeout);
            socket.connect(port, host, () => {
                socket.destroy();
                resolve();
            });
            socket.on('error', (err) => reject(err));
            socket.on('timeout', () => {
                socket.destroy();
                reject(new Error('Timeout'));
            });
        });
        
        const latency = Date.now() - tcpStart;
        
        // 只保留延迟在阈值内的优质代理
        if (latency > QUALITY_CONFIG.maxLatency) {
            return { ...proxy, alive: false, error: 'Too slow', last_checked: new Date() };
        }
        
        // 计算质量评分 (0-100)
        let quality = 100;
        if (latency > QUALITY_CONFIG.fastLatency) {
            quality = Math.max(0, 100 - Math.floor((latency - QUALITY_CONFIG.fastLatency) / 25));
        }
        
        return { 
            ...proxy, 
            alive: true, 
            latency, 
            quality,
            speed: latency < QUALITY_CONFIG.fastLatency ? 'fast' : 
                   latency < QUALITY_CONFIG.goodLatency ? 'good' : 'slow',
            last_checked: new Date() 
        };
    } catch (e) {
        return { ...proxy, alive: false, error: e.message, last_checked: new Date() };
    }
}

// ... (updatePool 保持不变，但日志调用替换)

async function updatePool() {
    if (isUpdating) return;
    isUpdating = true;
    updateProgress = { current: 0, total: 0, phase: 'fetching' };
    addLog('INFO', '开始更新代理池...');

    const rawProxies = await fetchProxies();
    
    // 去重
    updateProgress.phase = 'deduplicating';
    const uniqueProxies = new Map();
    rawProxies.forEach(p => {
        const key = `${p.ip}:${p.port}`;
        if (!uniqueProxies.has(key)) {
            uniqueProxies.set(key, p);
        }
    });

    const proxiesArray = Array.from(uniqueProxies.values());
    updateProgress.total = proxiesArray.length;
    addLog('INFO', `去重后: ${proxiesArray.length} 个唯一代理，开始存活检测...`);

    // 使用优化的批次大小进行并发检测
    updateProgress.phase = 'checking';
    const checkedProxies = [];
    const { batchSize, batchDelay } = QUALITY_CONFIG;

    for (let i = 0; i < proxiesArray.length; i += batchSize) {
        const batch = proxiesArray.slice(i, i + batchSize);
        const results = await Promise.all(batch.map(p => checkProxy(p)));
        checkedProxies.push(...results.filter(p => p.alive));
        updateProgress.current = Math.min(i + batchSize, proxiesArray.length);
        
        // 进度日志
        if ((i / batchSize) % 10 === 0) {
            console.log(`检测进度: ${updateProgress.current}/${updateProgress.total} (${Math.round(updateProgress.current/updateProgress.total*100)}%)`);
        }
        
        await new Promise(r => setTimeout(r, batchDelay));
    }

    // 按质量评分排序（质量高的在前，延迟低的优先）
    checkedProxies.sort((a, b) => {
        if (b.quality !== a.quality) return b.quality - a.quality;
        return a.latency - b.latency;
    });
    
    proxyPool = checkedProxies;
    updateProgress.phase = 'done';
    
    // 统计信息
    const fastCount = proxyPool.filter(p => p.speed === 'fast').length;
    const goodCount = proxyPool.filter(p => p.speed === 'good').length;
    const slowCount = proxyPool.filter(p => p.speed === 'slow').length;
    
    addLog('INFO', `代理池更新完成！共 ${proxyPool.length} 个活跃代理`);
    addLog('INFO', `  - 快速: ${fastCount} 个, 良好: ${goodCount} 个, 较慢: ${slowCount} 个`);
    
    isUpdating = false;
}

// Initial update
updatePool();

// Schedule update every 1 hour (适配 Cloudflare 部署)
cron.schedule('0 * * * *', () => {
    updatePool();
});

// API Endpoints
app.get('/api/proxies', (req, res) => {
    const { country, protocol, anonymity } = req.query;
    let filtered = proxyPool;

    if (country) {
        filtered = filtered.filter(p => p.country === country);
    }
    if (protocol) {
        filtered = filtered.filter(p => p.protocol.toLowerCase().includes(protocol.toLowerCase()));
    }
    if (anonymity) {
        filtered = filtered.filter(p => p.anonymity.toLowerCase() === anonymity.toLowerCase());
    }

    res.json({
        total: filtered.length,
        updating: isUpdating,
        data: filtered
    });
});

app.post('/api/refresh', (req, res) => {
    if (isUpdating) {
        return res.status(409).json({ message: 'Update already in progress' });
    }
    updatePool(); // Start in background
    res.json({ message: 'Update started' });
});

app.get('/api/stats', (req, res) => {
    const countries = [...new Set(proxyPool.map(p => p.country))];
    const protocols = [...new Set(proxyPool.flatMap(p => p.protocol.split(', ').map(s => s.trim())))];
    const fastCount = proxyPool.filter(p => p.speed === 'fast').length;
    const goodCount = proxyPool.filter(p => p.speed === 'good').length;
    const slowCount = proxyPool.filter(p => p.speed === 'slow').length;
    
    res.json({
        total: proxyPool.length,
        countries,
        protocols,
        updating: isUpdating,
        progress: updateProgress,
        quality: { fast: fastCount, good: goodCount, slow: slowCount }
    });
});

// ============================================================
// TXT格式导出API
// ============================================================
app.get('/api/export', (req, res) => {
    const { country, protocol, anonymity, speed, limit, format } = req.query;
    let filtered = [...proxyPool];

    // 筛选条件
    if (country) {
        filtered = filtered.filter(p => p.country === country);
    }
    if (protocol) {
        filtered = filtered.filter(p => p.protocol.toLowerCase().includes(protocol.toLowerCase()));
    }
    if (anonymity) {
        filtered = filtered.filter(p => p.anonymity.toLowerCase() === anonymity.toLowerCase());
    }
    if (speed) {
        filtered = filtered.filter(p => p.speed === speed);
    }
    
    // 限制数量
    const maxLimit = Math.min(parseInt(limit) || 100, 1000);
    filtered = filtered.slice(0, maxLimit);
    
    // 根据格式返回
    const outputFormat = format || 'txt';
    
    if (outputFormat === 'json') {
        res.json({
            count: filtered.length,
            data: filtered.map(p => ({
                ip: p.ip,
                port: p.port,
                protocol: p.protocol,
                country: p.country,
                latency: p.latency,
                quality: p.quality
            }))
        });
    } else {
        // TXT格式: ip:port
        const txtContent = filtered.map(p => `${p.ip}:${p.port}`).join('\n');
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="proxies_${Date.now()}.txt"`);
        res.send(txtContent);
    }
});

// ============================================================
// 获取随机代理API
// ============================================================
app.get('/api/random', (req, res) => {
    const { protocol, speed, count } = req.query;
    let filtered = [...proxyPool];
    
    if (protocol) {
        filtered = filtered.filter(p => p.protocol.toLowerCase().includes(protocol.toLowerCase()));
    }
    if (speed) {
        filtered = filtered.filter(p => p.speed === speed);
    }
    
    const num = Math.min(parseInt(count) || 1, 50);
    const shuffled = filtered.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, num);
    
    if (num === 1 && selected.length > 0) {
        res.json(selected[0]);
    } else {
        res.json({ count: selected.length, data: selected });
    }
});

// 导出 app 供 Vercel 使用
module.exports = app;

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
        console.log('============================================================');
        console.log('API 接口说明:');
        console.log('  GET /api/proxies     - 获取代理列表 (JSON)');
        console.log('  GET /api/stats       - 获取统计信息');
        console.log('  GET /api/export      - 导出代理 (支持TXT/JSON)');
        console.log('  GET /api/random      - 获取随机代理');
        console.log('  POST /api/refresh    - 手动刷新代理池');
        console.log('============================================================');
    });
}
