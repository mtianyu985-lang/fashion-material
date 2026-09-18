/* ============================================
   服装设计素材库 · 主逻辑
   ============================================ */

// ========== XSS 转义 ==========
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

// ========== 属性选项（可自定义） ==========
const DEFAULT_ATTRIBUTE_OPTIONS = {
  style: [
    { value: '优雅', label: '优雅' }, { value: '简约', label: '简约' },
    { value: '复古', label: '复古' }, { value: '街头', label: '街头' },
    { value: '职场', label: '职场' }, { value: '休闲', label: '休闲' },
  ],
  season: [
    { value: '春', label: '春' }, { value: '夏', label: '夏' },
    { value: '秋', label: '秋' }, { value: '冬', label: '冬' },
    { value: '四季', label: '四季' },
  ],
  purpose: [
    { value: '日常', label: '日常' }, { value: '通勤', label: '通勤' },
    { value: '宴会', label: '宴会' }, { value: '运动', label: '运动' },
    { value: '秀场', label: '秀场' },
  ],
};
let ATTRIBUTE_OPTIONS = JSON.parse(JSON.stringify(DEFAULT_ATTRIBUTE_OPTIONS));

// ========== 全局状态 ==========
const state = {
  currentCategory: 'all',
  currentView: 'library',
  currentAsset: null,
  searchQuery: '',
  assets: [],
  categories: [],
  eventsBound: false,
  filters: { style: [], season: [], purpose: [] },
  selectedTags: [],
  showFilterPanel: false,
  favoriteIds: new Set(),
  trashSelected: new Set(),
  pageSize: 50,
  currentPage: 0,
  displayMode: 'scroll',
  hasMore: true,
  sortOrder: 'newest',
  isLoading: false,
};

// ========== 自动备份 ==========
function setupAutoBackup() {
  const enabled = localStorage.getItem('autoBackupEnabled') !== 'false';
  if (!enabled) return;
  const lastBackup = localStorage.getItem('lastBackupTime');
  const week = 7 * 24 * 60 * 60 * 1000;
  if (lastBackup && Date.now() - parseInt(lastBackup) < week) return;
  performAutoBackup();
}

async function performAutoBackup() {
  try {
    const data = await db.exportAll();
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '素材库备份_' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    localStorage.setItem('lastBackupTime', Date.now().toString());
    showToast('自动备份完成');
  } catch (err) {
    console.error('自动备份失败:', err);
  }
}

async function backupBeforeImport() {
  try {
    const data = await db.exportAll();
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '导入前备份_' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('导入前备份已保存');
  } catch (err) {
    console.error('备份失败:', err);
  }
}

// ========== 初始化 ==========
async function init() {
  try {
    const isFileProtocol = location.protocol === 'file:';
    console.log('📍 当前协议:', location.protocol);
    console.log('📍 IndexedDB 支持:', !!window.indexedDB);

    if (navigator.storage && navigator.storage.persist) {
      const persisted = await navigator.storage.persist();
      console.log(persisted ? '✅ 持久化存储已启用' : '⚠️ 持久化存储申请被拒绝');
    }

    await db.init();
    console.log('✅ IndexedDB 初始化成功');

    await db.initCategories();
    console.log('✅ 分类初始化成功');
    
    // 分类去重
    const dupCount = await db.deduplicateCategories();
    if (dupCount > 0) console.log('已清理重复分类:', dupCount, '个');

    const cleaned = await db.cleanupExpiredTrash();
    if (cleaned > 0) console.log(`🗑️ 已自动清理 ${cleaned} 个过期素材`);

    // 加载自定义属性选项
    const savedAttr = await db.getMeta('attributeOptions');
    if (savedAttr) ATTRIBUTE_OPTIONS = savedAttr;

    state.categories = await db.getAllCategories();
    console.log('分类数量:', state.categories.length);
    state.assets = await db.getAllAssets();
    state.favoriteIds = new Set(await db.getMeta('favoriteIds') || []);

    renderApp();
    bindEvents();

    setupAutoBackup();
    console.log('✅ 素材库已初始化');
  } catch (err) {
    console.error('❌ 初始化失败:', err);
    const main = document.getElementById('main');
    const isFile = location.protocol === 'file:';
    main.innerHTML = `
      <div class="empty-state" style="padding:40px;text-align:left;">
        <div class="empty-state__icon">⚠️</div>
        <h3 style="margin:16px 0 8px;">初始化失败</h3>
        <p style="color:var(--text-secondary);margin-bottom:16px;">${esc(err.message || String(err))}</p>
        <details style="margin-bottom:16px;font-size:0.8125rem;color:var(--text-secondary);">
          <summary>错误详情</summary>
          <pre style="margin-top:8px;padding:12px;background:var(--bg-card);border-radius:var(--radius);overflow-x:auto;white-space:pre-wrap;">${esc(err.stack || String(err))}</pre>
        </details>
        ${isFile ? `
          <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:var(--radius);padding:16px;margin-bottom:16px;">
            <strong>⚠️ 检测到 file:// 协议</strong>
            <p style="margin:8px 0 0;font-size:0.875rem;">
              直接双击打开 HTML 文件可能导致 IndexedDB 不可用。<br>
              <strong>解决方案</strong>：请双击运行「启动本地服务器.bat」，然后访问 http://localhost:8080
            </p>
          </div>
        ` : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn--primary" onclick="location.reload()">🔄 刷新重试</button>
          <button class="btn btn--secondary" onclick="exportData()">📦 导出备份</button>
          <button class="btn btn--danger" onclick="resetDatabase()">🗑️ 重置数据库</button>
        </div>
      </div>
    `;
  }
}

async function resetDatabase() {
  if (!confirm('确定重置数据库？这会清除所有数据（建议先导出备份）')) return;
  try {
    const req = indexedDB.deleteDatabase('FashionMaterialDB');
    req.onsuccess = () => {
      showToast('数据库已重置，正在重新初始化...');
      setTimeout(() => location.reload(), 500);
    };
    req.onerror = () => showToast('重置失败: ' + req.error?.message);
    req.onblocked = () => showToast('数据库被占用，请关闭其他标签页后重试');
  } catch (err) {
    console.error('重置失败:', err);
    showToast('重置失败: ' + err.message);
  }
}

// ========== 渲染入口 ==========
function renderApp() {
  renderHeader();
  renderFilterTabs();
  renderMasonry();
  renderBottomBar();
  renderCategoryList();
}

// ========== 顶部标题栏 ==========
function renderHeader() {
  const header = document.getElementById('header');
  header.innerHTML = `
    <h1 class="header__title">素材库</h1>
    <div class="header__actions">
      <button class="header__btn header__btn--fav" onclick="switchToFavorites()" title="我的收藏">⭐</button>
      <button class="header__btn" onclick="openSettings()" title="设置">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>
      </button>
    </div>
  `;
}

// ========== 筛选标签栏 ==========
function renderFilterTabs() {
  const searchBar = document.getElementById('search-bar');
  const filterTabs = document.getElementById('filter-tabs');

  const hasActiveFilters = Object.values(state.filters).some(v => v) || state.selectedTags.length > 0;

  searchBar.innerHTML = `
    <div style="display:flex;gap:8px;">
      <input type="text" class="search-bar__input" placeholder="搜索素材..."
             value="${esc(state.searchQuery)}" oninput="handleSearch(this.value)" style="flex:1;">
      <button onclick="toggleFilterPanel()"
              style="padding:0 12px;background:${hasActiveFilters ? 'var(--accent)' : 'var(--bg-card)'};border:1px solid var(--border);border-radius:var(--radius);font-size:0.8125rem;cursor:pointer;">
        筛选${hasActiveFilters ? '(' + getActiveFilterCount() + ')' : ''}
      </button>
    </div>
  `;

  // 按 order 排序
  const sorted = [...state.categories].sort((a, b) => (a.order || 0) - (b.order || 0));
  const categories = [
    { id: 'all', name: '全部' },
    ...sorted
  ];

  // 筛选栏：横向滑动 + 右侧「▾ 全部」按钮
  filterTabs.innerHTML = categories.map(cat => `
    <button class="filter-tab ${state.currentCategory === cat.id ? 'active' : ''}"
            onclick="setCategory('${cat.id}')">
      ${esc(cat.name)}
    </button>
  `).join('') + `
    <button class="filter-tab filter-tab--more" onclick="toggleAllCategoriesPanel()">
      ▾ 全部
    </button>
  `;

  if (state.showFilterPanel) {
    renderFilterPanel();
  }
}

