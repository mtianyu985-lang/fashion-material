/* ============================================
   服装设计素材库 · 画布手绘模块 (Fabric.js)
   ============================================ */

// 画布状态
const canvasState = {
  fabricCanvas: null,
  currentAssetId: null,
  currentTool: 'select',
  currentColor: '#2B2B2B',
  brushSize: 3,
  isDrawing: false,
  undoStack: [],
  maxUndo: 30,
};

// 预设颜色
const CANVAS_COLORS = [
  { name: '炭黑', hex: '#2B2B2B' },
  { name: '米白', hex: '#F7F5F0' },
  { name: '肤色', hex: '#F5D0C5' },
  { name: '红色', hex: '#C47B7B' },
  { name: '蓝色', hex: '#6B8EA8' },
  { name: '绿色', hex: '#7B9E6B' },
  { name: '驼色', hex: '#A89983' },
  { name: '紫色', hex: '#8B7BAA' },
];

// ========== 参照图功能 ==========
let referenceImageObj = null;

function toggleReferenceImage() {
  const canvas = canvasState.fabricCanvas;
  if (!canvas) return;

  if (referenceImageObj) {
    canvas.remove(referenceImageObj);
    referenceImageObj = null;
    showToast('参照图已隐藏');
  } else {
    const asset = db.getAsset(canvasState.currentAssetId);
    if (!asset) return;
    asset.then(a => {
      if (!a || !a.dataUrl) return;
      fabric.Image.fromURL(a.dataUrl, (img) => {
        const canvasW = canvas.width;
        const canvasH = canvas.height;
        const scale = Math.min(canvasW / img.width, canvasH / img.height) * 0.8;
        img.set({
          left: canvasW / 2,
          top: canvasH / 2,
          originX: 'center',
          originY: 'center',
          scaleX: scale,
          scaleY: scale,
          opacity: 0.3,
          selectable: false,
          evented: false,
        });
        canvas.add(img);
        canvas.sendToBack(img);
        referenceImageObj = img;
        canvas.renderAll();
        showToast('参照图已显示（半透明）');
      });
    });
  }
}

// ========== 打开画布 ==========
async function openCanvas(assetId) {
  const asset = await db.getAsset(assetId);
  if (!asset) return;
  
  canvasState.currentAssetId = assetId;
  
  const overlay = document.getElementById('canvas-overlay');
  overlay.innerHTML = `
    <div class="detail__header">
      <button class="detail__back" onclick="closeCanvas()">←</button>
      <h2 class="detail__title">画板 · ${esc(asset.title)}</h2>
      <div class="detail__actions">
        <button class="header__btn" onclick="undoCanvas()" title="撤销">↩️</button>
        <button class="header__btn" onclick="clearCanvas()" title="清空">🗑️</button>
        <button class="header__btn" onclick="saveCanvas()" title="保存">💾</button>
      </div>
    </div>
    
    <div class="canvas__toolbar">
      <button class="canvas__tool ${canvasState.currentTool === 'pencil' ? 'active' : ''}" 
              onclick="setCanvasTool('pencil')" title="铅笔">✏️</button>
      <button class="canvas__tool ${canvasState.currentTool === 'line' ? 'active' : ''}" 
              onclick="setCanvasTool('line')" title="直线">📏</button>
      <button class="canvas__tool ${canvasState.currentTool === 'arrow' ? 'active' : ''}" 
              onclick="setCanvasTool('arrow')" title="箭头">➡️</button>
      <button class="canvas__tool ${canvasState.currentTool === 'rect' ? 'active' : ''}" 
              onclick="setCanvasTool('rect')" title="矩形">⬜</button>
      <button class="canvas__tool ${canvasState.currentTool === 'circle' ? 'active' : ''}" 
              onclick="setCanvasTool('circle')" title="圆形">⭕</button>
      <button class="canvas__tool ${canvasState.currentTool === 'text' ? 'active' : ''}" 
              onclick="setCanvasTool('text')" title="文字">T</button>
      <button class="canvas__tool ${canvasState.currentTool === 'eraser' ? 'active' : ''}" 
              onclick="setCanvasTool('eraser')" title="橡皮">🧹</button>
      
      <div style="flex:1;"></div>
      
      <div class="canvas__colors">
        ${CANVAS_COLORS.map(c => `
          <button class="canvas__color ${canvasState.currentColor === c.hex ? 'active' : ''}" 
                  style="background:${c.hex};" 
                  onclick="setCanvasColor('${c.hex}')" 
                  title="${c.name}"></button>
        `).join('')}
      </div>
      
      <select onchange="setBrushSize(this.value)" style="margin-left:8px;padding:4px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:0.75rem;">
        <option value="1" ${canvasState.brushSize === 1 ? 'selected' : ''}>细</option>
        <option value="3" ${canvasState.brushSize === 3 ? 'selected' : ''}>中</option>
        <option value="6" ${canvasState.brushSize === 6 ? 'selected' : ''}>粗</option>
        <option value="12" ${canvasState.brushSize === 12 ? 'selected' : ''}>特粗</option>
      </select>
    </div>
    
    <div class="canvas__area">
      <canvas id="fabric-canvas"></canvas>
    </div>
  `;
  
  overlay.classList.add('open');
  
  // 初始化 Fabric.js 画布
  await initFabricCanvas(asset);
}

