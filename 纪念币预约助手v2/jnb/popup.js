document.addEventListener('DOMContentLoaded', () => {
  // 加载已保存的个人信息列表和设置
  loadInfoList();
  loadSettings();
  
  // 添加新信息按钮事件
  document.getElementById('addNewInfo').addEventListener('click', () => {
    chrome.windows.create({
      url: 'edit.html?mode=add',
      type: 'popup',
      width: 360,
      height: 480,
      left: window.screenX + window.outerWidth - 360,
      top: window.screenY
    });
  });
  
  // 导出数据
  document.getElementById('exportData').addEventListener('click', exportData);
  
  // 导入数据
  document.getElementById('importData').addEventListener('click', importData);
  
  // 帮助按钮
  document.getElementById('helpBtn').addEventListener('click', showHelp);
  
  // 开关事件
  document.getElementById('autoVerifyCode').addEventListener('change', (e) => {
    chrome.storage.local.set({ autoVerifyCode: e.target.checked });
  });
  
  document.getElementById('autoFill').addEventListener('change', (e) => {
    chrome.storage.local.set({ autoFill: e.target.checked });
  });

  // 初始化定时刷新功能
  initScheduledRefresh();

  // 开始按钮事件
  document.getElementById('startRefreshBtn').addEventListener('click', startScheduledRefresh);

  // 停止按钮事件
  document.getElementById('stopRefreshBtn').addEventListener('click', stopScheduledRefresh);

  // 添加消息监听
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'refreshList') {
      loadInfoList();
    } else if (request.action === 'updateRefreshStatus') {
      updateRefreshUI(request.data);
    }
  });
  
  // 添加银行链接折叠功能
  const toggleBtn = document.getElementById('toggleBankLinks');
  const content = document.querySelector('.bank-links-content');
  const toggleIcon = document.querySelector('.toggle-icon');
  
  // 从存储中获取折叠状态
  chrome.storage.local.get('bankLinksExpanded', (result) => {
    if (result.bankLinksExpanded) {
      content.style.display = 'grid';
      toggleIcon.classList.add('active');
    }
  });

  toggleBtn.addEventListener('click', () => {
    const isHidden = content.style.display === 'none';
    content.style.display = isHidden ? 'grid' : 'none';
    toggleIcon.classList.toggle('active');
    
    // 保存折叠状态
    chrome.storage.local.set({ bankLinksExpanded: isHidden });
  });
});