function toggleFilterPanel() {
  state.showFilterPanel = !state.showFilterPanel;
  renderFilterTabs();
  renderMasonry();
}

function getActiveFilterCount() {
  let count = 0;
  count += state.filters.style.length;
  count += state.filters.season.length;
  count += state.filters.purpose.length;
  count += state.selectedTags.length;
  return count;
}

function renderFilterPanel() {
  const searchBar = document.getElementById('search-bar');
  // 先移除旧面板，避免重复渲染
  const existPanel = document.getElementById('filter-panel');
  if (existPanel) existPanel.remove();
  const panel = document.createElement('div');
  panel.id = 'filter-panel';
  panel.style.cssText = 'padding:16px;background:var(--bg-card);border-bottom:1px solid var(--border);';

  const allTags = new Set();
  state.assets.forEach(a => (a.tags || []).forEach(t => allTags.add(t)));

  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <span style="font-size:0.8125rem;font-weight:500;">属性筛选</span>
      <div style="display:flex;gap:8px;">
        <button onclick="clearAllFilters()" style="font-size:0.75rem;color:var(--accent);background:none;border:none;cursor:pointer;">清除全部</button>
        <button onclick="toggleFilterPanel()" style="font-size:0.75rem;color:var(--text-secondary);background:none;border:none;cursor:pointer;">收起 ▲</button>
      </div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
      ${ATTRIBUTE_OPTIONS.style.map(opt => `
        <button onclick="toggleFilter('style','${opt.value}')"
                style="padding:4px 12px;font-size:0.8125rem;border:1px solid ${state.filters.style.includes(opt.value) ? 'var(--accent)' : 'var(--border)'};border-radius:16px;background:${state.filters.style.includes(opt.value) ? 'var(--accent)' : 'transparent'};color:${state.filters.style.includes(opt.value) ? 'white' : 'var(--text-secondary)'};cursor:pointer;">
          ${opt.label}
        </button>
      `).join('')}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
      ${ATTRIBUTE_OPTIONS.season.map(opt => `
        <button onclick="toggleFilter('season','${opt.value}')"
                style="padding:4px 12px;font-size:0.8125rem;border:1px solid ${state.filters.season.includes(opt.value) ? 'var(--accent)' : 'var(--border)'};border-radius:16px;background:${state.filters.season.includes(opt.value) ? 'var(--accent)' : 'transparent'};color:${state.filters.season.includes(opt.value) ? 'white' : 'var(--text-secondary)'};cursor:pointer;">
          ${opt.label}
        </button>
      `).join('')}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
      ${ATTRIBUTE_OPTIONS.purpose.map(opt => `
        <button onclick="toggleFilter('purpose','${opt.value}')"
                style="padding:4px 12px;font-size:0.8125rem;border:1px solid ${state.filters.purpose.includes(opt.value) ? 'var(--accent)' : 'var(--border)'};border-radius:16px;background:${state.filters.purpose.includes(opt.value) ? 'var(--accent)' : 'transparent'};color:${state.filters.purpose.includes(opt.value) ? 'white' : 'var(--text-secondary)'};cursor:pointer;">
          ${opt.label}
        </button>
      `).join('')}
    </div>
    ${allTags.size > 0 ? `
      <div style="margin-top:8px;">
        <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:6px;">标签</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${Array.from(allTags).slice(0, 20).map(tag => `
            <button onclick="toggleTag(this)" data-tag="${esc(tag)}"
                    style="padding:4px 12px;font-size:0.8125rem;border:1px solid ${state.selectedTags.includes(tag) ? 'var(--accent)' : 'var(--border)'};border-radius:16px;background:${state.selectedTags.includes(tag) ? 'var(--accent)' : 'transparent'};color:${state.selectedTags.includes(tag) ? 'white' : 'var(--text-secondary)'};cursor:pointer;">
              #${esc(tag)}
            </button>
          `).join('')}
        </div>
      </div>
    ` : ''}
  `;

  searchBar.after(panel);
}

function toggleFilter(dimension, value) {
  const arr = state.filters[dimension];
  const idx = arr.indexOf(value);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push(value);
  renderFilterTabs();
  renderMasonry();
}

function toggleTag(btn) {
  const tag = btn.dataset.tag;
  const idx = state.selectedTags.indexOf(tag);
  if (idx >= 0) {
    state.selectedTags.splice(idx, 1);
  } else {
    state.selectedTags.push(tag);
  }
  renderFilterTabs();
  renderMasonry();
}

function clearAllFilters() {
  state.filters = { style: [], season: [], purpose: [] };
  state.selectedTags = [];
  state.searchQuery = '';
  renderFilterTabs();
  renderMasonry();
}

// ========== 搜索 ==========
function handleSearch(query) {
  state.searchQuery = query;
  renderMasonry();
}

function setCategory(id) {
  state.currentCategory = id;
  renderFilterTabs();
  renderMasonry();
}



// ========== 全部分类面板 ==========
function toggleAllCategoriesPanel() {
  const existing = document.getElementById('all-categories-panel');
  if (existing) {
    existing.remove();
    return;
  }

  const sorted = [...state.categories].sort((a, b) => (a.order || 0) - (b.order || 0));
  const panel = document.createElement('div');
  panel.id = 'all-categories-panel';
  panel.className = 'all-categories-panel';
  panel.innerHTML = `
    <div class="all-categories-panel__header">
      <span>全部分类 (${sorted.length})</span>
      <button onclick="document.getElementById('all-categories-panel').remove()" style="background:none;border:none;font-size:1.2rem;cursor:pointer;">×</button>
    </div>
    <div class="all-categories-panel__list">
      <button class="all-categories-panel__item ${state.currentCategory === 'all' ? 'active' : ''}"
              onclick="setCategory('all'); document.getElementById('all-categories-panel').remove();">
        📷 全部
      </button>
      ${sorted.map(cat => `
        <button class="all-categories-panel__item ${state.currentCategory === cat.id ? 'active' : ''}"
                onclick="setCategory('${cat.id}'); document.getElementById('all-categories-panel').remove();">
          ${cat.icon || '📁'} ${esc(cat.name)}
        </button>
      `).join('')}
    </div>
  `;

  document.body.appendChild(panel);

  // 点击外部关闭
  setTimeout(() => {
    document.addEventListener('click', function closePanel(e) {
      if (!panel.contains(e.target) && !e.target.classList.contains('filter-tab--more')) {
        panel.remove();
        document.removeEventListener('click', closePanel);
      }
    });
  }, 100);
}
// ========== 筛选逻辑 ==========
function getFilteredAssets() {
  let filtered = state.assets.filter(a => !a.deletedAt);

  if (state.currentCategory !== 'all') {
    filtered = filtered.filter(a => a.categoryId === state.currentCategory);
  }

  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    filtered = filtered.filter(a =>
      a.title.toLowerCase().includes(q) ||
      (a.tags && a.tags.some(t => t.toLowerCase().includes(q))) ||
      (a.note && a.note.toLowerCase().includes(q))
    );
  }

  ['style', 'season', 'purpose'].forEach(dim => {
    const sel = state.filters[dim];
    if (sel && sel.length > 0) {
      filtered = filtered.filter(a => {
        const v = a.attributes ? a.attributes[dim] : undefined;
        const vals = Array.isArray(v) ? v : (v ? [v] : []);
        return vals.some(x => sel.includes(x));
      });
    }
  });

  if (state.selectedTags.length > 0) {
    filtered = filtered.filter(a => state.selectedTags.every(tag => a.tags?.includes(tag)));
  }

  // 仅按时间排序，收藏不改变素材库原有排序
  filtered.sort((a, b) => {
    const aTime = new Date(a.createdAt).getTime();
    const bTime = new Date(b.createdAt).getTime();
    return state.sortOrder === 'newest' ? bTime - aTime : aTime - bTime;
  });

  return filtered;
}

// ========== 瀑布流渲染（分页） ==========
function renderMasonry() {
  const main = document.getElementById('main');
  const filtered = getFilteredAssets();
  state.currentPage = 0;
  state.hasMore = true;

  if (filtered.length === 0) {
    main.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">📷</div>
        <p class="empty-state__text">
          ${state.searchQuery ? '没有找到匹配的素材' : '还没有素材，点击底部 + 添加'}
        </p>
      </div>
    `;
    return;
  }

  const sortBar = `
    <div class="sort-bar">
      <span class="sort-bar__count">共 ${filtered.length} 张</span>
      <div class="sort-bar__actions">
        <button class="sort-bar__btn ${state.sortOrder === 'newest' ? 'active' : ''}" onclick="setSortOrder('newest')">最新</button>
        <button class="sort-bar__btn ${state.sortOrder === 'oldest' ? 'active' : ''}" onclick="setSortOrder('oldest')">最早</button>
        <button class="sort-bar__btn" onclick="toggleDisplayMode()">${state.displayMode === 'scroll' ? '📄 分页' : '♾️ 滚动'}</button>
      </div>
    </div>
  `;

  const totalPages = Math.ceil(filtered.length / state.pageSize);
  const batch = filtered.slice(0, state.pageSize);
  state.hasMore = filtered.length > state.pageSize;

  // 分页导航 UI（分页模式下始终显示）
  const paginationUI = state.displayMode === 'page' ? `
    <div class="pagination">
      <button class="pagination__btn" onclick="goToPage(0)" ${state.currentPage === 0 ? 'disabled' : ''}>首页</button>
      <button class="pagination__btn" onclick="goToPage(${state.currentPage - 1})" ${state.currentPage === 0 ? 'disabled' : ''}>上一页</button>
      <span class="pagination__info">${state.currentPage + 1} / ${totalPages || 1}</span>
      <button class="pagination__btn" onclick="goToPage(${state.currentPage + 1})" ${state.currentPage >= totalPages - 1 ? 'disabled' : ''}>下一页</button>
      <button class="pagination__btn" onclick="goToPage(${totalPages - 1})" ${state.currentPage >= totalPages - 1 ? 'disabled' : ''}>末页</button>
    </div>
  ` : '';

  main.innerHTML = sortBar + `
    <div class="masonry" id="masonry">
      ${batch.map(asset => renderAssetCard(asset)).join('')}
    </div>
    ${paginationUI}
    ${state.displayMode === 'scroll' && state.hasMore ? '<div id="load-more" class="load-more"><div class="load-more__spinner"></div>加载中...</div>' : ''}
    ${!state.hasMore ? '<div class="load-more load-more--end">已加载全部</div>' : ''}
  `;

  if (state.displayMode === 'scroll' && state.hasMore) {
    setupInfiniteScroll();
  }
}