// ========== 初始化画布 ==========
async function initFabricCanvas(asset) {
  const container = document.querySelector('.canvas__area');
  const width = container.clientWidth;
  const height = container.clientHeight;
  
  // 创建 Fabric canvas
  const canvas = new fabric.Canvas('fabric-canvas', {
    width: width,
    height: height,
    backgroundColor: '#FFFFFF',
    isDrawingMode: true,
  });
  
  canvasState.fabricCanvas = canvas;
  
  // 设置画笔
  canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
  canvas.freeDrawingBrush.color = canvasState.currentColor;
  canvas.freeDrawingBrush.width = canvasState.brushSize;
  
  // 如果有保存的画布数据，加载
  if (asset.canvasData) {
    try {
      canvas.loadFromJSON(asset.canvasData, () => {
        canvas.renderAll();
      });
    } catch (e) {
      console.warn('加载画布数据失败:', e);
    }
  }
  
  // 监听对象添加（用于撤销）
  canvas.on('object:added', () => {
    if (canvasState.undoStack.length >= canvasState.maxUndo) {
      canvasState.undoStack.shift();
    }
    canvasState.undoStack.push(canvas.toJSON());
  });
  
  // 监听鼠标事件（用于绘制形状）
  let startX, startY, activeShape;
  
  canvas.on('mouse:down', (o) => {
    if (canvasState.currentTool === 'pencil' || canvasState.currentTool === 'eraser') return;
    
    const pointer = canvas.getPointer(o.e);
    startX = pointer.x;
    startY = pointer.y;
    canvasState.isDrawing = true;
    
    if (canvasState.currentTool === 'text') {
      const text = new fabric.IText('输入文字', {
        left: startX,
        top: startY,
        fontSize: 16,
        fill: canvasState.currentColor,
        fontFamily: 'Microsoft YaHei, sans-serif',
      });
      canvas.add(text);
      canvas.setActiveObject(text);
      text.enterEditing();
      canvasState.isDrawing = false;
      setCanvasTool('select');
      return;
    }
    
    // 创建形状预览
    switch (canvasState.currentTool) {
      case 'line':
        activeShape = new fabric.Line([startX, startY, startX, startY], {
          stroke: canvasState.currentColor,
          strokeWidth: canvasState.brushSize,
          selectable: false,
        });
        break;
      case 'arrow':
        activeShape = new fabric.Line([startX, startY, startX, startY], {
          stroke: canvasState.currentColor,
          strokeWidth: canvasState.brushSize,
          selectable: false,
        });
        break;
      case 'rect':
        activeShape = new fabric.Rect({
          left: startX,
          top: startY,
          width: 0,
          height: 0,
          fill: 'transparent',
          stroke: canvasState.currentColor,
          strokeWidth: canvasState.brushSize,
          selectable: false,
        });
        break;
      case 'circle':
        activeShape = new fabric.Circle({
          left: startX,
          top: startY,
          radius: 0,
          fill: 'transparent',
          stroke: canvasState.currentColor,
          strokeWidth: canvasState.brushSize,
          selectable: false,
        });
        break;
    }
    
    if (activeShape) {
      canvas.add(activeShape);
    }
  });
  
  canvas.on('mouse:move', (o) => {
    if (!canvasState.isDrawing || !activeShape) return;
    
    const pointer = canvas.getPointer(o.e);
    
    switch (canvasState.currentTool) {
      case 'line':
      case 'arrow':
        activeShape.set({ x2: pointer.x, y2: pointer.y });
        break;
      case 'rect':
        const w = pointer.x - startX;
        const h = pointer.y - startY;
        activeShape.set({
          width: Math.abs(w),
          height: Math.abs(h),
          left: w > 0 ? startX : pointer.x,
          top: h > 0 ? startY : pointer.y,
        });
        break;
      case 'circle':
        const radius = Math.sqrt(Math.pow(pointer.x - startX, 2) + Math.pow(pointer.y - startY, 2));
        activeShape.set({ radius: radius });
        break;
    }
    
    canvas.renderAll();
  });
  
  canvas.on('mouse:up', () => {
    if (canvasState.isDrawing && activeShape) {
      // 如果是箭头，添加箭头头部
      if (canvasState.currentTool === 'arrow') {
        addArrowHead(canvas, activeShape);
      }
      activeShape.set({ selectable: true });
      activeShape = null;
    }
    canvasState.isDrawing = false;
  });
  
  // 设置初始工具
  setCanvasTool('pencil');
}

