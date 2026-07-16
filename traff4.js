// 优化方案：将原有的 renderTrafficStats 替换为以下代码
function renderTrafficStats(trafficData, config) {
    const serverMap = new Map();
    for (const cycleId in trafficData) {
        const cycle = trafficData[cycleId];
        if (!cycle.server_name || !cycle.transfer) continue;
        for (const serverId in cycle.server_name) {
            serverMap.set(cycle.server_name[serverId], {
                id: serverId,
                transfer: cycle.transfer[serverId],
                max: cycle.max,
                from: cycle.from,
                to: cycle.to,
                next_update: cycle.next_update[serverId]
            });
        }
    }

    serverMap.forEach((serverData, serverName) => {
        // 查找对应服务器卡片
        const targetSection = Array.from(document.querySelectorAll('section.grid.items-center.gap-2'))
            .find(s => s.querySelector('p')?.textContent.trim() === serverName.trim());
        
        if (!targetSection) return;
        const container = targetSection.closest('div');
        
        // 关键优化：检查是否存在占位容器，没有则创建
        let wrapper = container.querySelector(`.traffic-wrapper-${serverData.id}`);
        if (!wrapper) {
            wrapper = document.createElement('div');
            wrapper.className = `traffic-wrapper-${serverData.id} new-inserted-element`;
            // 预留位置，避免后续突兀挤压
            wrapper.style.minHeight = '30px'; 
            targetSection.after(wrapper);
        }

        // 使用 innerHTML 快速更新，CSS 样式保持不变，避免重绘造成的布局偏移
        const percentage = utils.calculatePercentage(serverData.transfer, serverData.max);
        const progressColor = utils.getHslGradientColor(percentage);
        
        // 如果内容没变，直接跳过以减少 DOM 操作
        const newHtml = `
            <div class="space-y-1.5" style="width: 100%;">
                <div class="flex items-center justify-between">
                    <span class="text-[10px] font-medium text-neutral-800">${utils.formatFileSize(serverData.transfer).value}${utils.formatFileSize(serverData.transfer).unit} / ${utils.formatFileSize(serverData.max).value}${utils.formatFileSize(serverData.max).unit}</span>
                    <span class="text-[10px] font-medium text-neutral-600">${percentage}%</span>
                </div>
                <div class="relative h-1.5 rounded-full bg-neutral-200 dark:bg-neutral-800">
                    <div class="absolute inset-0 h-full rounded-full transition-all duration-300" style="width: ${percentage}%; background-color: ${progressColor};"></div>
                </div>
            </div>`;
            
        if (wrapper.innerHTML !== newHtml) {
            wrapper.innerHTML = newHtml;
        }
    });
}