// 跳转到指定页
function goToPage(page) {
  const filtered = getFilteredAssets();
  const totalPages = Math.ceil(filtered.length / state.pageSize);
  if (page < 0 || page >= totalPages) return;
  
  state.currentPage = page;
  const start = page * state.pageSize;
  const batch = filtered.slice(start, start + state.pageSize);
  state.hasMore = start + batch.length < filtered.length;

  const masonry = document.getElementById('masonry');
  if (masonry) {
    masonry.innerHTML = batch.map(asset => renderAssetCard(asset)).join('');
  }

  // 更新分页导航
  const pagination = document.querySelector('.pagination');
  if (pagination) {
    pagination.innerHTML = `
      <button class="pagination__btn" onclick="goToPage(0)" ${page === 0 ? 'disabled' : ''}>首页</button>
      <button class="pagination__btn" onclick="goToPage(${page - 1})" ${page === 0 ? 'disabled' : ''}>上一页</button>
      <span class="pagination__info">${page + 1} / ${totalPages}</span>
      <button class="pagination__btn" onclick="goToPage(${page + 1})" ${page >= totalPages - 1 ? 'disabled' : ''}>下一页</button>
      <button class="pagination__btn" onclick="goToPage(${totalPages - 1})" ${page >= totalPages - 1 ? 'disabled' : ''}>末页</button>
    `;
  }

  // 滚动到顶部
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function loadMoreAssets() {
  if (state.isLoading || !state.hasMore) return;
  state.isLoading = true;
  state.currentPage++;

  const filtered = getFilteredAssets();
  const start = state.currentPage * state.pageSize;
  const batch = filtered.slice(start, start + state.pageSize);

  if (batch.length === 0) {
    state.hasMore = false;
    const loadEl = document.getElementById('load-more');
    if (loadEl) {
      loadEl.className = 'load-more load-more--end';
      loadEl.textContent = '已加载全部';
    }
    state.isLoading = false;
    return;
  }

  const masonry = document.getElementById('masonry');
  if (masonry) {
    masonry.insertAdjacentHTML('beforeend', batch.map(a => renderAssetCard(a)).join(''));
  }

  state.hasMore = start + batch.length < filtered.length;
  const loadEl = document.getElementById('load-more');
  if (loadEl && !state.hasMore) {
    loadEl.className = 'load-more load-more--end';
    loadEl.textContent = '已加载全部';
  }
  state.isLoading = false;
}

function setupInfiniteScroll() {
  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && state.hasMore && !state.isLoading) {
      loadMoreAssets();
    }
  }, { rootMargin: '200px' });

  const loadEl = document.getElementById('load-more');
  if (loadEl) observer.observe(loadEl);
}

function setSortOrder(order) {
  state.sortOrder = order;
  renderMasonry();
}

function toggleDisplayMode() {
  state.displayMode = state.displayMode === 'scroll' ? 'page' : 'scroll';
  renderMasonry();
}

// ========== 素材卡片 ==========
function renderAssetCard(asset) {
  const tags = (asset.tags || []).slice(0, 3);
  const isFav = state.favoriteIds.has(asset.id);
  return `
    <div class="masonry__item" onclick="openDetail('${asset.id}')">
      <div class="masonry__actions">
        <button class="masonry__fav ${isFav ? 'masonry__fav--active' : ''}" onclick="event.stopPropagation(); toggleFavorite('${asset.id}')" title="${isFav ? '取消收藏' : '收藏'}">${isFav ? '★' : '☆'}</button>
        <button class="masonry__canvas-btn" onclick="event.stopPropagation(); openCanvas('${asset.id}')" title="画板">✏️</button>
        <button class="masonry__delete" onclick="event.stopPropagation(); deleteAsset('${asset.id}')" title="删除">×</button>
      </div>
      <img class="masonry__img" src="${asset.thumb || asset.dataUrl}" alt="${esc(asset.title)}" loading="lazy">
      <div class="masonry__info">
        <div class="masonry__title">${esc(asset.title)}</div>
        <div class="masonry__tags">
          ${tags.map(t => `<span class="masonry__tag">${esc(t)}</span>`).join('')}
        </div>
      </div>
    </div>
  `;
}

