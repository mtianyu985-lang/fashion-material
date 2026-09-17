/* ============================================
   服装设计素材库 · IndexedDB 封装
   ============================================ */

const DB_NAME = 'FashionMaterialDB';
const DB_VERSION = 1;

// 预设分类
const PRESET_CATEGORIES = [
  { id: 'style', name: '款式图', icon: '👗', isPreset: true, parentId: null, order: 0 },
  { id: 'fabric', name: '面料', icon: '🧵', isPreset: true, parentId: null, order: 1 },
  { id: 'color', name: '配色', icon: '🎨', isPreset: true, parentId: null, order: 2 },
  { id: 'accessory', name: '配饰', icon: '👒', isPreset: true, parentId: null, order: 3 },
  { id: 'runway', name: '秀场', icon: '📸', isPreset: true, parentId: null, order: 4 },
  { id: 'street', name: '街拍', icon: '📷', isPreset: true, parentId: null, order: 5 },
];

class FashionDB {
  constructor() {
    this.db = null;
  }
  
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // 素材表
        if (!db.objectStoreNames.contains('assets')) {
          const assetStore = db.createObjectStore('assets', { keyPath: 'id' });
          assetStore.createIndex('categoryId', 'categoryId', { unique: false });
          assetStore.createIndex('mediaType', 'mediaType', { unique: false });
          assetStore.createIndex('createdAt', 'createdAt', { unique: false });
          assetStore.createIndex('deletedAt', 'deletedAt', { unique: false });
        }
        
        // 分类表
        if (!db.objectStoreNames.contains('categories')) {
          const catStore = db.createObjectStore('categories', { keyPath: 'id' });
          catStore.createIndex('parentId', 'parentId', { unique: false });
        }
        
        // 项目表
        if (!db.objectStoreNames.contains('projects')) {
          db.createObjectStore('projects', { keyPath: 'id' });
        }
        