// ========== 工具切换 ==========
function setCanvasTool(tool) {
  canvasState.currentTool = tool;
  const canvas = canvasState.fabricCanvas;
  if (!canvas) return;
  
  // 更新按钮状态
  document.querySelectorAll('.canvas__tool').forEach(btn => {
    btn.classList.remove('active');
  });
  const activeBtn = document.querySelector(`.canvas__tool[onclick="setCanvasTool('${tool}')"]`);
  if (activeBtn) activeBtn.classList.add('active');
  
  switch (tool) {
    case 'pencil':
      canvas.isDrawingMode = true;
      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
      canvas.freeDrawingBrush.color = canvasState.currentColor;
      canvas.freeDrawingBrush.width = canvasState.brushSize;
      canvas.selection = false;
      break;
    case 'eraser':
      canvas.isDrawingMode = true;
      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
      canvas.freeDrawingBrush.color = '#FFFFFF';
      canvas.freeDrawingBrush.width = canvasState.brushSize * 3;
      canvas.selection = false;
      break;
    case 'select':
      canvas.isDrawingMode = false;
      canvas.selection = true;
      canvas.discardActiveObject();
      break;
    case 'line':
    case 'arrow':
    case 'rect':
    case 'circle':
    case 'text':
      canvas.isDrawingMode = false;
      canvas.selection = false;
      break;
  }
}

// ========== 颜色和大小 ==========
function setCanvasColor(hex) {
  canvasState.currentColor = hex;
  const canvas = canvasState.fabricCanvas;
  if (!canvas) return;
  
  if (canvas.isDrawingMode && canvas.freeDrawingBrush) {
    canvas.freeDrawingBrush.color = hex;
  }
  
  // 更新颜色按钮状态
  document.querySelectorAll('.canvas__color').forEach(btn => {
    btn.classList.toggle('active', btn.style.background === hex || rgbToHex(btn.style.backgroundColor) === hex);
  });
}

function setBrushSize(size) {
  canvasState.brushSize = parseInt(size);
  const canvas = canvasState.fabricCanvas;
  if (!canvas || !canvas.freeDrawingBrush) return;
  canvas.freeDrawingBrush.width = canvasState.brushSize;
}