// ========== 底部导航栏 ==========
function renderBottomBar() {
  const bar = document.getElementById('bottom-bar');
  bar.innerHTML = `
    <button class="bottom-bar__item ${state.currentView === 'library' || state.currentView === 'favorites' ? 'active' : ''}"
            onclick="switchView('library')">
      <span class="bottom-bar__icon">📷</span>
      <span>素材库</span>
    </button>
    <button class="bottom-bar__item" onclick="openImport()">
      <span class="bottom-bar__icon">➕</span>
      <span>添加</span>
    </button>
    <button class="bottom-bar__item ${state.currentView === 'categories' ? 'active' : ''}"
            onclick="switchView('categories')">
      <span class="bottom-bar__icon">📁</span>
      <span>分类</span>
    </button>
    <button class="bottom-bar__item ${state.currentView === 'trash' ? 'active' : ''}"
            onclick="switchView('trash')">
      <span class="bottom-bar__icon">🗑️</span>
      <span>回收站</span>
    </button>
  `;
}

// ========== 分类列表 ==========
function renderCategoryList() {
  if (state.currentView !== 'categories') return;

  const main = document.getElementById('main');
  const counts = {};
  state.assets.filter(a => !a.deletedAt).forEach(a => {
    counts[a.categoryId] = (counts[a.categoryId] || 0) + 1;
  });

  const categories = state.categories;

  main.innerHTML = `
    <div style="padding:16px;">
      <button class="btn btn--primary" style="width:100%;margin-bottom:16px;" onclick="openNewCategory()">
        + 新增分类
      </button>
      <div style="font-size:0.8125rem;color:var(--text-secondary);margin-bottom:12px;">分类 (${categories.length})</div>
      ${categories.map((cat, idx) => `
        <div class="category-item" onclick="setCategory('${cat.id}'); switchView('library');">
          <span class="category-item__icon">${cat.icon || '📁'}</span>
          <span class="category-item__name">${esc(cat.name)}</span>
          <span class="category-item__count">${counts[cat.id] || 0}</span>
          <div class="category-item__actions">
            <button class="category-item__btn" onclick="event.stopPropagation(); moveCategoryUp('${cat.id}')" ${idx === 0 ? 'disabled' : ''} title="上移">↑</button>
            <button class="category-item__btn" onclick="event.stopPropagation(); moveCategoryDown('${cat.id}')" ${idx === categories.length - 1 ? 'disabled' : ''} title="下移">↓</button>
            <button class="category-item__btn" onclick="event.stopPropagation(); openEditCategory('${cat.id}')" title="编辑">✏️</button>
            <button class="category-item__btn category-item__btn--danger" onclick="event.stopPropagation(); deleteCategory('${cat.id}')" title="删除">🗑️</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// 上移分类
async function moveCategoryUp(id) {
  const idx = state.categories.findIndex(c => c.id === id);
  if (idx <= 0) return;
  // 交换位置
  [state.categories[idx - 1], state.categories[idx]] = [state.categories[idx], state.categories[idx - 1]];
  // 保存顺序
  await saveCategoryOrder();
  renderCategoryList();
  renderFilterTabs();
  showToast('分类已上移');
}

// 下移分类
async function moveCategoryDown(id) {
  const idx = state.categories.findIndex(c => c.id === id);
  if (idx < 0 || idx >= state.categories.length - 1) return;
  // 交换位置
  [state.categories[idx], state.categories[idx + 1]] = [state.categories[idx + 1], state.categories[idx]];
  // 保存顺序
  await saveCategoryOrder();
  renderCategoryList();
  renderFilterTabs();
  showToast('分类已下移');
}

// 保存分类顺序到数据库
async function saveCategoryOrder() {
  for (let i = 0; i < state.categories.length; i++) {
    state.categories[i].order = i;
    await db.updateCategory(state.categories[i]);
  }
}

// ========== 回收站 ==========
async function renderTrash() {
  if (state.currentView !== 'trash') return;

  const main = document.getElementById('main');
  const deleted = await db.getDeletedAssets();

  if (deleted.length === 0) {
    main.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">🗑️</div>
        <p class="empty-state__text">回收站是空的</p>
      </div>
    `;
    return;
  }

  state.trashSelected = state.trashSelected || new Set();
  const selected = state.trashSelected;
  const allSelected = deleted.length > 0 && deleted.every(a => selected.has(a.id));

  main.innerHTML = `
    <div class="trash-toolbar">
      <label class="trash-check-all">
        <input type="checkbox" ${allSelected ? 'checked' : ''} onchange="trashSelectAll(this.checked)">
        <span>全选 (${selected.size}/${deleted.length})</span>
      </label>
      <div class="trash-actions">
        <button class="btn btn--secondary" onclick="batchRestore()" ${selected.size === 0 ? 'disabled' : ''}>恢复选中</button>
        <button class="btn btn--danger" onclick="batchDelete()" ${selected.size === 0 ? 'disabled' : ''}>彻底删除</button>
      </div>
    </div>
    <div class="masonry">
      ${deleted.map(asset => `
        <div class="masonry__item ${selected.has(asset.id) ? 'masonry__item--selected' : ''}">
          <input type="checkbox" class="trash-checkbox" ${selected.has(asset.id) ? 'checked' : ''}
                 onchange="toggleTrashSelect('${asset.id}', this.checked)">
          <img class="masonry__img" src="${asset.thumb || asset.dataUrl}" alt="${esc(asset.title)}" loading="lazy">
          <div class="masonry__info">
            <div class="masonry__title">${esc(asset.title)}</div>
            <div class="trash-countdown">${getTrashCountdown(asset.deletedAt)}</div>
            <div style="display:flex;gap:8px;margin-top:8px;">
              <button class="btn btn--secondary" onclick="restoreAsset('${asset.id}')">恢复</button>
              <button class="btn btn--danger" onclick="permanentlyDelete('${asset.id}')">彻底删除</button>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function getTrashCountdown(deletedAt) {
  if (!deletedAt) return '';
  const deletedTime = new Date(deletedAt).getTime();
  const elapsed = Date.now() - deletedTime;
  const remaining = Math.max(0, 30 - Math.floor(elapsed / (24 * 60 * 60 * 1000)));
  if (remaining <= 3) {
    return '<span class="trash-countdown--urgent">⚠️ 剩余 ' + remaining + ' 天自动删除</span>';
  }
  return '<span class="trash-countdown--normal">🕐 ' + remaining + ' 天后自动删除</span>';
}

// ========== 回收站批量操作 ==========
function toggleTrashSelect(id, checked) {
  if (!state.trashSelected) state.trashSelected = new Set();
  if (checked) state.trashSelected.add(id);
  else state.trashSelected.delete(id);
  renderTrash();
}

function trashSelectAll(checked) {
  if (!state.trashSelected) state.trashSelected = new Set();
  if (checked) {
    db.getDeletedAssets().then(deleted => {
      deleted.forEach(a => state.trashSelected.add(a.id));
      renderTrash();
    });
  } else {
    state.trashSelected.clear();
    renderTrash();
  }
}

async function batchRestore() {
  const selected = state.trashSelected;
  if (!selected || selected.size === 0) return;
  if (!confirm('确定恢复选中的 ' + selected.size + ' 个素材？')) return;
  for (const id of selected) await db.restoreAsset(id);
  state.assets = await db.getAllAssets();
  state.trashSelected = new Set();
  await renderTrash();
  showToast('已恢复 ' + selected.size + ' 个素材');
}

async function batchDelete() {
  const selected = state.trashSelected;
  if (!selected || selected.size === 0) return;
  if (!confirm('彻底删除 ' + selected.size + ' 个素材？删除后无法恢复！')) return;
  for (const id of selected) await db.permanentlyDeleteAsset(id);
  state.assets = await db.getAllAssets();
  state.trashSelected = new Set();
  await renderTrash();
  showToast('已彻底删除 ' + selected.size + ' 个素材');
}

// ========== 收藏功能 ==========
async function toggleFavorite(id) {
  if (state.favoriteIds.has(id)) {
    state.favoriteIds.delete(id);
  } else {
    state.favoriteIds.add(id);
  }
  await db.setMeta('favoriteIds', Array.from(state.favoriteIds));
  if (state.currentView === 'favorites') {
    renderFavorites();
  } else {
    renderMasonry();
  }
}

function switchToFavorites() {
  state.currentView = 'favorites';
  state.currentCategory = 'all';
  renderFavorites();
  renderBottomBar();
}

function renderFavorites() {
  const main = document.getElementById('main');
  const searchBar = document.getElementById('search-bar');
  const filterTabs = document.getElementById('filter-tabs');
  searchBar.style.display = '';
  filterTabs.style.display = '';

  let favAssets = state.assets.filter(a => state.favoriteIds.has(a.id) && !a.deletedAt);

  if (state.currentCategory !== 'all') favAssets = favAssets.filter(a => a.categoryId === state.currentCategory);
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    favAssets = favAssets.filter(a =>
      a.title.toLowerCase().includes(q) ||
      (a.tags && a.tags.some(t => t.toLowerCase().includes(q))) ||
      (a.note && a.note.toLowerCase().includes(q))
    );
  }
  if (state.filters.style) favAssets = favAssets.filter(a => a.attributes?.style === state.filters.style);
  if (state.filters.season) favAssets = favAssets.filter(a => a.attributes?.season === state.filters.season);
  if (state.filters.purpose) favAssets = favAssets.filter(a => a.attributes?.purpose === state.filters.purpose);
  if (state.selectedTags.length > 0) favAssets = favAssets.filter(a => state.selectedTags.every(tag => a.tags?.includes(tag)));

  if (favAssets.length === 0) {
    main.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">⭐</div>
        <p class="empty-state__text">${state.searchQuery || state.selectedTags.length ? '没有匹配的收藏素材' : '还没有收藏，点击素材卡片左上角 ☆ 收藏'}</p>
      </div>
    `;
    return;
  }

  main.innerHTML = '<div class="masonry">' + favAssets.map(a => renderAssetCard(a)).join('') + '</div>';
}

// ========== 视图切换 ==========
async function switchView(view) {
  state.currentView = view;

  const searchBar = document.getElementById('search-bar');
  const filterTabs = document.getElementById('filter-tabs');

  if (view === 'library') {
    searchBar.style.display = '';
    filterTabs.style.display = '';
    renderFilterTabs();
    renderMasonry();
  } else if (view === 'favorites') {
    renderFavorites();
  } else if (view === 'categories') {
    searchBar.style.display = 'none';
    filterTabs.style.display = 'none';
    renderCategoryList();
  } else if (view === 'trash') {
    searchBar.style.display = 'none';
    filterTabs.style.display = 'none';
    await renderTrash();
  }

  renderBottomBar();
}

// ========== 工具函数 ==========
function getCategoryName(id) {
  const cat = state.categories.find(c => c.id === id);
  return cat ? cat.name : '未分类';
}

async function checkStorageStatus() {
  if (navigator.storage && navigator.storage.estimate) {
    const est = await navigator.storage.estimate();
    const usedMB = (est.usage / 1024 / 1024).toFixed(1);
    const quotaMB = (est.quota / 1024 / 1024).toFixed(0);
    console.log('存储: ' + usedMB + 'MB / ' + quotaMB + 'MB');
  }
}

// ========== 设置/导出/导入 ==========
function openSettings() {
  const overlay = document.getElementById('modal-overlay');
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal__header">
        <h3 class="modal__title">设置</h3>
        <button class="modal__close" onclick="closeModal()">×</button>
      </div>
      <div class="modal__body">
        <button class="btn btn--primary" style="width:100%;margin-bottom:8px;" onclick="exportData()">📦 导出备份</button>
        <button class="btn btn--secondary" style="width:100%;margin-bottom:16px;" onclick="importBackup()">📥 导入备份</button>
        <div id="storage-info" style="font-size:0.8125rem;color:var(--text-secondary);text-align:center;">加载中...</div>
      </div>
    </div>
  `;
  overlay.classList.add('open');
  overlay.style.display = 'flex';

  getStorageInfo().then(info => {
    const el = document.getElementById('storage-info');
    if (el) {
      el.innerHTML = '<div>素材: ' + info.totalAssets + ' 张 | 回收站: ' + info.deletedAssets + ' 张</div><div>占用: ' + info.totalSizeMB + ' MB</div>';
    }
  });
}

async function getStorageInfo() {
  const assets = await db.getAllAssets();
  const deleted = await db.getDeletedAssets();
  let totalSize = 0;
  for (const asset of [...assets, ...deleted]) {
    if (asset.thumb) totalSize += asset.thumb.length || 0;
    if (asset.dataUrl) totalSize += asset.dataUrl.length || 0;
    if (asset.originalUrl) totalSize += asset.originalUrl.length || 0;
    if (asset.canvasData) totalSize += JSON.stringify(asset.canvasData).length;
  }
  return {
    totalAssets: assets.length,
    deletedAssets: deleted.length,
    totalSize,
    totalSizeMB: (totalSize / 1024 / 1024).toFixed(1),
  };
}

async function exportData() {
  try {
    showToast('正在导出...');
    const data = await db.exportAll();
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '素材库备份_' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('导出完成');
  } catch (err) {
    console.error('导出失败:', err);
    showToast('导出失败: ' + err.message);
  }
}

function importBackup() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      showToast('正在导入...');
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.assets || !Array.isArray(data.assets)) throw new Error('备份文件格式错误');

      // 导入前自动备份
      await backupBeforeImport();

      if (data.categories && Array.isArray(data.categories)) {
        for (const cat of data.categories) {
          try { await db.addCategory(cat); } catch (e) {}
        }
      }

      let imported = 0;
      for (const asset of data.assets) {
        try {
          await db.addAsset(asset);
          imported++;
        } catch (e) {
          try { await db.updateAsset(asset); imported++; } catch (e2) {}
        }
      }

      if (data.deletedAssets && Array.isArray(data.deletedAssets)) {
        for (const asset of data.deletedAssets) {
          try { await db.addAsset(asset); imported++; } catch (e) {}
        }
      }

      if (data.deletedPresets && Array.isArray(data.deletedPresets)) {
        await db.setMeta('deletedPresets', data.deletedPresets);
      }

      if (data.favoriteIds && Array.isArray(data.favoriteIds)) {
        await db.setMeta('favoriteIds', data.favoriteIds);
      }

      state.categories = await db.getAllCategories();
      state.assets = await db.getAllAssets();
      state.favoriteIds = new Set(await db.getMeta('favoriteIds') || []);
      renderApp();
      showToast('导入完成！共恢复 ' + imported + ' 个素材');
    } catch (err) {
      console.error('导入失败:', err);
      showToast('导入失败: ' + err.message);
    }
  };
  input.click();
}

function showToast(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

// ========== 分类管理 ==========
function openNewCategory() {
  const overlay = document.getElementById('modal-overlay');
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal__header">
        <h3 class="modal__title">新建分类</h3>
        <button class="modal__close" onclick="closeModal()">×</button>
      </div>
      <div class="modal__body">
        <div class="form-group">
          <label class="form-label">分类名称</label>
          <input type="text" class="form-input" id="new-cat-name" placeholder="输入分类名称" maxlength="20">
        </div>
        <div class="form-group">
          <label class="form-label">选择图标</label>
          <input type="hidden" id="new-cat-icon" value="📁">
          <div id="icon-picker" style="display:flex;flex-wrap:wrap;gap:8px;">
            ${getIconOptions().map(icon => `
              <button class="icon-option" onclick="selectIcon(this, '${icon}')"
                      style="width:40px;height:40px;font-size:1.25rem;border:2px solid ${icon === '📁' ? 'var(--accent)' : 'var(--border)'};border-radius:var(--radius);background:var(--bg-card);cursor:pointer;">
                ${icon}
              </button>
            `).join('')}
          </div>
        </div>
        <button class="btn btn--primary" style="width:100%;margin-top:16px;" onclick="createCategory()">创建</button>
      </div>
    </div>
  `;
  overlay.classList.add('open');
  overlay.style.display = 'flex';
}

function selectIcon(btn, icon) {
  document.getElementById('new-cat-icon').value = icon;
  document.querySelectorAll('.icon-option').forEach(b => b.style.borderColor = 'var(--border)');
  btn.style.borderColor = 'var(--accent)';
}

function getIconOptions() {
  return ['📁', '👗', '🧵', '🎨', '💎', '📸', '✂️', '🪡', '📐', '🎭', '🌟', '💼', '👜', '👒', '🥿', '🧣'];
}

async function createCategory() {
  const name = document.getElementById('new-cat-name').value.trim();
  const icon = document.getElementById('new-cat-icon').value;
  if (!name) { showToast('请输入分类名称'); return; }

  const category = {
    id: 'cat_' + Date.now(),
    name,
    icon,
    isPreset: false,
    parentId: null,
    order: state.categories.length,
  };

  // 去重检查
  if (state.categories.some(c => c.name === name)) {
    showToast('已存在同名分类「' + name + '」');
    return;
  }

  await db.addCategory(category);
  state.categories = await db.getAllCategories();
  closeModal();
  renderCategoryList();
  renderFilterTabs();
  showToast('分类已创建');
}

function openEditCategory(id) {
  const cat = state.categories.find(c => c.id === id);
  if (!cat) return;

  const overlay = document.getElementById('modal-overlay');
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal__header">
        <h3 class="modal__title">编辑分类</h3>
        <button class="modal__close" onclick="closeModal()">×</button>
      </div>
      <div class="modal__body">
        <div class="form-group">
          <label class="form-label">分类名称</label>
          <input type="text" class="form-input" id="edit-cat-name" value="${esc(cat.name)}" maxlength="20">
        </div>
        <div class="form-group">
          <label class="form-label">选择图标</label>
          <input type="hidden" id="edit-cat-icon" value="${cat.icon || '📁'}">
          <div id="icon-picker" style="display:flex;flex-wrap:wrap;gap:8px;">
            ${getIconOptions().map(icon => `
              <button class="icon-option" onclick="selectIcon(this, '${icon}')"
                      style="width:40px;height:40px;font-size:1.25rem;border:2px solid ${icon === cat.icon ? 'var(--accent)' : 'var(--border)'};border-radius:var(--radius);background:var(--bg-card);cursor:pointer;">
                ${icon}
              </button>
            `).join('')}
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:16px;">
          <button class="btn btn--primary" style="flex:1;" onclick="saveEditCategory('${id}')">保存</button>
          ${!cat.isPreset ? '<button class="btn btn--danger" onclick="deleteCategory(\'' + id + '\')">删除</button>' : ''}
        </div>
      </div>
    </div>
  `;
  overlay.classList.add('open');
  overlay.style.display = 'flex';
}

async function saveEditCategory(id) {
  const cat = state.categories.find(c => c.id === id);
  if (!cat) return;
  const newName = document.getElementById('edit-cat-name').value.trim();
  if (!newName) { showToast('请输入分类名称'); return; }
  
  // 去重检查（排除自身）
  if (state.categories.some(c => c.name === newName && c.id !== id)) {
    showToast('已存在同名分类「' + newName + '」');
    return;
  }
  
  cat.name = newName;
  cat.icon = document.getElementById('edit-cat-icon').value;
  await db.updateCategory(cat);
  state.categories = await db.getAllCategories();
  closeModal();
  renderCategoryList();
  renderFilterTabs();
  showToast('分类已更新');
}

async function deleteCategory(id) {
  const cat = state.categories.find(c => c.id === id);
  if (!cat) return;
  const assetCount = state.assets.filter(a => a.categoryId === id).length;
  const msg = cat.isPreset
    ? '确定删除预设分类「' + cat.name + '」？' + (assetCount > 0 ? '该分类下有 ' + assetCount + ' 个素材。' : '')
    : '确定删除分类「' + cat.name + '」？' + (assetCount > 0 ? '该分类下有 ' + assetCount + ' 个素材将变为未分类。' : '');
  if (!confirm(msg)) return;
  try {
    await db.deleteCategory(id);
    state.categories = await db.getAllCategories();
    renderCategoryList();
    renderFilterTabs();
    showToast('分类已删除');
  } catch (err) {
    showToast('删除失败: ' + err.message);
  }
}

// ========== 收集/导入 ==========
function openImport() {
  const overlay = document.getElementById('modal-overlay');
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal__header">
        <h3 class="modal__title">添加素材</h3>
        <button class="modal__close" onclick="closeModal()">×</button>
      </div>
      <div class="modal__body">
        <div style="border:2px dashed var(--border);border-radius:var(--radius);padding:40px;text-align:center;cursor:pointer;"
             onclick="document.getElementById('file-input').click()"
             ondragover="event.preventDefault();this.style.borderColor='var(--accent)'"
             ondragleave="this.style.borderColor='var(--border)'"
             ondrop="event.preventDefault();handleFiles(event.dataTransfer.files)">
          <div style="font-size:2rem;margin-bottom:8px;">📷</div>
          <p style="color:var(--text-secondary);">点击选择或拖拽图片到此处</p>
          <p style="font-size:0.75rem;color:var(--text-secondary);">支持 JPG/PNG/WebP</p>
        </div>
        <input type="file" id="file-input" accept="image/*" multiple style="display:none;" onchange="handleFiles(this.files)">
      </div>
    </div>
  `;
  overlay.classList.add('open');
  overlay.style.display = 'flex';
}

async function handleFiles(files) {
  for (const file of files) {
    if (file.type.startsWith('image/')) {
      await importFile(file);
    }
  }
  closeModal();
}

async function importFile(file) {
  try {
    // 重复检测
    const existing = state.assets.find(a => a.fileName === file.name && a.fileSize === file.size && !a.deletedAt);
    if (existing) {
      if (!confirm('「' + file.name + '」已存在，是否仍要导入？')) return;
    }

    const thumb = await createThumbnail(file, 300);
    const compressed = await createThumbnail(file, 1200);
    const original = await fileToDataUrl(file);

    const asset = {
      id: 'asset_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      title: file.name.replace(/\.[^.]+$/, ''),
      categoryId: state.currentCategory !== 'all' ? state.currentCategory : 'style',
      tags: [],
      attributes: { style: '', season: '', purpose: '' },
      mediaType: 'image',
      dataUrl: compressed,
      thumb: thumb,
      originalUrl: original,
      fileName: file.name,
      fileSize: file.size,
      note: '',
      canvasData: null,
      projectId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    };

    await db.addAsset(asset);
    state.assets = await db.getAllAssets();
    renderMasonry();
    showToast(existing ? '素材已添加（重复）' : '素材已添加');
  } catch (err) {
    console.error('导入失败:', err);
    showToast('导入失败');
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.readAsDataURL(file);
  });
}

function createThumbnail(file, maxSize) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxSize || h > maxSize) {
          if (w > h) { h = h * maxSize / w; w = maxSize; }
          else { w = w * maxSize / h; h = maxSize; }
        }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function downloadOriginal(id) {
  db.getAsset(id).then(asset => {
    if (!asset || !asset.originalUrl) return;
    const a = document.createElement('a');
    a.href = asset.originalUrl;
    a.download = asset.fileName || 'image.jpg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('正在下载原图...');
  });
}

// ========== 详情页 ==========
async function openDetail(id) {
  const asset = await db.getAsset(id);
  if (!asset) return;

  state.currentAsset = asset;
  state.currentView = 'detail';

  const overlay = document.getElementById('detail-overlay');
  overlay.innerHTML = `
    <div class="detail__header">
      <button class="detail__back" onclick="closeDetail()">←</button>
      <h2 class="detail__title">${esc(asset.title)}</h2>
      <div class="detail__actions">
        <button class="header__btn" onclick="downloadOriginal('${asset.id}')" title="下载原图">⬇️</button>
        <button class="header__btn" onclick="openCanvas('${asset.id}')" title="画板">✏️</button>
        <button class="header__btn" onclick="deleteAsset('${asset.id}')" title="删除">🗑️</button>
      </div>
    </div>
    <div style="position:relative;display:inline-block;width:100%;">
      <img class="detail__image" src="${asset.dataUrl}" alt="${esc(asset.title)}" onclick="openLightbox(this)" data-src="${asset.dataUrl}" data-title="${esc(asset.title)}" style="cursor: zoom-in;">
      <div style="position:absolute;bottom:12px;right:12px;background:rgba(0,0,0,0.5);color:white;padding:4px 10px;border-radius:16px;font-size:0.75rem;pointer-events:none;">🔍 点击查看大图</div>
    </div>
    <div class="detail__content">
      <div class="detail__meta">
        <span class="masonry__tag">${esc(getCategoryName(asset.categoryId))}</span>
        ${asset.attributes?.style ? '<span class="masonry__tag">' + esc(getAttributeLabel('style', asset.attributes.style)) + '</span>' : ''}
        ${asset.attributes?.season ? '<span class="masonry__tag">' + esc(getAttributeLabel('season', asset.attributes.season)) + '</span>' : ''}
        ${asset.attributes?.purpose ? '<span class="masonry__tag">' + esc(getAttributeLabel('purpose', asset.attributes.purpose)) + '</span>' : ''}
        ${(asset.tags || []).map(t => '<span class="masonry__tag">#' + esc(t) + '</span>').join('')}
      </div>
      <div style="margin-bottom:16px;">
        <div style="font-size:0.8125rem;color:var(--text-secondary);margin-bottom:8px;">属性</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <select onchange="updateAssetAttribute('${asset.id}', 'style', this.value)" style="padding:4px 8px;border:1px solid var(--border);border-radius:var(--radius);">
            <option value="">风格</option>
            ${ATTRIBUTE_OPTIONS.style.map(o => '<option value="' + o.value + '" ' + (asset.attributes?.style === o.value ? 'selected' : '') + '>' + o.label + '</option>').join('')}
          </select>
          <select onchange="updateAssetAttribute('${asset.id}', 'season', this.value)" style="padding:4px 8px;border:1px solid var(--border);border-radius:var(--radius);">
            <option value="">季节</option>
            ${ATTRIBUTE_OPTIONS.season.map(o => '<option value="' + o.value + '" ' + (asset.attributes?.season === o.value ? 'selected' : '') + '>' + o.label + '</option>').join('')}
          </select>
          <select onchange="updateAssetAttribute('${asset.id}', 'purpose', this.value)" style="padding:4px 8px;border:1px solid var(--border);border-radius:var(--radius);">
            <option value="">用途</option>
            ${ATTRIBUTE_OPTIONS.purpose.map(o => '<option value="' + o.value + '" ' + (asset.attributes?.purpose === o.value ? 'selected' : '') + '>' + o.label + '</option>').join('')}
          </select>
        </div>
      </div>
      <div style="margin-bottom:16px;">
        <div style="font-size:0.8125rem;color:var(--text-secondary);margin-bottom:8px;">标签</div>
        <div class="tags-input" id="tags-input-${asset.id}">
          ${(asset.tags || []).map(t => '<span class="tags-input__tag">' + esc(t) + ' <span class="tags-input__remove" onclick="removeTag(this)" data-id="' + asset.id + '" data-tag="' + esc(t) + '">×</span></span>').join('')}
          <input class="tags-input__input" placeholder="添加标签..."
                 onkeydown="handleTagInput(event, '${asset.id}')">
        </div>
      </div>
      <textarea class="detail__note" placeholder="写点灵感..."
                onblur="saveNote('${asset.id}', this.value)">${esc(asset.note || '')}</textarea>
    </div>
  `;
  overlay.classList.add('open');
}

function closeDetail() {
  document.getElementById('detail-overlay').classList.remove('open');
  state.currentView = 'library';
  state.currentAsset = null;
}

function getAttributeLabel(dimension, value) {
  const opt = ATTRIBUTE_OPTIONS[dimension]?.find(o => o.value === value);
  return opt ? opt.label : value;
}

async function updateAssetAttribute(id, dimension, value) {
  const asset = await db.getAsset(id);
  if (!asset) return;
  if (!asset.attributes) asset.attributes = {};
  asset.attributes[dimension] = value;
  asset.updatedAt = new Date().toISOString();
  await db.updateAsset(asset);
  state.assets = await db.getAllAssets();
  showToast('属性已更新');
}

async function handleTagInput(event, assetId) {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  const input = event.target;
  const tag = input.value.trim();
  if (!tag) return;

  const asset = await db.getAsset(assetId);
  if (!asset) return;
  if (!asset.tags) asset.tags = [];
  if (asset.tags.includes(tag)) return;

  asset.tags.push(tag);
  asset.updatedAt = new Date().toISOString();
  await db.updateAsset(asset);
  state.assets = await db.getAllAssets();

  const container = document.getElementById('tags-input-' + assetId);
  const tagEl = document.createElement('span');
  tagEl.className = 'tags-input__tag';
  tagEl.innerHTML = esc(tag) + ' <span class="tags-input__remove" onclick="removeTag(this)" data-id="' + assetId + '" data-tag="' + esc(tag) + '">×</span>';
  container.insertBefore(tagEl, input);
  input.value = '';
  showToast('标签已添加');
}

async function removeTag(btn) {
  const assetId = btn.dataset.id;
  const tag = btn.dataset.tag;
  const asset = await db.getAsset(assetId);
  if (!asset || !asset.tags) return;
  asset.tags = asset.tags.filter(t => t !== tag);
  asset.updatedAt = new Date().toISOString();
  await db.updateAsset(asset);
  state.assets = await db.getAllAssets();
  openDetail(assetId);
  showToast('标签已移除');
}

async function saveNote(id, note) {
  const asset = await db.getAsset(id);
  if (!asset) return;
  asset.note = note;
  asset.updatedAt = new Date().toISOString();
  await db.updateAsset(asset);
  state.assets = await db.getAllAssets();
}

// ========== 删除/回收站 ==========
async function deleteAsset(id) {
  if (confirm('确定删除此素材？可在回收站恢复')) {
    await db.deleteAsset(id);
    state.assets = await db.getAllAssets();
    closeDetail();
    renderMasonry();
    showToast('已移至回收站');
  }
}

async function restoreAsset(id) {
  await db.restoreAsset(id);
  state.assets = await db.getAllAssets();
  await renderTrash();
  showToast('已恢复');
}

async function permanentlyDelete(id) {
  if (confirm('彻底删除后无法恢复，确定？')) {
    await db.permanentlyDeleteAsset(id);
    state.assets = await db.getAllAssets();
    await renderTrash();
    showToast('已彻底删除');
  }
}

// ========== 图片放大查看 ==========
let lightboxState = { scale: 1 };

function openLightbox(el) {
  const src = el.dataset.src;
  const title = el.dataset.title || '';
  lightboxState = { scale: 1 };

  const overlay = document.getElementById('modal-overlay');
  overlay.innerHTML = `
    <div class="lightbox" onclick="closeLightbox()">
      <img class="lightbox__img" src="${src}" alt="${esc(title)}"
           onclick="event.stopPropagation()"
           onwheel="handleLightboxZoom(event)"
           ondblclick="resetLightboxZoom()"
           id="lightbox-img">
      <div class="lightbox__controls">
        <button class="lightbox__btn" onclick="event.stopPropagation(); zoomLightbox(0.5)">＋</button>
        <button class="lightbox__btn" onclick="event.stopPropagation(); zoomLightbox(-0.5)">－</button>
        <button class="lightbox__btn" onclick="event.stopPropagation(); resetLightboxZoom()">↺</button>
        <button class="lightbox__close" onclick="closeLightbox()">×</button>
      </div>
      <div class="lightbox__tips">滚轮缩放 · 双击重置</div>
    </div>
  `;
  overlay.classList.add('open');
  overlay.style.display = 'flex';

  // 触摸缩放
  const img = document.getElementById('lightbox-img');
  let lastDistance = 0;
  img.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      lastDistance = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    }
  }, { passive: false });
  img.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const distance = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      lightboxState.scale = Math.max(0.5, Math.min(5, lightboxState.scale + (distance - lastDistance) * 0.01));
      img.style.transform = 'scale(' + lightboxState.scale + ')';
      lastDistance = distance;
    }
  }, { passive: false });
}