// 加载信息列表
function loadInfoList(callback) {
  const infoList = document.getElementById('infoList');
  infoList.innerHTML = '';
  
  chrome.storage.local.get('infoList', (result) => {
    const list = result.infoList || [];
    
    if (list.length === 0) {
      infoList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📝</div>
          <div class="empty-text">暂无保存的信息</div>
          <div class="empty-hint">点击右上角"+"添加信息</div>
        </div>
      `;
    } else {
      list.forEach((info, index) => {
        const div = document.createElement('div');
        div.className = 'info-item';
        
        div.innerHTML = `
          <div class="info-text">姓名：${info.userName}</div>
          <div class="info-text">证件号：${info.idCard}</div>
          <div class="info-text">手机号：${info.phone}</div>
          <div class="info-text">预约网点：${info.appointmentBranch}</div>
          <div class="info-text">预约数量：${info.appointmentQuantity}</div>
          <div class="info-actions">
            <button class="fill-btn">填写</button>
            <button class="edit-btn">编辑</button>
            <button class="delete-btn">删除</button>
          </div>
        `;
        
        // 填写按钮事件
        div.querySelector('.fill-btn').addEventListener('click', () => {
          fillInfo(info);
        });
        
        // 编辑按钮事件
        div.querySelector('.edit-btn').addEventListener('click', () => {
          chrome.windows.create({
            url: `edit.html?mode=edit&index=${index}`,
            type: 'popup',
            width: 360,
            height: 480,
            left: window.screenX + window.outerWidth - 360,
            top: window.screenY
          });
        });
        
        // 删除按钮事件
        div.querySelector('.delete-btn').addEventListener('click', () => {
          if (confirm('确定要删除这条信息吗？')) {
            list.splice(index, 1);
            chrome.storage.local.set({ infoList: list }, () => {
              showNotification('删除成功！', 'success');
              loadInfoList();
            });
          }
        });
        
        infoList.appendChild(div);
      });
    }
    
    // 如果有回调函数，执行它
    if (typeof callback === 'function') {
      callback();
    }
  });
}

// 填写信息到页面
function fillInfo(info) {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (!tabs[0]?.id) {
      showNotification('无法获取当前标签页，请刷新后重试', 'error');
      return;
    }
    
    chrome.tabs.sendMessage(tabs[0].id, {
      action: 'fillPersonalInfo',
      data: info
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('消息发送错误:', chrome.runtime.lastError);
        showNotification('连接失败，请刷新页面后重试', 'error');
        return;
      }
      
      if (response?.success) {
        showNotification('信息填写成功！', 'success');
      } else {
        showNotification('信息填写失败，请检查页面是否正确', 'error');
      }
    });
  });
}

// 显示通知
function showNotification(message, type = 'info') {
  const existingNotification = document.querySelector('.notification');
  if (existingNotification) {
    existingNotification.remove();
  }
  
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);
  
  requestAnimationFrame(() => {
    notification.classList.add('show');
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 2000);
  });
}

// 其他辅助函数...
function loadSettings() {
  chrome.storage.local.get(['autoVerifyCode', 'autoFill'], (result) => {
    document.getElementById('autoVerifyCode').checked = result.autoVerifyCode || false;
    document.getElementById('autoFill').checked = result.autoFill || false;
  });
}

function showHelp() {
  showNotification('使用帮助：点击填写按钮可自动填写信息', 'info');
}

function exportData() {
  chrome.storage.local.get('infoList', (result) => {
    const data = JSON.stringify(result.infoList || []);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '纪念币快速预约.json';
    a.click();
    URL.revokeObjectURL(url);
    showNotification('导出成功！', 'success');
  });
}

function importData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';

  input.onchange = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (Array.isArray(data)) {
          chrome.storage.local.set({ infoList: data }, () => {
            showNotification('数据导入成功！', 'success');
            loadInfoList();
          });
        } else {
          throw new Error('Invalid data format');
        }
      } catch (err) {
        showNotification('数据格式错误！', 'error');
      }
    };

    reader.readAsText(file);
  };

  input.click();
}

// ========== 定时刷新功能 ==========

// 初始化定时刷新功能
function initScheduledRefresh() {
  // 设置日期和时间输入框的默认值为当前时间
  const now = new Date();

  // 设置日期（格式：YYYY-MM-DD）
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  document.getElementById('refreshDate').value = `${year}-${month}-${day}`;

  // 设置时间
  document.getElementById('refreshHour').value = String(now.getHours()).padStart(2, '0');
  document.getElementById('refreshMinute').value = String(now.getMinutes()).padStart(2, '0');
  document.getElementById('refreshSecond').value = String(now.getSeconds()).padStart(2, '0');
  document.getElementById('refreshMillisecond').value = String(now.getMilliseconds()).padStart(3, '0');

  // 添加输入框验证
  document.getElementById('refreshHour').addEventListener('input', (e) => validateInput(e.target, 0, 23));
  document.getElementById('refreshMinute').addEventListener('input', (e) => validateInput(e.target, 0, 59));
  document.getElementById('refreshSecond').addEventListener('input', (e) => validateInput(e.target, 0, 59));
  document.getElementById('refreshMillisecond').addEventListener('input', (e) => validateInput(e.target, 0, 999));

  // 从storage中恢复状态（如果有正在进行的倒计时）
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'getRefreshStatus'
      }, (response) => {
        if (response && response.isRunning) {
          updateRefreshUI(response);
        }
      });
    }
  });
}

// 输入验证
function validateInput(input, min, max) {
  let value = parseInt(input.value);

  if (isNaN(value) || value < min) {
    input.value = '';
  } else if (value > max) {
    input.value = String(max);
  }
}

// 开始定时刷新
function startScheduledRefresh() {
  // 获取输入的时间
  const dateInput = document.getElementById('refreshDate').value;
  const hourInput = document.getElementById('refreshHour').value;
  const minuteInput = document.getElementById('refreshMinute').value;
  const secondInput = document.getElementById('refreshSecond').value;
  const millisecondInput = document.getElementById('refreshMillisecond').value;

  // 验证输入
  if (!dateInput || hourInput === '' || minuteInput === '' || secondInput === '' || millisecondInput === '') {
    showNotification('请填写完整的日期和时间', 'error');
    return;
  }

  const hour = parseInt(hourInput);
  const minute = parseInt(minuteInput);
  const second = parseInt(secondInput);
  const millisecond = parseInt(millisecondInput);

  // 验证范围
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 ||
      second < 0 || second > 59 || millisecond < 0 || millisecond > 999) {
    showNotification('请输入有效的时间', 'error');
    return;
  }

  // 构建目标时间
  const targetDate = new Date(dateInput);
  targetDate.setHours(hour, minute, second, millisecond);
  const targetTime = targetDate.getTime();

  // 验证目标时间不能是过去的时间
  if (targetTime <= Date.now()) {
    showNotification('目标时间不能是过去的时间', 'error');
    return;
  }

  // 禁用输入框和开始按钮
  setInputsDisabled(true);

  // 更新UI：显示停止按钮
  document.getElementById('startRefreshBtn').style.display = 'none';
  document.getElementById('stopRefreshBtn').style.display = 'block';

  // 更新状态
  document.getElementById('refreshStatus').textContent = '同步中...';
  document.getElementById('timeDiff').textContent = '--';
  document.getElementById('countdown').textContent = '--:--:--.---';

  // 发送消息到content script开始倒计时
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (!tabs[0]?.id) {
      showNotification('无法获取当前标签页', 'error');
      resetRefreshUI();
      return;
    }

    chrome.tabs.sendMessage(tabs[0].id, {
      action: 'startScheduledRefresh',
      targetTime: targetTime
    }, (response) => {
      if (chrome.runtime.lastError || !response?.success) {
        showNotification('启动失败，请刷新页面后重试', 'error');
        resetRefreshUI();
      }
    });
  });
}

// 停止定时刷新
function stopScheduledRefresh() {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'stopScheduledRefresh'
      });
    }
  });

  resetRefreshUI();
  showNotification('已停止定时刷新', 'info');
}

// 更新刷新UI
function updateRefreshUI(data) {
  if (data.status === 'syncing') {
    document.getElementById('refreshStatus').textContent = '同步中...';
    document.getElementById('timeDiff').textContent = '--';
  } else if (data.status === 'synced') {
    document.getElementById('refreshStatus').textContent = '倒计时中';

    // 显示时差
    if (data.timeDiff !== undefined) {
      const diffText = data.timeDiff >= 0 ? `+${data.timeDiff}ms` : `${data.timeDiff}ms`;
      document.getElementById('timeDiff').textContent = data.success ? diffText : '使用本地时间';
    }
  } else if (data.status === 'countdown') {
    document.getElementById('refreshStatus').textContent = '倒计时中';

    // 更新倒计时显示
    if (data.remaining !== undefined) {
      const formatted = formatCountdown(data.remaining);
      document.getElementById('countdown').textContent = formatted;

      // 最后10秒变红色
      if (data.remaining <= 10000) {
        document.getElementById('countdown').style.color = '#ea4335';
      } else {
        document.getElementById('countdown').style.color = '#1a73e8';
      }
    }
  } else if (data.status === 'completed') {
    resetRefreshUI();
  }

  // 确保显示停止按钮
  if (data.isRunning) {
    document.getElementById('startRefreshBtn').style.display = 'none';
    document.getElementById('stopRefreshBtn').style.display = 'block';
    setInputsDisabled(true);
  }
}

// 重置刷新UI
function resetRefreshUI() {
  document.getElementById('startRefreshBtn').style.display = 'block';
  document.getElementById('stopRefreshBtn').style.display = 'none';
  document.getElementById('refreshStatus').textContent = '空闲';
  document.getElementById('timeDiff').textContent = '--';
  document.getElementById('countdown').textContent = '--:--:--.---';
  document.getElementById('countdown').style.color = '#1a73e8';
  setInputsDisabled(false);
}

// 设置输入框禁用状态
function setInputsDisabled(disabled) {
  document.getElementById('refreshDate').disabled = disabled;
  document.getElementById('refreshHour').disabled = disabled;
  document.getElementById('refreshMinute').disabled = disabled;
  document.getElementById('refreshSecond').disabled = disabled;
  document.getElementById('refreshMillisecond').disabled = disabled;
}

// 格式化倒计时显示
function formatCountdown(ms) {
  if (ms < 0) ms = 0;

  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
}