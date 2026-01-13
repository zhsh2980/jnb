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

  document.getElementById('autoRefresh').addEventListener('change', (e) => {
    const checked = e.target.checked;
    chrome.storage.local.set({ autoRefresh: checked });

    // 显示或隐藏刷新间隔输入框
    const intervalContainer = document.getElementById('refreshIntervalContainer');
    intervalContainer.style.display = checked ? 'flex' : 'none';

    // 通知所有标签页更新刷新状态
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          action: 'updateRefreshSettings',
          autoRefresh: checked
        }).catch(() => {});
      });
    });
  });

  // 刷新间隔输入框事件
  document.getElementById('refreshInterval').addEventListener('change', (e) => {
    let interval = parseInt(e.target.value);

    // 验证输入值
    if (isNaN(interval) || interval < 1) {
      interval = 30;
      e.target.value = 30;
    } else if (interval > 3600) {
      interval = 3600;
      e.target.value = 3600;
    }

    chrome.storage.local.set({ refreshInterval: interval });

    // 通知所有标签页更新刷新间隔
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          action: 'updateRefreshSettings',
          refreshInterval: interval
        }).catch(() => {});
      });
    });
  });

  // 添加消息监听
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'refreshList') {
      loadInfoList();
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
  chrome.storage.local.get(['autoVerifyCode', 'autoFill', 'autoRefresh', 'refreshInterval'], (result) => {
    document.getElementById('autoVerifyCode').checked = result.autoVerifyCode || false;
    document.getElementById('autoFill').checked = result.autoFill || false;

    const autoRefresh = result.autoRefresh || false;
    const refreshInterval = result.refreshInterval || 30;

    document.getElementById('autoRefresh').checked = autoRefresh;
    document.getElementById('refreshInterval').value = refreshInterval;

    // 根据开关状态显示或隐藏刷新间隔输入框
    const intervalContainer = document.getElementById('refreshIntervalContainer');
    intervalContainer.style.display = autoRefresh ? 'flex' : 'none';
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