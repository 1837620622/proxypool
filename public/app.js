document.addEventListener('DOMContentLoaded', () => {
    // ============================================================
    // 国际化语言包
    // ============================================================
    const i18n = {
        en: {
            title: 'Proxy Pool',
            subtitle: 'High Quality Free Proxies',
            totalProxies: 'Total Proxies',
            fastProxies: 'Fast Proxies',
            lastUpdated: 'Last Updated',
            status: 'Status',
            ready: 'Ready',
            updating: 'Updating...',
            refreshPool: 'Refresh',
            country: 'Country',
            protocol: 'Protocol',
            speed: 'Speed',
            search: 'Search',
            allCountries: 'All Countries',
            allProtocols: 'All Protocols',
            allSpeeds: 'All Speeds',
            fast: 'Fast (<500ms)',
            good: 'Good (<1000ms)',
            slow: 'Slow',
            searchIP: 'Search IP...',
            ipAddress: 'IP Address',
            port: 'Port',
            quality: 'Quality',
            latency: 'Latency',
            action: 'Action',
            results: 'results',
            loadingProxies: 'Loading proxies...',
            noResults: 'No proxies found matching your criteria',
            copied: 'Copied to clipboard!',
            exportTitle: 'Export Proxies',
            exportCount: 'Count:',
            copyAll: 'Copy All'
        },
        zh: {
            title: '代理池',
            subtitle: '高质量免费代理',
            totalProxies: '代理总数',
            fastProxies: '快速代理',
            lastUpdated: '上次更新',
            status: '状态',
            ready: '就绪',
            updating: '更新中...',
            refreshPool: '刷新',
            country: '国家',
            protocol: '协议',
            speed: '速度',
            search: '搜索',
            allCountries: '所有国家',
            allProtocols: '所有协议',
            allSpeeds: '所有速度',
            fast: '快速 (<500ms)',
            good: '良好 (<1000ms)',
            slow: '较慢',
            searchIP: '搜索 IP...',
            ipAddress: 'IP 地址',
            port: '端口',
            quality: '质量',
            latency: '延迟',
            action: '操作',
            results: '条结果',
            loadingProxies: '加载代理中...',
            noResults: '未找到符合条件的代理',
            copied: '已复制到剪贴板！',
            exportTitle: '导出代理',
            exportCount: '数量:',
            copyAll: '复制全部'
        }
    };

    // 当前语言 (默认中文)
    let currentLang = localStorage.getItem('proxypool_lang') || 'zh';

    // ============================================================
    // 状态
    // ============================================================
    let proxies = [];
    let filteredProxies = [];
    let isUpdating = false;
    let currentPage = 1;
    const pageSize = 50;

    // ============================================================
    // 元素引用
    // ============================================================
    const proxyList = document.getElementById('proxy-list');
    const totalCount = document.getElementById('total-count');
    const fastCount = document.getElementById('fast-count');
    const lastUpdated = document.getElementById('last-updated');
    const statusIndicator = document.getElementById('status-indicator');
    const statusIcon = document.getElementById('status-icon');
    const refreshBtn = document.getElementById('refresh-btn');
    const countryFilter = document.getElementById('country-filter');
    const protocolFilter = document.getElementById('protocol-filter');
    const speedFilter = document.getElementById('speed-filter');
    const searchInput = document.getElementById('search-input');
    const noResults = document.getElementById('no-results');
    const toast = document.getElementById('toast');
    const filteredCount = document.getElementById('filtered-count');
    const currentPageEl = document.getElementById('current-page');
    const totalPagesEl = document.getElementById('total-pages');
    const prevPageBtn = document.getElementById('prev-page');
    const nextPageBtn = document.getElementById('next-page');
    const exportLimit = document.getElementById('export-limit');
    const exportTxtBtn = document.getElementById('export-txt');
    const exportJsonBtn = document.getElementById('export-json');
    const copyAllBtn = document.getElementById('copy-all');
    const progressModal = document.getElementById('progress-modal');
    const progressText = document.getElementById('progress-text');
    const progressBarFill = document.getElementById('progress-bar-fill');

    // ============================================================
    // 初始化
    // ============================================================
    fetchData();
    // 动态调整轮询间隔，初始为5s
    let pollInterval = 5000;
    let pollTimer = setTimeout(pollData, pollInterval);

    function pollData() {
        fetchData().finally(() => {
            pollTimer = setTimeout(pollData, pollInterval);
        });
    }

    setLanguage(currentLang);

    // ============================================================
    // 事件监听
    // ============================================================
    refreshBtn.addEventListener('click', triggerRefresh);
    countryFilter.addEventListener('change', applyFilters);
    protocolFilter.addEventListener('change', applyFilters);
    speedFilter.addEventListener('change', applyFilters);
    searchInput.addEventListener('input', applyFilters);
    prevPageBtn.addEventListener('click', () => changePage(-1));
    nextPageBtn.addEventListener('click', () => changePage(1));
    
    document.getElementById('lang-en').addEventListener('click', () => setLanguage('en'));
    document.getElementById('lang-zh').addEventListener('click', () => setLanguage('zh'));

    // 导出功能
    exportTxtBtn.addEventListener('click', () => exportProxies('txt'));
    exportJsonBtn.addEventListener('click', () => exportProxies('json'));
    copyAllBtn.addEventListener('click', copyAllProxies);

    // ============================================================
    // 语言切换
    // ============================================================
    function setLanguage(lang) {
        currentLang = lang;
        localStorage.setItem('proxypool_lang', lang);
        
        document.getElementById('lang-en').classList.toggle('active', lang === 'en');
        document.getElementById('lang-zh').classList.toggle('active', lang === 'zh');
        
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (i18n[lang][key]) {
                el.textContent = i18n[lang][key];
            }
        });
        
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (i18n[lang][key]) {
                el.placeholder = i18n[lang][key];
            }
        });
    }

    // ============================================================
    // 数据获取
    // ============================================================
    async function fetchData() {
        try {
            const res = await fetch('/api/stats');
            const stats = await res.json();
            
            updateStats(stats);
            
            if (proxies.length === 0 || stats.total !== proxies.length) {
                const listRes = await fetch('/api/proxies');
                const listData = await listRes.json();
                proxies = listData.data || [];
                populateFilters(stats.countries);
                applyFilters();
            }
        } catch (err) {
            console.error('Failed to fetch data', err);
        }
    }

    async function triggerRefresh() {
        if (isUpdating) return;
        try {
            await fetch('/api/refresh', { method: 'POST' });
        } catch (err) {
            console.error('Failed to refresh', err);
        }
    }

    // ============================================================
    // 统计更新
    // ============================================================
    function updateStats(stats) {
        totalCount.textContent = stats.total || 0;
        fastCount.textContent = stats.quality?.fast || 0;
        isUpdating = stats.updating;
        
        if (isUpdating) {
            statusIndicator.textContent = i18n[currentLang].updating;
            statusIcon.style.background = 'linear-gradient(135deg, #eab308, #ca8a04)';
            document.getElementById('status-icon-i').className = 'ri-loader-4-line';
            refreshBtn.disabled = true;
        } else {
            statusIndicator.textContent = i18n[currentLang].ready;
            statusIcon.style.background = 'linear-gradient(135deg, #22c55e, #16a34a)';
            document.getElementById('status-icon-i').className = 'ri-checkbox-circle-line';
            refreshBtn.disabled = false;
            lastUpdated.textContent = new Date().toLocaleTimeString();
        }
    }

    // ============================================================
    // 筛选器
    // ============================================================
    function populateFilters(countries) {
        const current = countryFilter.value;
        while (countryFilter.options.length > 1) {
            countryFilter.remove(1);
        }
        
        if (countries && countries.length) {
            countries.sort().forEach(code => {
                const option = document.createElement('option');
                option.value = code;
                option.textContent = code;
                countryFilter.appendChild(option);
            });
        }

        if (countries && countries.includes(current)) {
            countryFilter.value = current;
        }
    }

    function applyFilters() {
        const country = countryFilter.value;
        const protocol = protocolFilter.value;
        const speed = speedFilter.value;
        const search = searchInput.value.toLowerCase();

        filteredProxies = proxies.filter(p => {
            const matchCountry = !country || p.country === country;
            const matchProto = !protocol || (p.protocol && p.protocol.toLowerCase().includes(protocol));
            const matchSpeed = !speed || p.speed === speed;
            const matchSearch = !search || p.ip.includes(search);
            return matchCountry && matchProto && matchSpeed && matchSearch;
        });

        currentPage = 1;
        renderTable();
        updateApiUrl();
    }

    // ============================================================
    // 表格渲染
    // ============================================================
    function renderTable() {
        proxyList.innerHTML = '';
        filteredCount.textContent = filteredProxies.length;
        
        const totalPages = Math.ceil(filteredProxies.length / pageSize) || 1;
        currentPageEl.textContent = currentPage;
        totalPagesEl.textContent = totalPages;
        
        prevPageBtn.disabled = currentPage <= 1;
        nextPageBtn.disabled = currentPage >= totalPages;

        if (filteredProxies.length === 0) {
            noResults.classList.remove('hidden');
            return;
        } else {
            noResults.classList.add('hidden');
        }

        const start = (currentPage - 1) * pageSize;
        const end = start + pageSize;
        const pageData = filteredProxies.slice(start, end);

        pageData.forEach(p => {
            const tr = document.createElement('tr');
            
            const protos = (p.protocol || 'Unknown').split(', ').map(pr => 
                `<span class="tag tag-proto">${pr}</span>`
            ).join('');

            const speedClass = p.speed === 'fast' ? 'quality-fast' : 
                               p.speed === 'good' ? 'quality-good' : 'quality-slow';
            const speedLabel = p.speed === 'fast' ? 'FAST' : 
                               p.speed === 'good' ? 'GOOD' : 'SLOW';
            const speedIcon = p.speed === 'fast' ? 'ri-flashlight-fill' : 
                              p.speed === 'good' ? 'ri-speed-line' : 'ri-hourglass-line';

            const latencyClass = p.latency < 500 ? 'latency-fast' : 
                                 p.latency < 1000 ? 'latency-good' : 'latency-slow';
            const latencyWidth = Math.min(100, Math.max(10, 100 - p.latency / 30));

            tr.innerHTML = `
                <td>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span style="font-family: monospace;">${p.ip}</span>
                        <button class="btn-icon" onclick="copyToClipboard('${p.ip}:${p.port}')">
                            <i class="ri-file-copy-line"></i>
                        </button>
                    </div>
                </td>
                <td style="font-family: monospace; color: var(--accent);">${p.port}</td>
                <td>${protos}</td>
                <td><span class="tag tag-country">${p.country || 'Unknown'}</span></td>
                <td>
                    <span class="quality-badge ${speedClass}">
                        <i class="${speedIcon}"></i> ${speedLabel}
                    </span>
                </td>
                <td>
                    <div class="latency">
                        <div class="latency-bar">
                            <div class="latency-fill ${latencyClass}" style="width: ${latencyWidth}%"></div>
                        </div>
                        <span>${p.latency}ms</span>
                    </div>
                </td>
                <td>
                    <button class="btn-icon" title="Copy curl command" onclick="copyToClipboard('curl -x ${p.ip}:${p.port} http://httpbin.org/ip')">
                        <i class="ri-terminal-line"></i>
                    </button>
                </td>
            `;
            proxyList.appendChild(tr);
        });
    }

    function changePage(delta) {
        const totalPages = Math.ceil(filteredProxies.length / pageSize);
        currentPage = Math.max(1, Math.min(totalPages, currentPage + delta));
        renderTable();
    }

    // ============================================================
    // 导出功能
    // ============================================================
    function updateApiUrl() {
        const protocol = protocolFilter.value;
        const speed = speedFilter.value;
        const limit = exportLimit.value;
        
        let url = '/api/export?';
        const params = [];
        if (protocol) params.push(`protocol=${protocol}`);
        if (speed) params.push(`speed=${speed}`);
        params.push(`limit=${limit}`);
        
        document.getElementById('api-url').textContent = url + params.join('&');
    }

    function exportProxies(format) {
        const protocol = protocolFilter.value;
        const speed = speedFilter.value;
        const limit = exportLimit.value;
        const country = countryFilter.value;
        
        let url = `/api/export?format=${format}&limit=${limit}`;
        if (protocol) url += `&protocol=${protocol}`;
        if (speed) url += `&speed=${speed}`;
        if (country) url += `&country=${country}`;
        
        window.open(url, '_blank');
    }

    function copyAllProxies() {
        const limit = parseInt(exportLimit.value);
        const proxyText = filteredProxies.slice(0, limit)
            .map(p => `${p.ip}:${p.port}`)
            .join('\n');
        
        navigator.clipboard.writeText(proxyText).then(() => {
            showToast();
        });
    }

    // ============================================================
    // 工具函数
    // ============================================================
    window.copyToClipboard = (text) => {
        navigator.clipboard.writeText(text).then(() => {
            showToast();
        });
    };

    function showToast() {
        toast.classList.remove('hidden');
        setTimeout(() => {
            toast.classList.add('hidden');
        }, 2000);
    }

    // 初始化API URL
    updateApiUrl();
    exportLimit.addEventListener('change', updateApiUrl);
});
