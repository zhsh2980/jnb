// ========== 定时刷新功能 ==========

// 全局变量
let rafId = null;  // requestAnimationFrame ID
let timeDiff = 0;  // 时差（毫秒）
let targetTime = null;  // 目标时间戳
let isRunning = false;  // 是否正在倒计时

// 淘宝时间API
const TAOBAO_TIME_API = 'http://api.m.taobao.com/rest/api3.do?api=mtop.common.getTimestamp';

// 获取淘宝服务器时间
async function fetchTaobaoTime() {
  try {
    const localStart = Date.now();

    const response = await fetch(TAOBAO_TIME_API, {
      method: 'GET',
      mode: 'cors'
    });

    const localEnd = Date.now();

    if (!response.ok) {
      throw new Error('API request failed');
    }

    const data = await response.json();
    const serverTime = parseInt(data.data.t);

    if (isNaN(serverTime)) {
      throw new Error('Invalid server time');
    }

    // 计算网络延迟
    const rtt = localEnd - localStart;
    const delay = Math.floor(rtt / 2);

    // 补偿后的真实服务器时间
    const realServerTime = serverTime + delay;

    // 计算时差
    const calculatedTimeDiff = realServerTime - Date.now();

    console.log('[定时刷新] 淘宝时间同步成功:', {
      serverTime: new Date(serverTime).toISOString(),
      rtt: rtt + 'ms',
      delay: delay + 'ms',
      timeDiff: calculatedTimeDiff + 'ms'
    });

    return {
      success: true,
      timeDiff: calculatedTimeDiff,
      rtt: rtt
    };
  } catch (error) {
    console.error('[定时刷新] 获取淘宝时间失败:', error);
    return {
      success: false,
      timeDiff: 0  // 降级使用本地时间
    };
  }
}

// 开始倒计时
function startCountdown(targetTimestamp, calculatedTimeDiff, syncSuccess) {
  targetTime = targetTimestamp;
  timeDiff = calculatedTimeDiff;
  isRunning = true;

  console.log('[定时刷新] 开始倒计时:', {
    targetTime: new Date(targetTime).toISOString(),
    timeDiff: timeDiff + 'ms',
    syncSuccess: syncSuccess
  });

  // 通知popup同步完成
  sendMessageToPopup({
    status: 'synced',
    timeDiff: timeDiff,
    success: syncSuccess,
    isRunning: true
  });

  // 开始RAF循环
  function tick() {
    if (!isRunning) return;

    // 当前服务器时间 = 本地时间 + 时差
    const currentServerTime = Date.now() + timeDiff;

    // 剩余时间
    const remaining = targetTime - currentServerTime;

    if (remaining <= 0) {
      // 时间到了，执行刷新
      console.log('[定时刷新] 时间到，执行刷新！');
      stopCountdown();

      // 通知popup完成
      sendMessageToPopup({
        status: 'completed',
        isRunning: false
      });

      // 刷新页面
      location.reload();
    } else {
      // 更新UI显示
      sendMessageToPopup({
        status: 'countdown',
        remaining: remaining,
        isRunning: true
      });

      // 下一帧继续
      rafId = requestAnimationFrame(tick);
    }
  }

  // 开始倒计时
  rafId = requestAnimationFrame(tick);
}

// 停止倒计时
function stopCountdown() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  isRunning = false;
  targetTime = null;
  timeDiff = 0;

  console.log('[定时刷新] 倒计时已停止');
}

