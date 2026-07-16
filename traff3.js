const SCRIPT_VERSION = 'v20260716-stable';

// == 样式注入模块 == //
// 注入自定义CSS隐藏特定元素
function injectCustomCSS() {
    const style = document.createElement('style');
    style.textContent = `
        /* 隐藏父级类名为 mt-4 w-full mx-auto 下的所有 div */
        .mt-4.w-full.mx-auto > div {
            display: none;
        }
    `;
    document.head.appendChild(style);
}
injectCustomCSS();

// == 工具函数模块 ==
const utils = (() => {
    /**
     * 格式化文件大小，自动转换单位
     * @param {number} bytes - 字节数
     * @returns {{value: string, unit: string}} 格式化后的数值和单位
     */
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

    /**
     * 计算百分比，输入可为大数，支持自动缩放
     * @param {number} used - 已使用量
     * @param {number} total - 总量
     * @returns {string} 百分比字符串，保留2位小数
     */
    function calculatePercentage(used, total) {
        used = Number(used);
        total = Number(total);
        // 大数缩放，防止数值溢出
        if (used > 1e15 || total > 1e15) {
            used /= 1e10;
            total /= 1e10;
        }
        return total === 0 ? '0.00' : ((used / total) * 100).toFixed(2);
    }

    /**
     * 格式化日期字符串，返回 yyyy-MM-dd 格式
     * @param {string} dateString - 日期字符串
     * @returns {string} 格式化日期
     */
    function formatDate(dateString) {
        const date = new Date(dateString);
        if (isNaN(date)) return '';
        return date.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
    }

    /**
     * 安全设置子元素文本内容，避免空引用错误
     * @param {HTMLElement} parent - 父元素
     * @param {string} selector - 子元素选择器
     * @param {string} text - 要设置的文本
     */
    function safeSetTextContent(parent, selector, text) {
        const el = parent.querySelector(selector);
        if (el) el.textContent = text;
    }

    /**
     * 根据百分比返回渐变HSL颜色（绿→橙→红）
     * @param {number} percentage - 0~100的百分比
     * @returns {string} hsl颜色字符串
     */
    function getHslGradientColor(percentage) {
        const clamp = (val, min, max) => Math.min(Math.max(val, min), max);
        const lerp = (start, end, t) => start + (end - start) * t;
        const p = clamp(Number(percentage), 0, 100);
        let h, s, l;
        if (p <= 35) {
            const t = p / 35;
            h = lerp(130, 130, t);  // 深绿
            s = lerp(70, 80, t);    
            l = lerp(30, 35, t);    
        } else if (p <= 85) {
            const t = (p - 35) / 50;
            h = lerp(130, 130, t); 
            s = lerp(80, 75, t);    
            l = lerp(35, 32, t);    
        } else {
            const t = (p - 85) / 15;
            h = lerp(130, 130, t); 
            s = lerp(75, 70, t);    
            l = lerp(32, 28, t);    
        }
        return `hsl(${h.toFixed(0)}, ${s.toFixed(0)}%, ${l.toFixed(0)}%)`;
    }

    /**
     * 透明度渐隐渐现切换内容
     * @param {HTMLElement} element - 目标元素
     * @param {string} newContent - 新HTML内容
     * @param {number} duration - 动画持续时间，毫秒
     */
    function fadeOutIn(element, newContent, duration = 500) {
        element.style.transition = `opacity ${duration / 2}ms`;
        element.style.opacity = '0';
        setTimeout(() => {
            element.innerHTML = newContent;
            element.style.transition = `opacity ${duration / 2}ms`;
            element.style.opacity = '1';
        }, duration / 2);
    }

    /**
     * 简单的防抖函数
     */
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
        safeSetTextContent,
        getHslGradientColor,
        fadeOutIn,
        debounce
    };
})();