function handleLightboxZoom(e) {
  e.preventDefault();
  const img = document.getElementById('lightbox-img');
  lightboxState.scale = Math.max(0.5, Math.min(5, lightboxState.scale + (e.deltaY > 0 ? -0.2 : 0.2)));
  img.style.transform = 'scale(' + lightboxState.scale + ')';
}

function zoomLightbox(delta) {
  const img = document.getElementById('lightbox-img');
  lightboxState.scale = Math.max(0.5, Math.min(5, lightboxState.scale + delta));
  img.style.transform = 'scale(' + lightboxState.scale + ')';
}

function resetLightboxZoom() {
  const img = document.getElementById('lightbox-img');
  lightboxState.scale = 1;
  img.style.transform = 'scale(1)';
}

function closeLightbox() {
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('open');
  overlay.style.display = 'none';
}

function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('open');
  overlay.style.display = 'none';
}

// ========== 事件绑定 ==========
function bindEvents() {
  if (state.eventsBound) return;
  state.eventsBound = true;

  // 粘贴事件
  document.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) importFile(file);
      }
    }
  });

  // 拖拽事件
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer?.files) handleFiles(e.dataTransfer.files);
  });

  // ESC 键关闭
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeLightbox();
      closeModal();
      closeDetail();
    }
  });
}