// 发送消息到popup
function sendMessageToPopup(data) {
  chrome.runtime.sendMessage({
    action: 'updateRefreshStatus',
    data: data
  }).catch(() => {
    // popup可能已关闭，忽略错误
  });
}

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('收到消息:', request);

  // 处理定时刷新相关消息
  if (request.action === 'startScheduledRefresh') {
    // 停止之前的倒计时（如果有）
    if (isRunning) {
      stopCountdown();
    }

    // 设置isRunning标志，防止同步期间被停止
    isRunning = true;

    // 通知popup开始同步
    sendMessageToPopup({
      status: 'syncing',
      isRunning: true
    });

    // 获取淘宝服务器时间
    fetchTaobaoTime().then(result => {
      if (!isRunning) {
        // 用户可能在同步期间点击了停止
        sendResponse({ success: false, message: 'Cancelled' });
        return;
      }

      // 开始倒计时
      startCountdown(request.targetTime, result.timeDiff, result.success);

      sendResponse({ success: true });
    }).catch(error => {
      console.error('[定时刷新] 启动失败:', error);
      isRunning = false;
      sendResponse({ success: false, message: error.message });
    });

    // 返回true表示异步响应
    return true;
  } else if (request.action === 'stopScheduledRefresh') {
    stopCountdown();
    sendResponse({ success: true });
    return true;
  } else if (request.action === 'getRefreshStatus') {
    // 返回当前状态
    sendResponse({
      isRunning: isRunning,
      status: isRunning ? 'countdown' : 'idle',
      timeDiff: timeDiff,
      remaining: isRunning && targetTime ? targetTime - Date.now() - timeDiff : 0
    });
    return true;
  }

  // 处理填充个人信息的消息
  if (request.action === 'fillPersonalInfo') {
    const data = request.data;
    console.log('填充数据:', data);
    
    // 扩展的选择器列表
    const selectors = {
      name: [
        '#USR_NM', // 建行纪念币预约专用选择器
        '#txtName', 'input[name*="name" i]', 'input[id*="name" i]', 
        'input[placeholder*="姓名" i]', '#username', '#userName',
        '#oppAcNme', 'input[name*="usr_nm"]',
        'input[id*="USR_NM"]', 'input[name*="USR_NM"]',
        'input[id*="客户"]', 'input[name*="客户"]',
        'input[id*="姓名"]', 'input[name*="姓名"]',
        'input[id*="客户姓名"]', 'input[id*="客户姓名"]',
        'input[id*="fullname"]', 'input[id*="realname"]',
        'label[for="userName"]', 'label[for="姓名"]',
        'label[for="客户姓名"]', 'label[for="客户"]',
        '.cell .information-input:nth-of-type(1) .el-input__inner'
      ],
      idCard: [
        '.cell .information-input:nth-of-type(3) .el-input__inner',
        '#CRDT_NO', // 建行纪念币预约专用选择器
        '#txtIdNo', 'input[name*="id" i]', 'input[id*="id" i]',
        'input[placeholder*="证件" i]', 'input[placeholder*="身份证" i]',
        '#idcard', '#idCard', '#sfzh', 'input[name="sfzh"]',
        '#credNumTemp', '.credNumTemp', 'input[name*="crdt_no"]',
        'input[id*="证件号码"]', 'input[name*="证件号码"]'
        
      ],
      phone: [
        '#MBLPH_NO', // 建行纪念币预约专用选择器
        '#txtMobile', 'input[name*="phone" i]', 'input[id*="phone" i]', 
        'input[name*="mobile" i]', 'input[id*="mobile" i]',
        'input[name*="cellphone" i]', 'input[id*="cellphone" i]',
        'input[placeholder*="手机" i]', '#tel', '#sjhm',
        'input[name="sjhm"]', '#mblph_no',
        'input[id*="telephone"]', '.secure-input-plain-phone',
        'input[placeholder*="联系方式"]',
        'input[placeholder*="联系电话"]',
        'input[type="tel"]',
        '.cell .information-input:nth-of-type(4) .el-input__inner'
      ],
      appointmentBranch: [
        '#txtBranch', 'input[name*="branch" i]', 'input[id*="branch" i]',
        'input[placeholder*="网点" i]', '#branch', '#网点', '#appointmentBranch',
        'select[name*="branch" i]', 'select[id*="branch" i]',
        'select[name*="网点" i]', 'select[id*="网点" i]',
        'select[name*="营业厅" i]', 'select[id*="营业厅" i]',
        'select[name*="预约网点" i]', 'select[id*="预约网点" i]'
      ],
      appointmentQuantity: [
        '#txtQuantity', 'input[name*="quantity" i]', 'input[id*="quantity" i]',
        'input[name*="amount" i]', 'input[id*="amount" i]',
        'input[placeholder*="数量" i]', '#quantity', '#预约数量', '#appointmentQuantity',
        'select[name*="quantity" i]', 'select[id*="quantity" i]',
        'select[name*="数量" i]', 'select[id*="数量" i]',
        'select[name*="amount" i]', 'select[id*="amount" i]',
        'input[aria-label*="数量" i]'
      ]
    };

    // 遍历所有可能的选择器
    Object.keys(selectors).forEach(field => {
      selectors[field].some(selector => {
        const element = document.querySelector(selector);
        if (element) {
          const value = data[field === 'name' ? 'userName' : field];
          
          if (element.tagName.toLowerCase() === 'select') {
            // 处理下拉选择框
            handleSelect(element, value);
          } else {
            // 处理输入框
            element.value = value;
            // 触发各种事件以确保表单验证生效
            ['input', 'change', 'blur', 'focus'].forEach(eventType => {
              const event = new Event(eventType, { bubbles: true });
              element.dispatchEvent(event);
            });
          }
          return true;
        }
      });
    });
    sendResponse({ success: true });
  }
  return true;
});

// 处理下拉选择框
function handleSelect(select, value) {
  // 1. 尝试直接匹配值
  let found = false;
  for (let i = 0; i < select.options.length; i++) {
    const option = select.options[i];
    if (option.value === value || option.text === value) {
      select.selectedIndex = i;
      found = true;
      break;
    }
  }

  // 2. 如果没有找到完全匹配，尝试模糊匹配
  if (!found) {
    for (let i = 0; i < select.options.length; i++) {
      const option = select.options[i];
      if (option.text.includes(value) || value.includes(option.text)) {
        select.selectedIndex = i;
        found = true;
        break;
      }
    }
  }

  // 触发change事件
  if (found) {
    const event = new Event('change', { bubbles: true });
    select.dispatchEvent(event);
  }
} 