// == 流量统计渲染模块 ==
const trafficRenderer = (() => {
    let toggleElements = [];  // 存储需周期切换显示的元素及其内容

    /**
     * 渲染流量统计条目
     * @param {Object} trafficData - 后台返回的流量数据
     * @param {Object} config - 配置项
     */
    function renderTrafficStats(trafficData, config) {
        const serverMap = new Map(); // 解析流量数据，按服务器名聚合
        for (const cycleId in trafficData) {
            const cycle = trafficData[cycleId];
            if (!cycle.server_name || !cycle.transfer) continue;
            for (const serverId in cycle.server_name) {
                const serverName = cycle.server_name[serverId];
                const transfer = cycle.transfer[serverId];
                const max = cycle.max;
                const from = cycle.from;
                const to = cycle.to;
                const next_update = cycle.next_update[serverId];
                if (serverName && transfer !== undefined && max && from && to) {
                    serverMap.set(serverName, {
                        id: serverId,
                        transfer,
                        max,
                        name: cycle.name,
                        from,
                        to,
                        next_update
                    });
                }
            }
        }

        // 清理在 DOM 中已经不存在的 toggle 绑定，防止内存泄漏
        toggleElements = toggleElements.filter(item => document.body.contains(item.el));

        serverMap.forEach((serverData, serverName) => {
            // 查找对应显示区域
            const targetElement = Array.from(document.querySelectorAll('section.grid.items-center.gap-2'))
                .find(section => {
                    const firstText = section.querySelector('p')?.textContent.trim();
                    return firstText === serverName.trim();
                });

            if (!targetElement) return;

            // 格式化数据
            const usedFormatted = utils.formatFileSize(serverData.transfer);
            const totalFormatted = utils.formatFileSize(serverData.max);
            const percentage = utils.calculatePercentage(serverData.transfer, serverData.max);
            const fromFormatted = utils.formatDate(serverData.from);
            const toFormatted = utils.formatDate(serverData.to);
            const nextUpdateFormatted = new Date(serverData.next_update).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
            const uniqueClassName = 'traffic-stats-for-server-' + serverData.id;
            const progressColor = utils.getHslGradientColor(percentage);
            const containerDiv = targetElement.closest('div');
            if (!containerDiv) return;

            // 日志输出函数
            const log = (...args) => {
                if (config.enableLog) console.log('[renderTrafficStats]', ...args);
            };

            // 查找是否已有对应流量条目元素
            const existing = Array.from(containerDiv.querySelectorAll('.new-inserted-element'))
                .find(el => el.classList.contains(uniqueClassName));

            if (!config.showTrafficStats) {
                // 不显示时移除对应元素
                if (existing) {
                    existing.remove();
                    log(`移除流量条目: ${serverName}`);
                }
                return;
            }

            if (existing) {
                // 更新已存在元素内容
                utils.safeSetTextContent(existing, '.used-traffic', usedFormatted.value);
                utils.safeSetTextContent(existing, '.used-unit', usedFormatted.unit);
                utils.safeSetTextContent(existing, '.total-traffic', totalFormatted.value);
                utils.safeSetTextContent(existing, '.total-unit', totalFormatted.unit);
                utils.safeSetTextContent(existing, '.from-date', fromFormatted);
                utils.safeSetTextContent(existing, '.to-date', toFormatted);
                utils.safeSetTextContent(existing, '.percentage-value', percentage + '%');
                utils.safeSetTextContent(existing, '.next-update', `next update: ${nextUpdateFormatted}`);
                const progressBar = existing.querySelector('.progress-bar');
                if (progressBar) {
                    progressBar.style.width = percentage + '%';
                    progressBar.style.backgroundColor = progressColor;
                }
                log(`更新流量条目: ${serverName}`);
            } else {
                // 插入新的流量条目元素
                let oldSection = null;
                if (config.insertAfter) {
                    oldSection = containerDiv.querySelector('section.flex.items-center.w-full.justify-between.gap-1') || containerDiv.querySelector('section.grid.items-center.gap-3');
                } else {
                    oldSection = containerDiv.querySelector('section.grid.items-center.gap-3');
                }
                if (!oldSection) return;

                // 时间区间内容，用于切换显示
                const defaultTimeInfoHTML = `<span class="from-date">${fromFormatted}</span> <span class="text-neutral-500 dark:text-neutral-400">-</span> <span class="to-date">${toFormatted}</span>`;
                const contents = [
                    defaultTimeInfoHTML,
                    `<span class="text-[10px] font-medium text-neutral-800 dark:text-neutral-200 percentage-value">${percentage}%</span>`,
                    `<span class="text-[10px] font-medium text-neutral-600 dark:text-neutral-300">${nextUpdateFormatted}</span>`
                ];

                const newElement = document.createElement('div');
                newElement.classList.add('space-y-1.5', 'new-inserted-element', uniqueClassName);
                newElement.style.width = '100%';
                newElement.innerHTML = `
                    <div class="flex items-center justify-between">
                        <div class="flex items-baseline gap-1">
                            <span class="text-[10px] font-medium text-neutral-800 dark:text-neutral-200 used-traffic">${usedFormatted.value}</span>
                            <span class="text-[10px] font-medium text-neutral-800 dark:text-neutral-200 used-unit">${usedFormatted.unit}</span>
                            <span class="text-[10px] text-neutral-500 dark:text-neutral-400">/ </span>
                            <span class="text-[10px] text-neutral-500 dark:text-neutral-400 total-traffic">${totalFormatted.value}</span>
                            <span class="text-[10px] text-neutral-500 dark:text-neutral-400 total-unit">${totalFormatted.unit}</span>
                        </div>
                        <div class="text-[10px] font-medium text-neutral-600 dark:text-neutral-300 time-info" style="opacity:1; transition: opacity 0.3s;">
                            ${defaultTimeInfoHTML}
                        </div>
                    </div>
                    <div class="relative h-1.5">
                        <div class="absolute inset-0 rounded-full dark:bg-neutral-800" style="background-color: #d4d4d4;"></div>
                        <div class="absolute inset-0 bg-emerald-500 rounded-full transition-all duration-300 progress-bar" style="width: ${percentage}%; max-width: 100%; background-color: ${progressColor};"></div>
                    </div>
                `;
                oldSection.after(newElement);
                log(`插入新流量条目: ${serverName}`);

                // 启用切换时，将元素及其内容保存以便周期切换
                if (config.toggleInterval > 0) {
                    const timeInfoElement = newElement.querySelector('.time-info');
                    if (timeInfoElement) {
                        toggleElements.push({ el: timeInfoElement, contents });
                    }
                }
            }
        });
    }

    /**
     * 启动周期切换内容显示（用于时间、百分比等轮播）
     * @param {number} toggleInterval - 切换间隔，毫秒
     * @param {number} duration - 动画时长，毫秒
     */
    function startToggleCycle(toggleInterval, duration) {
        if (toggleInterval <= 0) return;
        let toggleIndex = 0;
        setInterval(() => {
            toggleIndex++;
            toggleElements.forEach(({ el, contents }) => {
                if (!document.body.contains(el)) return;
                const index = toggleIndex % contents.length;
                utils.fadeOutIn(el, contents[index], duration);
            });
        }, toggleInterval);
    }

    return {
        renderTrafficStats,
        startToggleCycle
    };
})();