// ========== 启动 ==========
document.addEventListener('DOMContentLoaded', init);


// ========== 属性类别管理 ==========
function openAttrManager() {
  const overlay = document.getElementById('modal-overlay');
  const dims = [
    { key: 'style', name: '风格' },
    { key: 'season', name: '季节' },
    { key: 'purpose', name: '用途' },
  ];

  overlay.innerHTML = `
    <div class="modal" style="max-height:80vh;overflow-y:auto;">
      <div class="modal__header">
        <h3 class="modal__title">🏷️ 属性类别管理</h3>
        <button class="modal__close" onclick="closeModal()">×</button>
      </div>
      <div class="modal__body">
        ${dims.map(dim => `
          <div style="margin-bottom:16px;">
            <div style="font-size:0.875rem;font-weight:600;margin-bottom:8px;">${dim.name}</div>
            <div id="attr-list-${dim.key}">
              ${ATTRIBUTE_OPTIONS[dim.key].map((opt, idx) => `
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;padding:6px 8px;background:var(--bg-primary);border-radius:var(--radius);">
                  <span style="flex:1;font-size:0.8125rem;">${opt.label}</span>
                  <button class="category-item__btn" onclick="moveAttr('${dim.key}',${idx},-1)" ${idx===0?'disabled':''}>↑</button>
                  <button class="category-item__btn" onclick="moveAttr('${dim.key}',${idx},1)" ${idx===ATTRIBUTE_OPTIONS[dim.key].length-1?'disabled':''}>↓</button>
                  <button class="category-item__btn" onclick="renameAttr('${dim.key}',${idx})">✏️</button>
                  <button class="category-item__btn category-item__btn--danger" onclick="deleteAttr('${dim.key}',${idx})">×</button>
                </div>
              `).join('')}
            </div>
            <div style="display:flex;gap:6px;margin-top:6px;">
              <input type="text" id="new-attr-${dim.key}" placeholder="新增${dim.name}类别" style="flex:1;padding:4px 8px;border:1px solid var(--border);border-radius:var(--radius);font-size:0.8125rem;">
              <button class="btn btn--secondary" style="font-size:0.75rem;padding:4px 10px;" onclick="addAttr('${dim.key}')">添加</button>
            </div>
          </div>
        `).join('')}
        <div style="display:flex;gap:8px;margin-top:16px;">
          <button class="btn btn--secondary" style="flex:1;" onclick="resetAttrOptions()">恢复默认</button>
          <button class="btn btn--primary" style="flex:1;" onclick="saveAttrOptions(); closeModal(); showToast('属性类别已保存');">保存</button>
        </div>
      </div>
    </div>
  `;
  overlay.classList.add('open');
  overlay.style.display = 'flex';
}