// ========== 撤销/清空 ==========
function undoCanvas() {
  const canvas = canvasState.fabricCanvas;
  if (!canvas) return;
  
  if (canvasState.undoStack.length > 1) {
    canvasState.undoStack.pop(); // 移除当前状态
    const prevState = canvasState.undoStack[canvasState.undoStack.length - 1];
    canvas.loadFromJSON(prevState, () => canvas.renderAll());
    showToast('已撤销');
  } else {
    showToast('没有可撤销的操作');
  }
}

function clearCanvas() {
  const canvas = canvasState.fabricCanvas;
  if (!canvas) return;
  
  if (confirm('确定清空画布？')) {
    canvas.clear();
    canvas.backgroundColor = '#FFFFFF';
    canvas.renderAll();
    canvasState.undoStack = [canvas.toJSON()];
    showToast('画布已清空');
  }
}

// ========== 保存画布 ==========
async function saveCanvas() {
  const canvas = canvasState.fabricCanvas;
  if (!canvas || !canvasState.currentAssetId) return;
  
  try {
    const asset = await db.getAsset(canvasState.currentAssetId);
    if (!asset) return;
    
    // 保存画布数据为 JSON
    asset.canvasData = canvas.toJSON();
    asset.updatedAt = new Date().toISOString();
    
    await db.updateAsset(asset);
    state.assets = await db.getAllAssets();
    
    showToast('画布已保存');
  } catch (err) {
    console.error('保存失败:', err);
    showToast('保存失败');
  }
}

// ========== 关闭画布 ==========
async function closeCanvas() {
  // 自动保存
  await saveCanvas();
  
  const overlay = document.getElementById('canvas-overlay');
  overlay.classList.remove('open');
  overlay.innerHTML = '';
  
  // 销毁画布
  if (canvasState.fabricCanvas) {
    canvasState.fabricCanvas.dispose();
    canvasState.fabricCanvas = null;
  }
  
  canvasState.currentAssetId = null;
  canvasState.undoStack = [];
}

// ========== 辅助函数 ==========
function addArrowHead(canvas, line) {
  const x1 = line.x1, y1 = line.y1, x2 = line.x2, y2 = line.y2;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLen = 15;
  
  const head = new fabric.Triangle({
    left: x2,
    top: y2,
    width: headLen,
    height: headLen,
    fill: canvasState.currentColor,
    angle: (angle * 180 / Math.PI) + 90,
    originX: 'center',
    originY: 'center',
    selectable: false,
  });
  
  canvas.add(head);
}

function rgbToHex(rgb) {
  if (rgb.startsWith('#')) return rgb;
  const match = rgb.match(/\d+/g);
  if (!match) return rgb;
  return '#' + match.slice(0, 3).map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
}


// ========== 画布缩放功能 ==========
function initCanvasZoom(canvas, container) {
  let lastDist = 0;
  let isPanning = false;
  let lastPosX = 0;
  let lastPosY = 0;

  // 双指捏合缩放（触屏）
  container.addEventListener('touchstart', function(e) {
    if (e.touches.length === 2) {
      e.preventDefault();
      lastDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    }
  }, { passive: false });

  container.addEventListener('touchmove', function(e) {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const scale = dist / lastDist;
      let zoom = canvas.getZoom() * scale;
      zoom = Math.max(0.5, Math.min(5, zoom));
      const center = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2
      };
      canvas.zoomToPoint(new fabric.Point(center.x, center.y), zoom);
      lastDist = dist;
      canvas.renderAll();
    }
  }, { passive: false });

  // 鼠标滚轮缩放（电脑端）
  container.addEventListener('wheel', function(e) {
    e.preventDefault();
    const delta = e.deltaY;
    let zoom = canvas.getZoom();
    zoom *= 0.999 ** delta;
    zoom = Math.max(0.5, Math.min(5, zoom));
    canvas.zoomToPoint(new fabric.Point(e.offsetX, e.offsetY), zoom);
    canvas.renderAll();
  }, { passive: false });

  // 双击重置缩放
  container.addEventListener('dblclick', function() {
    canvas.setZoom(1);
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    canvas.renderAll();
  });
}