// == 数据请求和缓存模块 ==
const trafficDataManager = (() => {
    let trafficCache = null;

    /**
     * 请求流量数据，支持缓存和重建强制更新
     * @param {string} apiUrl - 接口地址
     * @param {Object} config - 配置项
     * @param {boolean} forceRender - 是否强制重新渲染（当DOM节点意外丢失时触发）
     * @param {Function} callback - 请求成功后的回调，参数为流量数据
     */
    function fetchTrafficData(apiUrl, config, forceRender, callback) {
        const now = Date.now();
        
        // 如果有缓存数据
        if (trafficCache && (now - trafficCache.timestamp < config.interval)) {
            if (forceRender) {
                // DOM 节点被抹除需要强制重绘，此时不请求 API，直接使用已有缓存重新构建
                if (config.enableLog) console.log('[fetchTrafficData] 检测到 DOM 丢失，使用缓存强制重绘');
                callback(trafficCache.data);
            } else {
                if (config.enableLog) console.log('[fetchTrafficData] DOM 完好，使用缓存静默更新');
                callback(trafficCache.data);
            }
            return;
        }

        if (config.enableLog) console.log('[fetchTrafficData] 缓存失效，请求新数据...');
        fetch(apiUrl)
            .then(res => res.json())
            .then(data => {
                if (!data.success) {
                    if (config.enableLog) console.warn('[fetchTrafficData] 请求成功但数据异常');
                    return;
                }
                if (config.enableLog) console.log('[fetchTrafficData] 成功获取新数据');
                const trafficData = data.data.cycle_transfer_stats;
                trafficCache = {
                    timestamp: now,
                    data: trafficData
                };
                callback(trafficData);
            })
            .catch(err => {
                if (config.enableLog) console.error('[fetchTrafficData] 请求失败:', err);
            });
    }

    return {
        fetchTrafficData
    };
})();