function addAttr(dim) {
  const input = document.getElementById('new-attr-' + dim);
  const name = input.value.trim();
  if (!name) return;
  if (ATTRIBUTE_OPTIONS[dim].some(o => o.value === name)) {
    showToast('已存在同名类别');
    return;
  }
  ATTRIBUTE_OPTIONS[dim].push({ value: name, label: name });
  input.value = '';
  openAttrManager();
}

function moveAttr(dim, idx, dir) {
  const arr = ATTRIBUTE_OPTIONS[dim];
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= arr.length) return;
  [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
  openAttrManager();
}

function renameAttr(dim, idx) {
  const oldName = ATTRIBUTE_OPTIONS[dim][idx].label;
  const newName = prompt('重命名类别', oldName);
  if (!newName || newName.trim() === oldName) return;
  ATTRIBUTE_OPTIONS[dim][idx].value = newName.trim();
  ATTRIBUTE_OPTIONS[dim][idx].label = newName.trim();
  openAttrManager();
}

function deleteAttr(dim, idx) {
  if (!confirm('确定删除「' + ATTRIBUTE_OPTIONS[dim][idx].label + '」？')) return;
  ATTRIBUTE_OPTIONS[dim].splice(idx, 1);
  openAttrManager();
}

async function resetAttrOptions() {
  ATTRIBUTE_OPTIONS = JSON.parse(JSON.stringify(DEFAULT_ATTRIBUTE_OPTIONS));
  await db.setMeta('attributeOptions', ATTRIBUTE_OPTIONS);
  openAttrManager();
  showToast('已恢复默认属性类别');
}

async function saveAttrOptions() {
  await db.setMeta('attributeOptions', ATTRIBUTE_OPTIONS);
  renderFilterTabs();
}
