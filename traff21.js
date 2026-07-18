const SCRIPT_VERSION = 'v20250719';
// == 样式注入模块 ==
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
  h = lerp(130, 130, t);  // 深绿到深蓝（H 140 -> 220）
  s = lerp(70, 80, t);    // 稍微增强饱和度
  l = lerp(30, 35, t);    // 亮度略微变亮
} else if (p <= 85) {
  const t = (p - 35) / 50;
  h = lerp(130, 130, t); // 深蓝到紫蓝（H 220 -> 260）
  s = lerp(80, 75, t);    // 稍微减少饱和度
  l = lerp(35, 32, t);    // 亮度轻微下降
} else {
  const t = (p - 85) / 15;
  h = lerp(130, 130, t); // 紫蓝到深紫（H 260 -> 280）
  s = lerp(75, 70, t);    // 保持较高饱和度
  l = lerp(32, 28, t);    // 加深亮度，趋近深紫
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

  return {
    formatFileSize,
    calculatePercentage,
    formatDate,
    safeSetTextContent,
    getHslGradientColor,
    fadeOutIn
  };
})();

// == 流量统计渲染模块 ==
const trafficRenderer = (() => {
  const toggleElements = [];  // 存储需周期切换显示的元素及其内容

  /**
   * 渲染流量统计条目
   * @param {Object} trafficData - 后台返回的流量数据
   * @param {Object} config - 配置项
   */
  function renderTrafficStats(trafficData, config) {
    const serverMap = new Map();

    // 解析流量数据，按服务器名聚合
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

    serverMap.forEach((serverData, serverName) => {
      const trimmedName = serverName.trim();
      // 查找对应显示区域
      // 注意：新版 nezha(2.x) 卡片由 React 渲染，server 名所在 <p> 可能被追加状态文字，
      // 这里用 includes 放宽匹配，而非严格相等，避免失配导致整台 VPS 静默不渲染。
      const targetElement = Array.from(document.querySelectorAll('section.grid.items-center.gap-2'))
        .find(section => {
          const firstText = section.querySelector('p')?.textContent.trim();
          if (!firstText) return false;
          // 优先严格相等；失败则退化为“卡片首段文本以服务器名开头”
          // (新版常在名后追加在线状态/CPU 等文字，startsWith 能稳住)
          return firstText === trimmedName || firstText.startsWith(trimmedName);
        });
      if (!targetElement) return;

      // 给卡片打 data 标记，便于后续 IntersectionObserver 兜底补插入时按名定位
      if (targetElement.getAttribute('data-traffic-server') !== trimmedName) {
        targetElement.setAttribute('data-traffic-server', trimmedName);
      }

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
      const log = (...args) => { if (config.enableLog) console.log('[renderTrafficStats]', ...args); };

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
        // 新版 2.x 已确认 `flex items-center w-full justify-between gap-1` 仍存在；
        // 原 `section.grid.items-center.gap-3` 备用锚点在新版主流程不存在，已移除。
        // 为容忍 Tailwind-merge 动态追加的额外类名，用宽松属性选择器匹配关键类前缀。
        const oldSection = containerDiv.querySelector(
          'section[class*="flex"][class*="items-center"][class*="w-full"][class*="justify-between"][class*="gap-1"]'
        ) || containerDiv.querySelector('section.flex.items-center.w-full.justify-between.gap-1');
        if (!oldSection) {
          log(`未找到插入锚点，跳过: ${serverName}`);
          return;
        }

        // 时间区间内容，用于切换显示
        const defaultTimeInfoHTML = `<span class="from-date">${fromFormatted}</span>
                <span class="text-neutral-500 dark:text-neutral-400">-</span>
                <span class="to-date">${toFormatted}</span>`;
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
            toggleElements.push({
              el: timeInfoElement,
              contents
            });
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
   * 请求流量数据，支持缓存
   * @param {string} apiUrl - 接口地址
   * @param {Object} config - 配置项
   * @param {Function} callback - 请求成功后的回调，参数为流量数据
   */
  function fetchTrafficData(apiUrl, config, callback) {
    const now = Date.now();
    // 使用缓存数据
    if (trafficCache && (now - trafficCache.timestamp < config.interval)) {
      if (config.enableLog) console.log('[fetchTrafficData] 使用缓存数据');
      callback(trafficCache.data);
      return;
    }

    if (config.enableLog) console.log('[fetchTrafficData] 请求新数据...');
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
  const CARD_SELECTOR = 'section.grid.items-center.gap-2';
  let currentSection = null;
  let childObserver = null;
  // IntersectionObserver：监听虚拟滚动下卡片进出视口(React 会卸载/重建卡片 DOM，
  // 进视口时若未带流量条则需补插入)。回调里只触发一次刷新，避免抖动风暴。
  let cardVisibilityObserver = null;
  let visibilityTriggerPending = false;

  function buildCardVisibilityObserver(onChangeCallback) {
    if (cardVisibilityObserver) cardVisibilityObserver.disconnect();
    cardVisibilityObserver = new IntersectionObserver(entries => {
      let needRefresh = false;
      for (const entry of entries) {
        // 卡片进入视口 且 尚无流量条 → 标记需要补插入
        if (entry.isIntersecting && !entry.target.parentElement?.querySelector('.new-inserted-element')) {
          needRefresh = true;
          break;
        }
      }
      if (!needRefresh || visibilityTriggerPending) return;
      visibilityTriggerPending = true;
      // 用 rAF 合并同一帧内的多次触发，减轻滚动时的刷新压力
      requestAnimationFrame(() => {
        visibilityTriggerPending = false;
        onChangeCallback();
      });
    }, { root: null, rootMargin: '200px 0px', threshold: 0 });
  }

  function attachCardObserver(section, onChangeCallback) {
    // 重新监听当前可视区与邻近的卡片
    buildCardVisibilityObserver(onChangeCallback);
    // 留 rootMargin，使滚近时提前补，避免视觉空窗
    const cards = section.querySelectorAll(CARD_SELECTOR);
    for (const card of cards) cardVisibilityObserver.observe(card);
  }

  /**
   * DOM 子节点变更回调，调用传入的函数
   * @param {Function} onChangeCallback - 变更处理函数
   */
  function onDomChildListChange(onChangeCallback) {
    onChangeCallback();
  }

  /**
   * 监听指定section子节点变化
   * 注意：新版 2.x 列表内部是 @tanstack/react-virtual 虚拟容器，
   * 卡片增删发生在 currentSection 的后代节点(subtree)中，必须开启 subtree 才能感知到。
   * @param {HTMLElement} section - 目标section元素
   * @param {Function} onChangeCallback - 变更处理函数
   */
  function observeSection(section, onChangeCallback) {
    if (childObserver) {
      childObserver.disconnect();
    }
    currentSection = section;
    childObserver = new MutationObserver(mutations => {
      // 记录本次变更是否新增了卡片节点(DOM 重渲染的典型信号)
      let addedCard = false;
      for (const m of mutations) {
        if (m.type !== 'childList') continue;
        if (m.addedNodes && m.addedNodes.length) {
          // 只要新增节点中含卡片相关结构，即触发刷新(容忍虚拟容器中间层 div)
          for (const n of m.addedNodes) {
            if (n.nodeType === 1 && (n.matches?.(CARD_SELECTOR) || n.querySelector?.(CARD_SELECTOR))) {
              addedCard = true;
              break;
            }
          }
        }
        if (addedCard || (m.addedNodes.length || m.removedNodes.length)) {
          onDomChildListChange(onChangeCallback);
          if (addedCard) { // 卡片被 React 重建(如虚拟滚动回滚到视口)，补绑可见性监听
            attachCardObserver(currentSection, onChangeCallback);
          }
          break;
        }
      }
    });
    // 关键：开启 subtree，否则监听不到虚拟容器(absolute div)里的卡片增删
    childObserver.observe(currentSection, { childList: true, subtree: true });
    // 初始调用一次，并为当前已渲染的卡片挂可见性监听
    attachCardObserver(currentSection, onChangeCallback);
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
   * 供外部滚动/resize 事件触发兜底补插入
   * @param {Function} onChangeCallback
   */
  function poke(onChangeCallback) {
    if (currentSection) {
      attachCardObserver(currentSection, onChangeCallback);
      onChangeCallback();
    }
  }

  /**
   * 断开所有监听
   * @param {MutationObserver} sectionDetector - 顶层section监听实例
   */
  function disconnectAll(sectionDetector) {
    if (childObserver) childObserver.disconnect();
    if (cardVisibilityObserver) cardVisibilityObserver.disconnect();
    if (sectionDetector) sectionDetector.disconnect();
  }

  return {
    startSectionDetector,
    disconnectAll,
    poke
  };
})();

// == 主程序入口 ==
(function main() {
  // 默认配置
  const defaultConfig = {
    showTrafficStats: true,
    insertAfter: true,
    interval: 60000,
    toggleInterval: 5000,
    duration: 500,
    apiUrl: '/api/v1/service',
    enableLog: false
  };
  // 合并用户自定义配置
  const config = Object.assign({}, defaultConfig, window.TrafficScriptConfig || {});
  if (config.enableLog) {
    console.log(`[TrafficScript] 版本: ${SCRIPT_VERSION}`);
    console.log('[TrafficScript] 最终配置如下:', config);
  }
  /**
   * 获取并刷新流量统计
   */
  function updateTrafficStats() {
    trafficDataManager.fetchTrafficData(config.apiUrl, config, trafficData => {
      trafficRenderer.renderTrafficStats(trafficData, config);
    });
  }

  /**
   * DOM变更处理函数，触发刷新
   */
  function onDomChange() {
    if (config.enableLog) console.log('[main] DOM变化，刷新流量数据');
    updateTrafficStats();
    if (!trafficTimer) startPeriodicRefresh();
  }

  /**
   * 滚动/视口变化触发兜底补插入(应对虚拟滚动销毁卡片)
   */
  let scrollPokePending = false;
  function onScrollPoke() {
    if (scrollPokePending) return;
    scrollPokePending = true;
    requestAnimationFrame(() => {
      scrollPokePending = false;
      domObserver.poke(onDomChange);
    });
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

  // 滚动/resize 兜底：虚拟列表下卡片进出视口会卸载/重建，需补流量条
  // 直接监听可能滚动的祖先元素(列表区与窗口本身)
  const scrollRoots = [
    document.querySelector('section.server-card-list'),
    document.querySelector('section.server-inline-list'),
    document.scrollingElement,
    window
  ].filter(Boolean);
  const scrollOpts = { passive: true };
  for (const root of scrollRoots) {
    root.addEventListener?.('scroll', onScrollPoke, scrollOpts);
  }
  window.addEventListener('resize', onScrollPoke, scrollOpts);

  // 新版 Vite+React 在 #root 上加 .loaded 表示客户端渲染完成；
  // 在此之前页面没有卡片 DOM。等加载完成后再触发首次渲染。
  function bootWhenLoaded() {
    const rootEl = document.getElementById('root');
    if (rootEl && rootEl.classList.contains('loaded')) {
      onDomChange();
    } else {
      // 轮询直到 loaded 出现(最多 ~15s)，出现后立即首渲染
      const waitTimer = setInterval(() => {
        if (document.getElementById('root')?.classList.contains('loaded')) {
          clearInterval(waitTimer);
          onDomChange();
        }
      }, 300);
      setTimeout(() => clearInterval(waitTimer), 15000);
    }
  }
  bootWhenLoaded();
  // 初始化调用一次
  onDomChange();

  // 延迟 100ms 后尝试读取用户配置并覆盖
  setTimeout(() => {
    const newConfig = Object.assign({}, defaultConfig, window.TrafficScriptConfig || {});
    // 判断配置是否变化（简单粗暴比较JSON字符串）
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
    for (const root of scrollRoots) {
      root.removeEventListener?.('scroll', onScrollPoke);
    }
    window.removeEventListener('resize', onScrollPoke);
  });
})();
