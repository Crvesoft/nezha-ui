const SCRIPT_VERSION = 'v20260716-stable-v3';

// == 样式注入模块 == //
function injectCustomCSS() {
    if (document.getElementById('nezha-traffic-style')) return;
    const style = document.createElement('style');
    style.id = 'nezha-traffic-style';
    style.textContent = `
        /* 隐藏原版多余的占位结构 */
        .mt-4.w-full.mx-auto > div {
            display: none !important;
        }
        /* 流量外层容器稳定器，防止闪烁与抖动 */
        .nezha-traffic-wrapper {
            width: 100% !important;
            min-height: 32px !important; /* 锁定高度，消除闪烁 */
            margin-top: 0.375rem !important;
            display: block !important;
        }
        /* 强制覆盖背景条样式，确保在亮色和暗色模式下剩余流量（背景灰色）都清晰可见 */
        .nezha-progress-bg {
            background-color: rgba(0, 0, 0, 0.08) !important;
        }
        .dark .nezha-progress-bg {
            background-color: rgba(255, 255, 255, 0.12) !important;
        }
    `;
    document.head.appendChild(style);
}
injectCustomCSS();

// == 工具函数模块 ==
const utils = (() => {
    function formatFileSize(bytes) {
        if (bytes === 0) return { value: '0', unit: 'B' };
        const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
        let size = bytes;
        let unitIndex = 0;
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        return {
            value: size.toFixed(unitIndex === 0 ? 0 : 2),
            unit: units[unitIndex]
        };
    }

    function calculatePercentage(used, total) {
        used = Number(used);
        total = Number(total);
        if (used > 1e15 || total > 1e15) {
            used /= 1e10;
            total /= 1e10;
        }
        return total === 0 ? '0.00' : ((used / total) * 100).toFixed(2);
    }

    function formatDate(dateString) {
        const date = new Date(dateString);
        if (isNaN(date)) return '';
        return date.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
    }

    function getHslGradientColor(percentage) {
        const p = Math.min(Math.max(Number(percentage), 0), 100);
        let h = 130; // 维持你喜欢的翠绿色
        return `hsl(${h}, 75%, 32%)`;
    }

    function fadeOutIn(element, newContent, duration = 300) {
        if (!element) return;
        element.style.transition = `opacity ${duration / 2}ms ease`;
        element.style.opacity = '0';
        setTimeout(() => {
            element.innerHTML = newContent;
            element.style.opacity = '1';
        }, duration / 2);
    }

    function debounce(fn, delay) {
        let timer = null;
        return function (...args) {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    return {
        formatFileSize,
        calculatePercentage,
        formatDate,
        getHslGradientColor,
        fadeOutIn,
        debounce
    };
})();

// == 流量统计渲染模块 ==
const trafficRenderer = (() => {
    let toggleElements = [];
    let serverElementMap = new Map();

    function ensureServerWrapper(containerDiv, serverData) {
        const uniqueClassName = `traffic-wrapper-${serverData.id}`;
        let wrapper = containerDiv.querySelector(`.${uniqueClassName}`);

        if (!wrapper) {
            wrapper = serverElementMap.get(serverData.id) || null;
        }

        if (!wrapper) {
            wrapper = document.createElement('div');
            wrapper.classList.add('nezha-traffic-wrapper', 'new-inserted-element', uniqueClassName);
            wrapper.setAttribute('data-nezha-server-id', String(serverData.id));
            wrapper.style.opacity = '0';
            wrapper.style.transition = 'opacity 180ms ease';
            serverElementMap.set(serverData.id, wrapper);
        } else {
            wrapper.classList.add('nezha-traffic-wrapper', 'new-inserted-element', uniqueClassName);
            wrapper.setAttribute('data-nezha-server-id', String(serverData.id));
            serverElementMap.set(serverData.id, wrapper);
        }

        if (!wrapper.isConnected || wrapper.parentNode !== containerDiv) {
            const refSection = containerDiv.querySelector('section.flex.items-center.w-full.justify-between.gap-1') ||
                containerDiv.querySelector('section.grid.items-center.gap-3');
            if (refSection) {
                refSection.after(wrapper);
            } else {
                containerDiv.appendChild(wrapper);
            }

            requestAnimationFrame(() => {
                wrapper.style.opacity = '1';
            });
        }

        return wrapper;
    }

    function findServerContainerByName(serverName) {
        const textSelector = 'p, span, div, h1, h2, h3, h4, h5';
        const normalized = serverName.trim();
        const nodes = Array.from(document.querySelectorAll(textSelector));
        for (const node of nodes) {
            if (node.textContent?.trim() === normalized) {
                return node.closest('div');
            }
        }
        return null;
    }

    function renderTrafficStats(trafficData, config) {
        injectCustomCSS(); // 确保样式始终在标签切换后生效
        
        const serverMap = new Map();
        for (const cycleId in trafficData) {
            const cycle = trafficData[cycleId];
            if (!cycle.server_name || !cycle.transfer) continue;
            for (const serverId in cycle.server_name) {
                const serverName = cycle.server_name[serverId];
                if (serverName) {
                    serverMap.set(serverName.trim(), {
                        id: serverId,
                        transfer: cycle.transfer[serverId],
                        max: cycle.max,
                        name: cycle.name,
                        from: cycle.from,
                        to: cycle.to,
                        next_update: cycle.next_update[serverId]
                    });
                }
            }
        }

        // 清洗已经离线的 DOM 节点绑定
        toggleElements = toggleElements.filter(item => document.body.contains(item.el));

        serverMap.forEach((serverData, serverName) => {
            // 更稳的服务器卡片定位：先按服务器名搜索文本节点，再取其最近包裹容器
            const containerDiv = findServerContainerByName(serverName);
            if (!containerDiv) return;

            const wrapper = ensureServerWrapper(containerDiv, serverData);

            if (!config.showTrafficStats) {
                wrapper.remove();
                serverElementMap.delete(serverData.id);
                return;
            }

            // 数据解析与格式化
            const used = utils.formatFileSize(serverData.transfer);
            const total = utils.formatFileSize(serverData.max);
            const percentage = utils.calculatePercentage(serverData.transfer, serverData.max);
            const fromDate = utils.formatDate(serverData.from);
            const toDate = utils.formatDate(serverData.to);
            const nextUpdate = new Date(serverData.next_update).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
            const progressColor = utils.getHslGradientColor(percentage);

            const defaultTimeHTML = `<span>${fromDate}</span> <span class="text-neutral-500">-</span> <span>${toDate}</span>`;
            const rotators = [
                defaultTimeHTML,
                `<span class="text-[10px] font-semibold text-neutral-800 dark:text-neutral-200">${percentage}%</span>`,
                `<span class="text-[10px] text-neutral-500">${nextUpdate}</span>`
            ];

            // 核心去闪烁与静默更新逻辑
            let timeInfoEl = wrapper.querySelector('.traffic-time-info');
            if (timeInfoEl) {
                const usedEl = wrapper.querySelector('.t-used');
                const totalEl = wrapper.querySelector('.t-total');
                const barEl = wrapper.querySelector('.t-bar');
                
                if (usedEl) usedEl.textContent = `${used.value}${used.unit}`;
                if (totalEl) totalEl.textContent = `${total.value}${total.unit}`;
                if (barEl) {
                    barEl.style.width = `${percentage}%`;
                    barEl.style.backgroundColor = progressColor;
                }
                
                const boundItem = toggleElements.find(item => item.el === timeInfoEl);
                if (boundItem) boundItem.contents = rotators;
                
            } else {
                // 初次构建容器内部骨架
                // 重点：.nezha-progress-bg 提供强制显化的高透明度“未使用流量”背景条
                wrapper.innerHTML = `
                    <div class="flex items-center justify-between animate-fade-in">
                        <div class="flex items-baseline gap-1 text-[10px] font-medium text-neutral-800 dark:text-neutral-200">
                            <span class="t-used">${used.value}${used.unit}</span>
                            <span class="text-neutral-400 dark:text-neutral-500">/</span>
                            <span class="t-total text-neutral-500 dark:text-neutral-400">${total.value}${total.unit}</span>
                        </div>
                        <div class="traffic-time-info text-[10px] font-medium text-neutral-500 dark:text-neutral-400">
                            ${defaultTimeHTML}
                        </div>
                    </div>
                    <div class="relative h-1.5 w-full mt-1 rounded-full overflow-hidden nezha-progress-bg">
                        <div class="t-bar absolute top-0 left-0 h-full rounded-full transition-all duration-500 ease-out" style="width: ${percentage}%; background-color: ${progressColor};"></div>
                    </div>
                `;
                
                if (config.toggleInterval > 0) {
                    const newTimeEl = wrapper.querySelector('.traffic-time-info');
                    if (newTimeEl) {
                        toggleElements.push({ el: newTimeEl, contents: rotators });
                    }
                }
            }
        });
    }

    function startToggleCycle(toggleInterval, duration) {
        if (toggleInterval <= 0) return;
        let cycleIndex = 0;
        setInterval(() => {
            cycleIndex++;
            toggleElements.forEach(({ el, contents }) => {
                if (!document.body.contains(el)) return;
                const nextContent = contents[cycleIndex % contents.length];
                utils.fadeOutIn(el, nextContent, duration);
            });
        }, toggleInterval);
    }

    return {
        renderTrafficStats,
        startToggleCycle
    };
})();

// == 数据状态中心 ==
const trafficDataManager = (() => {
    let internalCache = null;

    function fetchTrafficData(apiUrl, config, callback) {
        const now = Date.now();
        if (internalCache && (now - internalCache.timestamp < config.interval)) {
            callback(internalCache.data);
            return;
        }

        fetch(apiUrl)
            .then(res => res.json())
            .then(res => {
                if (res?.success && res?.data?.cycle_transfer_stats) {
                    const stats = res.data.cycle_transfer_stats;
                    internalCache = { timestamp: now, data: stats };
                    callback(stats);
                }
            })
            .catch(err => {
                if (config.enableLog) console.error('[TrafficDataManager] Fetch error:', err);
            });
    }

    return { fetchTrafficData };
})();

// == 顶层监控中心 ==
const domObserver = (() => {
    let mainObserver = null;

    function startDetector(onChangeCallback) {
        if (mainObserver) mainObserver.disconnect();
        
        mainObserver = new MutationObserver(mutations => {
            let shouldTrigger = false;
            for (const m of mutations) {
                const isSelfAction = Array.from(m.addedNodes).concat(Array.from(m.removedNodes)).some(node => {
                    return node.classList && (
                        node.classList.contains('nezha-traffic-wrapper') || 
                        node.classList.contains('traffic-time-info') ||
                        node.tagName === 'SPAN'
                    );
                });
                
                if (isSelfAction) continue;
                
                if (m.type === 'childList' && (m.addedNodes.length > 0 || m.removedNodes.length > 0)) {
                    shouldTrigger = true;
                    break;
                }
            }
            if (shouldTrigger) onChangeCallback();
        });

        const root = document.querySelector('main') || document.body;
        mainObserver.observe(root, { childList: true, subtree: true });
        return mainObserver;
    }

    function stopDetector() {
        if (mainObserver) mainObserver.disconnect();
    }

    return { startDetector, stopDetector };
})();

// == 运行总控入口 ==
(function init() {
    let defaultConfig = {
        showTrafficStats: true,
        insertAfter: true,
        interval: 60000,
        toggleInterval: 4000,
        duration: 400,
        apiUrl: '/api/v1/service',
        enableLog: false
    };

    let config = Object.assign({}, defaultConfig, window.TrafficScriptConfig || {});
    let trafficTimer = null;

    function fireUpdate() {
        trafficDataManager.fetchTrafficData(config.apiUrl, config, trafficData => {
            trafficRenderer.renderTrafficStats(trafficData, config);
        });
    }

    const debouncedRender = utils.debounce(fireUpdate, 150);

    const detector = domObserver.startDetector(debouncedRender);

    trafficTimer = setInterval(fireUpdate, config.interval);

    trafficRenderer.startToggleCycle(config.toggleInterval, config.duration);

    fireUpdate();

    setTimeout(() => {
        const freshConfig = Object.assign({}, defaultConfig, window.TrafficScriptConfig || {});
        if (JSON.stringify(freshConfig) !== JSON.stringify(config)) {
            config = freshConfig;
            fireUpdate();
        }
    }, 100);

    window.addEventListener('beforeunload', () => {
        domObserver.stopDetector();
        if (trafficTimer) clearInterval(trafficTimer);
    });
})();
