# 服装设计素材库

## 使用方法

### 方式一：双击打开（可能受限）
直接双击 `index.html` 打开。
⚠️ 注意：某些浏览器在 file:// 协议下可能无法正常使用 IndexedDB。

### 方式二：启动本地服务器（推荐）
1. 双击运行 `启动本地服务器.bat`
2. 浏览器访问 http://localhost:8080

### 方式三：手动启动服务器
```bash
cd fashion-material-lib
python -m http.server 8080
```
然后访问 http://localhost:8080

## 功能说明
- 素材导入（点击/粘贴/拖拽）
- 瀑布流素材墙
- 分类筛选 + 搜索
- 素材详情 + 笔记
- 属性标签多维筛选
- 画布手绘
- 分类管理
- 回收站（30天自动清理）
- 导出/导入备份
- 持久化存储
- PWA 离线

## 技术栈
- 纯 HTML + CSS + JavaScript
- IndexedDB 本地存储
- Fabric.js 画布
- Service Worker 离线