// == DOM变化监听模块 ==
const domObserver = (() => {
    const TARGET_SELECTOR = 'section.server-card-list, section.server-inline-list';
    let currentSection = null;
    let childObserver = null;

    /**
     * DOM 子节点变更回调，调用传入的函数
     * @param {Function} onChangeCallback - 变更处理函数
     */
    function onDomChildListChange(onChangeCallback) {
        onChangeCallback();
    }

    /**
     * 监听指定section子节点变化
     * @param {HTMLElement} section - 目标section元素
     * @param {Function} onChangeCallback - 变更处理函数
     */
    function observeSection(section, onChangeCallback) {
        if (childObserver) {
            childObserver.disconnect();
        }
        currentSection = section;
        childObserver = new MutationObserver(mutations => {
            for (const m of mutations) {
                if (m.type === 'childList' && (m.addedNodes.length || m.removedNodes.length)) {
                    // 忽略对我们自己插入的进度条变动引起的无限触发
                    const hasMyChange = Array.from(m.addedNodes).some(node => 
                        node.classList && (node.classList.contains('new-inserted-element') || node.classList.contains('time-info'))
                    );
                    if (hasMyChange) continue;

                    onDomChildListChange(onChangeCallback);
                    break;
                }
            }
        });
        childObserver.observe(currentSection, { childList: true, subtree: true }); // 使用 subtree 捕获卡片内部重新渲染
        // 初始调用一次
        onChangeCallback();
    }

    /**
     * 启动顶层section监听，检测section切换
     * @param {Function} onChangeCallback - section变化时回调
     * @returns {MutationObserver} sectionDetector实例
     */
    function startSectionDetector(onChangeCallback) {
        const sectionDetector = new MutationObserver(() => {
            const section = document.querySelector(TARGET_SELECTOR);
            if (section && section !== currentSection) {
                observeSection(section, onChangeCallback);
            }
        });
        const root = document.querySelector('main') || document.body;
        sectionDetector.observe(root, { childList: true, subtree: true });
        return sectionDetector;
    }

    /**
     * 断开所有监听
     * @param {MutationObserver} sectionDetector - 顶层section监听实例
     */
    function disconnectAll(sectionDetector) {
        if (childObserver) childObserver.disconnect();
        if (sectionDetector) sectionDetector.disconnect();
    }

    return {
        startSectionDetector,
        disconnectAll
    };
})();

// == 主程序入口 ==
(function main() {
    // 默认配置
    let defaultConfig = {
        showTrafficStats: true,
        insertAfter: true,
        interval: 60000,
        toggleInterval: 5000,
        duration: 500,
        apiUrl: '/api/v1/service',
        enableLog: false
    };

    // 合并用户自定义配置
    let config = Object.assign({}, defaultConfig, window.TrafficScriptConfig || {});

    if (config.enableLog) {
        console.log(`[TrafficScript] 版本: ${SCRIPT_VERSION}`);
        console.log('[TrafficScript] 最终配置如下:', config);
    }

    /**
     * 获取并刷新流量统计
     */
    function updateTrafficStats() {
        // 判断当前页面上是否存在任何一个进度条元素
        const hasProgressBar = document.querySelector('.new-inserted-element') !== null;
        
        // 如果页面上已经没有进度条，传入 forceRender = true 强制快速重绘
        trafficDataManager.fetchTrafficData(config.apiUrl, config, !hasProgressBar, trafficData => {
            trafficRenderer.renderTrafficStats(trafficData, config);
        });
    }

    // DOM 变更处理函数加上防抖，防止高频触发导致性能卡顿或死循环
    const debouncedOnDomChange = utils.debounce(() => {
        if (config.enableLog) console.log('[main] DOM发生变化，防抖刷新/补绘流量数据');
        updateTrafficStats();
        if (!trafficTimer) startPeriodicRefresh();
    }, 300);

    function onDomChange() {
        debouncedOnDomChange();
    }

    // 定时器句柄，防止重复启动
    let trafficTimer = null;

    /**
     * 启动周期刷新任务
     */
    function startPeriodicRefresh() {
        if (!trafficTimer) {
            if (config.enableLog) console.log('[main] 启动周期刷新任务');
            trafficTimer = setInterval(() => {
                updateTrafficStats();
            }, config.interval);
        }
    }

    // 启动内容切换轮播（如时间、百分比）
    trafficRenderer.startToggleCycle(config.toggleInterval, config.duration);

    // 监听section变化及其子节点变化
    const sectionDetector = domObserver.startSectionDetector(onDomChange);

    // 初始化调用一次
    updateTrafficStats();

    // 延迟 100ms 后尝试读取用户配置并覆盖
    setTimeout(() => {
        const newConfig = Object.assign({}, defaultConfig, window.TrafficScriptConfig || {});
        // 判断配置是否变化
        if (JSON.stringify(newConfig) !== JSON.stringify(config)) {
            if (config.enableLog) console.log('[main] 100ms后检测到新配置，更新配置并重启任务');
            config = newConfig;
            // 重新启动周期刷新任务
            startPeriodicRefresh();
            // 重新启动内容切换轮播（传入新配置）
            trafficRenderer.startToggleCycle(config.toggleInterval, config.duration);
            // 立即刷新数据
            updateTrafficStats();
        } else {
            if (config.enableLog) console.log('[main] 100ms后无新配置，保持原配置');
        }
    }, 100);

    // 页面卸载时清理监听和定时器
    window.addEventListener('beforeunload', () => {
        domObserver.disconnectAll(sectionDetector);
        if (trafficTimer) clearInterval(trafficTimer);
    });
})();