        // 元数据表
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
      };
    });
  }
  
  // ========== 素材 CRUD ==========
  
  async addAsset(asset) {
    const tx = this.db.transaction('assets', 'readwrite');
    const store = tx.objectStore('assets');
    return new Promise((resolve, reject) => {
      const request = store.add(asset);
      request.onsuccess = () => resolve(asset);
      request.onerror = () => reject(request.error);
    });
  }
  
  async updateAsset(asset) {
    const tx = this.db.transaction('assets', 'readwrite');
    const store = tx.objectStore('assets');
    return new Promise((resolve, reject) => {
      const request = store.put(asset);
      request.onsuccess = () => resolve(asset);
      request.onerror = () => reject(request.error);
    });
  }
  
  async getAsset(id) {
    const tx = this.db.transaction('assets', 'readonly');
    const store = tx.objectStore('assets');
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  
  async getAllAssets(includeDeleted = false) {
    const tx = this.db.transaction('assets', 'readonly');
    const store = tx.objectStore('assets');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const assets = request.result;
        if (includeDeleted) {
          resolve(assets);
        } else {
          resolve(assets.filter(a => !a.deletedAt));
        }
      };
      request.onerror = () => reject(request.error);
    });
  }
  
  async getAssetsByCategory(categoryId) {
    const tx = this.db.transaction('assets', 'readonly');
    const store = tx.objectStore('assets');
    const index = store.index('categoryId');
    return new Promise((resolve, reject) => {
      const request = index.getAll(categoryId);
      request.onsuccess = () => {
        resolve(request.result.filter(a => !a.deletedAt));
      };
      request.onerror = () => reject(request.error);
    });
  }
  
  async deleteAsset(id) {
    // 软删除：标记 deletedAt
    const asset = await this.getAsset(id);
    if (asset) {
      asset.deletedAt = new Date().toISOString();
      return this.updateAsset(asset);
    }
  }
  
  async restoreAsset(id) {
    const asset = await this.getAsset(id);
    if (asset) {
      asset.deletedAt = null;
      return this.updateAsset(asset);
    }
  }
  
  async permanentlyDeleteAsset(id) {
    const tx = this.db.transaction('assets', 'readwrite');
    const store = tx.objectStore('assets');
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  
  // ========== 分类 CRUD ==========
  
  async initCategories() {
    // 获取已删除的预设分类 ID 列表
    const deletedPresets = await this.getMeta('deletedPresets') || [];
    const deletedSet = new Set(deletedPresets);
    
    const existing = await this.getAllCategories();
    const existingIds = new Set(existing.map(c => c.id));
    
    for (const cat of PRESET_CATEGORIES) {
      // 跳过已删除的预设分类
      if (deletedSet.has(cat.id)) continue;
      
      if (!existingIds.has(cat.id)) {
        try {
          await this.addCategory(cat);
        } catch (e) {
          console.log('分类已存在:', cat.name);
        }
      }
    }
  }
  
  // 删除预设分类时记录到 meta 表
  async deleteCategory(id) {
    // 如果是预设分类，记录到已删除列表
    const preset = PRESET_CATEGORIES.find(c => c.id === id);
    if (preset) {
      const deletedPresets = await this.getMeta('deletedPresets') || [];
      if (!deletedPresets.includes(id)) {
        deletedPresets.push(id);
        await this.setMeta('deletedPresets', deletedPresets);
      }
    }
    
    const tx = this.db.transaction('categories', 'readwrite');
    const store = tx.objectStore('categories');
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  
  // Meta 表操作
  async getMeta(key) {
    const tx = this.db.transaction('meta', 'readonly');
    const store = tx.objectStore('meta');
    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result?.value);
      request.onerror = () => reject(request.error);
    });
  }
  
  async setMeta(key, value) {
    const tx = this.db.transaction('meta', 'readwrite');
    const store = tx.objectStore('meta');
    return new Promise((resolve, reject) => {
      const request = store.put({ key, value });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  
  async addCategory(category) {
    const tx = this.db.transaction('categories', 'readwrite');
    const store = tx.objectStore('categories');
    return new Promise((resolve, reject) => {
      const request = store.add(category);
      request.onsuccess = () => resolve(category);
      request.onerror = () => reject(request.error);
    });
  }
  
  async getAllCategories() {
    const tx = this.db.transaction('categories', 'readonly');
    const store = tx.objectStore('categories');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  
  async updateCategory(category) {
    const tx = this.db.transaction('categories', 'readwrite');
    const store = tx.objectStore('categories');
    return new Promise((resolve, reject) => {
      const request = store.put(category);
      request.onsuccess = () => resolve(category);
      request.onerror = () => reject(request.error);
    });
  }
  

  
  // ========== 回收站 ==========
  
  async getDeletedAssets() {
    const tx = this.db.transaction('assets', 'readonly');
    const store = tx.objectStore('assets');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        resolve(request.result.filter(a => a.deletedAt));
      };
      request.onerror = () => reject(request.error);
    });
  }

  // 清理过期回收站（超过30天自动永久删除）
  async cleanupExpiredTrash() {
    const deleted = await this.getDeletedAssets();
    const now = Date.now();
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    let cleaned = 0;
    for (const asset of deleted) {
      const deletedTime = new Date(asset.deletedAt).getTime();
      if (now - deletedTime > THIRTY_DAYS) {
        await this.permanentlyDeleteAsset(asset.id);
        cleaned++;
      }
    }
    return cleaned;
  }

  
  // ========== 统计 ==========
  
  async getCategoryCounts() {
    const assets = await this.getAllAssets();
    const counts = {};
    assets.forEach(a => {
      counts[a.categoryId] = (counts[a.categoryId] || 0) + 1;
    });
    return counts;
  }
  
  // ========== 导出 ==========
  

  // 分类去重：保留第一个，删除后续重复
  async deduplicateCategories() {
    const categories = await this.getAllCategories();
    const seen = new Set();
    const duplicates = [];
    
    for (const cat of categories) {
      if (seen.has(cat.name)) {
        duplicates.push(cat.id);
      } else {
        seen.add(cat.name);
      }
    }
    
    if (duplicates.length > 0) {
      console.log('发现重复分类:', duplicates.length, '个');
      for (const id of duplicates) {
        await this.deleteCategory(id);
      }
    }
    
    return duplicates.length;
  }

  async exportAll() {
    const assets = await this.getAllAssets();
    const deletedAssets = await this.getDeletedAssets();
    const categories = await this.getAllCategories();
    const deletedPresets = await this.getMeta('deletedPresets') || [];
    const favoriteIds = await this.getMeta('favoriteIds') || [];
    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      summary: {
        totalAssets: assets.length,
        deletedAssets: deletedAssets.length,
        categories: categories.length,
        favorites: favoriteIds.length,
      },
      assets,
      deletedAssets,
      categories,
      deletedPresets,
      favoriteIds,
    };
  }

  // ========== 清除数据库 ==========
  async clearAll() {
    // 使用单个事务操作多个 store，避免竞态
    return new Promise((resolve, reject) => {
      const storeNames = ['assets', 'categories', 'projects'];
      const tx = this.db.transaction(storeNames, 'readwrite');
      
      storeNames.forEach(name => {
        tx.objectStore(name).clear();
      });
      
      tx.oncomplete = () => {
        console.log('✅ 数据库已清除');
        resolve();
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(new Error('事务被中止'));
    });
  }

}

// 全局单例
const db = new FashionDB();
