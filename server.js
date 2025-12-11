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

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// 显式处理根路径，确保能够返回 index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================
// 代理源配置
// ============================================================
const PROXY_SOURCES = {
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
        console.log(`[${source.name}] 开始获取代理...`);
        
        if (source.type === 'json') {
            // JSON格式源 (FreeProxy)
            const response = await axios.get(source.url, { timeout: 15000 });
            if (response.data && Array.isArray(response.data.data)) {
                proxies.push(...response.data.data.map(p => ({ ...p, source: source.name })));
            }
        } else if (source.type === 'text') {
            // 文本格式源 (多个URL)
            for (const item of source.urls) {
                try {
                    const response = await axios.get(item.url, { timeout: 15000 });
                    const parsed = parseTextProxies(response.data, item.protocol);
                    parsed.forEach(p => p.source = source.name);
                    proxies.push(...parsed);
                } catch (err) {
                    console.error(`[${source.name}] 获取 ${item.protocol} 失败: ${err.message}`);
                }
            }
        }
        
        console.log(`[${source.name}] 获取到 ${proxies.length} 个代理`);
    } catch (error) {
        console.error(`[${source.name}] 获取失败: ${error.message}`);
    }
    
    return proxies;
}

// ============================================================
// 从所有源获取代理
// ============================================================
async function fetchProxies() {
    console.log('============================================================');
    console.log('开始从所有代理源获取数据...');
    console.log('============================================================');
    
    const allProxies = [];
    
    // 并行获取所有源
    const results = await Promise.all(
        Object.keys(PROXY_SOURCES).map(key => fetchFromSource(key))
    );
    
    results.forEach(proxies => allProxies.push(...proxies));
    
    console.log(`总计获取到 ${allProxies.length} 个代理`);
    return allProxies;
}

// ============================================================
// 优质代理筛选配置
// ============================================================
const QUALITY_CONFIG = {
    maxLatency: 3000,        // 最大延迟阈值(ms)
    fastLatency: 500,        // 快速代理阈值(ms)
    goodLatency: 1000,       // 良好代理阈值(ms)
    timeout: 1500,           // 检测超时时间(ms) - 加快检测速度
    batchSize: 200,          // 并发批次大小 - 增大并发
    batchDelay: 50           // 批次间延迟(ms) - 减少延迟
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

// ============================================================
// 更新代理池 (优化版本)
// ============================================================
let updateProgress = { current: 0, total: 0, phase: 'idle' };

async function updatePool() {
    if (isUpdating) return;
    isUpdating = true;
    updateProgress = { current: 0, total: 0, phase: 'fetching' };
    console.log('============================================================');
    console.log('开始更新代理池...');
    console.log('============================================================');

    const rawProxies = await fetchProxies();
    console.log(`获取到 ${rawProxies.length} 个代理`);

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
    console.log(`去重后: ${proxiesArray.length} 个唯一代理，开始存活检测...`);

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
    
    console.log('============================================================');
    console.log(`代理池更新完成！共 ${proxyPool.length} 个活跃代理`);
    console.log(`  - 快速 (${QUALITY_CONFIG.fastLatency}ms以下): ${fastCount} 个`);
    console.log(`  - 良好 (${QUALITY_CONFIG.goodLatency}ms以下): ${goodCount} 个`);
    console.log(`  - 较慢: ${slowCount} 个`);
    console.log('============================================================');
    
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
