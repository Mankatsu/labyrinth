  (function() {
    const COLS = 15;
    const ROWS = 15;
    const TOTAL = COLS * ROWS;
    const WALL = { top:1, right:2, bottom:4, left:8 };
    const AUTO_KEY = 'labyrinth_v4_auto';
    const POINTER_SUPPORTED = window.PointerEvent !== undefined;

    function createCellState() {
      return { walls:0, fork:false, ladder:false, exit:false, opened:false };
    }

    let data = [
      Array.from({ length: TOTAL }, createCellState),
      Array.from({ length: TOTAL }, createCellState)
    ];
    let currentFloor = 0;
    let currentIndex = null;

    // Управление автосохранением
    let suppressAutoSave = false;
    let dirty = false;
    function markDirty(reason) {
      if (!dirty) {
        dirty = true;
        // console.log('Dirty:', reason);
      }
    }

    // Восстановление
    let pendingAutosaveDecision = false;
    const existingAutosaveRaw = localStorage.getItem(AUTO_KEY);

    // DOM элементы
    const gridEl = document.getElementById('grid');
    const cellInfoEl = document.getElementById('cellInfo');
    const zoomRangeEl = document.getElementById('zoomRange');
    const zoomValueEl = document.getElementById('zoomValue');
    const markOpenedBtn = document.getElementById('markOpened');
    const jsonArea = document.getElementById('dataArea');
    const textArea = document.getElementById('textArea');
    const statusLine = document.getElementById('statusLine');
    const fileInput = document.getElementById('fileInput');
    const importFileBtn = document.getElementById('importFileBtn');

    function status(msg) {
      statusLine.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg;
    }

    function buildGrid() {
      gridEl.innerHTML = '';
      for (let i=0;i<TOTAL;i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.index = i;
        cell.textContent = (i+1).toString();
        cell.addEventListener('click', () => selectCell(i));
        if (POINTER_SUPPORTED) {
          cell.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'touch') e.preventDefault();
            selectCell(i);
          });
        } else {
          cell.addEventListener('touchstart', (e) => { e.preventDefault(); selectCell(i); }, { passive:false });
          cell.addEventListener('mousedown', () => selectCell(i));
        }
        gridEl.appendChild(cell);
      }
      refreshGrid();
    }

    function indexToRowCol(index) { return { row: Math.floor(index / COLS), col: index % COLS }; }
    function rowColToIndex(row, col) {
      if (row<0 || row>=ROWS || col<0 || col>=COLS) return null;
      return row*COLS + col;
    }

    function refreshGrid() {
      const floorData = data[currentFloor];
      gridEl.querySelectorAll('.cell').forEach(cell => {
        const i = parseInt(cell.dataset.index);
        const st = floorData[i];
        cell.className = 'cell';
        if (st.walls & WALL.top) cell.classList.add('wall-top');
        if (st.walls & WALL.right) cell.classList.add('wall-right');
        if (st.walls & WALL.bottom) cell.classList.add('wall-bottom');
        if (st.walls & WALL.left) cell.classList.add('wall-left');
        if (st.fork) cell.classList.add('fork');
        if (st.ladder) cell.classList.add('ladder');
        if (st.exit) cell.classList.add('exit');
        if (st.opened) cell.classList.add('opened');
      });
      if (currentIndex !== null) {
        const sel = gridEl.querySelector('.cell[data-index="'+currentIndex+'"]');
        if (sel) sel.classList.add('selected');
        updateCellInfo();
      } else {
        cellInfoEl.textContent = 'Текущая клетка: —';
      }
      updateOpenedButtonVisual();
      updateWallsButtonsState();
    }

    function selectCell(index) {
      if (currentIndex === index) return;
      currentIndex = index;
      refreshGrid();
      markDirty('select cell');
      autoSave();
    }

    function updateOpenedButtonVisual() {
      if (currentIndex === null) {
        markOpenedBtn.classList.remove('active');
        return;
      }
      const st = data[currentFloor][currentIndex];
      markOpenedBtn.classList.toggle('active', !!st.opened);
    }

    function updateWallsButtonsState() {
      document.querySelectorAll('.walls-dpad [data-wall]').forEach(btn => btn.classList.remove('active-wall'));
      if (currentIndex === null) return;
      const st = data[currentFloor][currentIndex];
      if (st.walls & WALL.top) document.querySelector('.walls-dpad [data-wall="top"]').classList.add('active-wall');
      if (st.walls & WALL.right) document.querySelector('.walls-dpad [data-wall="right"]').classList.add('active-wall');
      if (st.walls & WALL.bottom) document.querySelector('.walls-dpad [data-wall="bottom"]').classList.add('active-wall');
      if (st.walls & WALL.left) document.querySelector('.walls-dpad [data-wall="left"]').classList.add('active-wall');
    }

    function updateCellInfo() {
      if (currentIndex === null) return;
      const id = currentIndex + 1;
      const { row, col } = indexToRowCol(currentIndex);
      const st = data[currentFloor][currentIndex];
      const walls = [];
      if (st.walls & WALL.top) walls.push('↑');
      if (st.walls & WALL.right) walls.push('→');
      if (st.walls & WALL.bottom) walls.push('↓');
      if (st.walls & WALL.left) walls.push('←');
      cellInfoEl.textContent =
        `Текущая клетка: #${id} (r:${row+1}, c:${col+1}) | Стены: ${walls.join(' ')||'нет'} | Развилка:${st.fork?'да':'нет'} | Лестница:${st.ladder?'да':'нет'} | Выход:${st.exit?'да':'нет'} | Открыта:${st.opened?'да':'нет'} | Этаж:${currentFloor===0?'1 этаж':'подвал'}`;
    }

    function toggleWall(side) {
      if (currentIndex === null) return;
      const st = data[currentFloor][currentIndex];
      const bit = WALL[side];
      const had = (st.walls & bit) !== 0;

      const { row, col } = indexToRowCol(currentIndex);
      let neighborIndex = null, opposite = null;
      if (side==='top') { neighborIndex = rowColToIndex(row-1,col); opposite='bottom'; }
      else if (side==='right') { neighborIndex = rowColToIndex(row,col+1); opposite='left'; }
      else if (side==='bottom') { neighborIndex = rowColToIndex(row+1,col); opposite='top'; }
      else if (side==='left') { neighborIndex = rowColToIndex(row,col-1); opposite='right'; }

      if (had) {
        st.walls &= ~bit;
        if (neighborIndex!==null) data[currentFloor][neighborIndex].walls &= ~WALL[opposite];
      } else {
        st.walls |= bit;
        if (neighborIndex!==null) data[currentFloor][neighborIndex].walls |= WALL[opposite];
      }
      if (had !== ((st.walls & bit)!==0)) {
        markDirty('toggle wall');
      }
      refreshGrid();
      autoSave();
    }

    function moveSelection(dr, dc) {
      if (currentIndex === null) { selectCell(0); return; }
      const { row, col } = indexToRowCol(currentIndex);
      const nr = row + dr;
      const nc = col + dc;
      const ni = rowColToIndex(nr,nc);
      if (ni !== null) selectCell(ni);
    }

    function toggleMarker(type) {
      if (currentIndex === null) return;
      const st = data[currentFloor][currentIndex];
      let before;
      if (type==='fork') { before = st.fork; st.fork = !st.fork; if (before!==st.fork) markDirty('fork'); }
      if (type==='ladder') { before = st.ladder; st.ladder = !st.ladder; if (before!==st.ladder) markDirty('ladder'); }
      if (type==='exit') { before = st.exit; st.exit = !st.exit; if (before!==st.exit) markDirty('exit'); }
      refreshGrid();
      autoSave();
    }

    function toggleOpened() {
      if (currentIndex === null) return;
      const st = data[currentFloor][currentIndex];
      const before = st.opened;
      st.opened = !st.opened;
      if (before !== st.opened) markDirty('opened');
      refreshGrid();
      autoSave();
    }

    function setFloor(f) {
      if (f === currentFloor) return;
      currentFloor = f;
      markDirty('floor change');
      refreshGrid();
      document.querySelectorAll('#floorButtons button').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.floor) === currentFloor);
      });
      autoSave();
    }

    function exportData() {
      return JSON.stringify({
        version:4,
        cols:COLS,
        rows:ROWS,
        floors: data.map(floor => floor.map(c => ({
          w:c.walls, f:c.fork?1:0, l:c.ladder?1:0, e:c.exit?1:0, o:c.opened?1:0
        }))),
        meta:{ floor:currentFloor, sel: currentIndex }
      }, null, 2);
    }

    function importData(json) {
      let obj;
      try { obj = JSON.parse(json); }
      catch { throw new Error('Ошибка парсинга JSON'); }
      if (!obj.floors || obj.floors.length !== 2) {
        throw new Error('Неверная структура JSON (нужно 2 этажа)');
      }
      data = obj.floors.map(floor =>
        floor.slice(0,TOTAL).map(cell => ({
          walls:(cell.w ?? 0)|0,
          fork:!!cell.f,
          ladder:!!cell.l,
          exit:!!cell.e,
          opened:!!cell.o
        }))
      );
      for (let f=0; f<2; f++) while (data[f].length < TOTAL) data[f].push(createCellState());
      currentFloor = obj.meta?.floor ?? 0;
      if (currentFloor > 1) currentFloor = 0;
      currentIndex = (typeof obj.meta?.sel === 'number' && obj.meta.sel >=0 && obj.meta.sel < TOTAL) ? obj.meta.sel : 0;
      refreshGrid();
      document.querySelectorAll('#floorButtons button').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.floor) === currentFloor);
      });
      dirty = false;
    }

    function encodeCell(st) {
      let token = st.walls.toString(16).toUpperCase();
      if (st.fork) token += 'F';
      if (st.ladder) token += 'L';
      if (st.exit) token += 'E';
      if (st.opened) token += 'O';
      return token;
    }

    function exportText() {
      const lines = [];
      lines.push('LABYRINTH-TEXT v1');
      lines.push(`SIZE ${COLS} ${ROWS}`);
      lines.push('FLOORS 2');
      for (let f=0; f<2; f++) {
        lines.push(`FLOOR ${f+1}`);
        for (let r=0; r<ROWS; r++) {
          const rowTokens = [];
          for (let c=0; c<COLS; c++) {
            rowTokens.push(encodeCell(data[f][r*COLS + c]));
          }
          lines.push(rowTokens.join(' '));
        }
      }
      lines.push(`SELECT ${currentFloor+1} ${(currentIndex??0)+1}`);
      lines.push('END');
      return lines.join('\n');
    }

    function importText(txt) {
      const lines = txt.replace(/\r/g,'').split('\n').map(l=>l.trim()).filter(l=>l.length>0);
      if (!/^LABYRINTH-TEXT\b/i.test(lines[0]||'')) throw new Error('Нет заголовка LABYRINTH-TEXT');
      const sizeLine = lines.find(l=>/^SIZE\b/i.test(l));
      if (!sizeLine) throw new Error('Отсутствует строка SIZE');
      const sizeMatch = sizeLine.match(/SIZE\s+(\d+)\s+(\d+)/i);
      if (!sizeMatch) throw new Error('Некорректная строка SIZE');
      const w = parseInt(sizeMatch[1],10), h=parseInt(sizeMatch[2],10);
      if (w!==COLS || h!==ROWS) throw new Error('Неверный размер (ожидается 15 15)');
      if (!lines.find(l=>/^FLOORS\s+2$/i.test(l))) throw new Error('Нет строки FLOORS 2');
      const floorBlocks = [];
      for (let f=1; f<=2; f++) {
        const idx = lines.findIndex(l=>new RegExp(`^FLOOR\\s+${f}$`,'i').test(l));
        if (idx === -1) throw new Error('Не найден FLOOR '+f);
        const rowsData = [];
        for (let r=0; r<ROWS; r++) {
          const line = lines[idx+1+r];
          if (!line) throw new Error(`Недостаточно строк для FLOOR ${f}`);
          const tokens = line.split(/\s+/);
            if (tokens.length !== COLS) throw new Error(`Строка ${r+1} этажа ${f}: ожидается ${COLS} токенов`);
          rowsData.push(tokens);
        }
        floorBlocks.push(rowsData);
      }
      const newData = [];
      for (let f=0; f<2; f++) {
        const arr = [];
        for (let r=0; r<ROWS; r++) {
          for (let c=0; c<COLS; c++) {
            const token = floorBlocks[f][r][c];
            const m = token.match(/^([0-9A-Fa-f])([FLEO]*)$/);
            if (!m) throw new Error(`Неверный токен "${token}" (этаж ${f+1}, r${r+1}, c${c+1})`);
            const walls = parseInt(m[1],16);
            const flags = m[2]||'';
            arr.push({
              walls,
              fork: flags.includes('F'),
              ladder: flags.includes('L'),
              exit: flags.includes('E'),
              opened: flags.includes('O')
            });
          }
        }
        newData.push(arr);
      }
      const selectLine = lines.find(l=>/^SELECT\b/i.test(l));
      let selFloor=1, selIndex=1;
      if (selectLine) {
        const sm = selectLine.match(/SELECT\s+(\d+)\s+(\d+)/i);
        if (sm) {
          selFloor = Math.min(Math.max(parseInt(sm[1],10),1),2);
          selIndex = Math.min(Math.max(parseInt(sm[2],10),1),TOTAL);
        }
      }
      data = newData;
      currentFloor = selFloor-1;
      currentIndex = selIndex-1;
      refreshGrid();
      document.querySelectorAll('#floorButtons button').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.floor) === currentFloor);
      });
      dirty = false;
    }

    function autoSave() {
      if (suppressAutoSave) return;
      if (!dirty) return;
      const exported = exportData();
      try {
        localStorage.setItem(AUTO_KEY, exported);
        status('Автосохранено');
      } catch(e) {
        status('Ошибка автосохранения: ' + e.message);
      }
      dirty = false;
    }

    function restoreFromAutosave(raw) {
      try {
        suppressAutoSave = true;
        importData(raw);
        exportAllFormatsToAreas();
        suppressAutoSave = false;
        dirty = false;
        status('Восстановлено из автосохранения');
      } catch(e) {
        suppressAutoSave = false;
        status('Не удалось восстановить: ' + e.message);
        alert('Ошибка восстановления: ' + e.message);
      }
    }

    function showAutosavePromptIfNeeded() {
      if (!existingAutosaveRaw) {
        status('Автосохранение отсутствует');
        startNormalSession();
        return;
      }
      pendingAutosaveDecision = true;
      suppressAutoSave = true;
      const banner = document.createElement('div');
      banner.id = 'autosavePrompt';
      banner.style.cssText = `
        position:relative;
        margin: 8px 0 10px;
        padding:10px 12px;
        border:1px solid #c7d7ef;
        background:#f0f6ff;
        border-radius:10px;
        font-size:13px;
        line-height:1.35;
        display:flex;
        flex-wrap:wrap;
        gap:10px;
        align-items:center;
      `;
      banner.innerHTML = `
        <span style="font-weight:600;">Найдено предыдущее автосохранение.</span>
        <span>Загрузить его?</span>
        <div style="margin-left:auto;display:flex;gap:8px;">
          <button type="button" id="autosaveLoadBtn" class="primary" style="min-height:32px;">Загрузить</button>
          <button type="button" id="autosaveDismissBtn" style="min-height:32px;">Игнорировать</button>
        </div>
      `;
      const container = document.getElementById('controlPanel') ||
                        document.querySelector('#controlPanelContainer') ||
                        document.body;
      container.insertBefore(banner, container.firstChild);
      status('Найдено автосохранение (ожидание решения)');

      banner.querySelector('#autosaveLoadBtn').addEventListener('click', () => {
        restoreFromAutosave(existingAutosaveRaw);
        if (currentIndex === null) currentIndex = 0;
        pendingAutosaveDecision = false;
        suppressAutoSave = false;
        banner.remove();
      });
      banner.querySelector('#autosaveDismissBtn').addEventListener('click', () => {
        status('Старое автосохранение проигнорировано');
        pendingAutosaveDecision = false;
        suppressAutoSave = false;
        banner.remove();
        startNormalSession(true);
      });
    }

    function startNormalSession(fromIgnore = false) {
      if (currentIndex === null) {
        const prevSuppressed = suppressAutoSave;
        suppressAutoSave = true;
        currentIndex = 0;
        refreshGrid();
        updateOpenedButtonVisual();
        updateWallsButtonsState();
        updateCellInfo();
        suppressAutoSave = prevSuppressed;
      }
      exportAllFormatsToAreas();
      if (fromIgnore) {
        dirty = true;
        autoSave();
      }
    }

    function exportAllFormatsToAreas() {
      jsonArea.value = exportData();
      textArea.value = exportText();
    }

    function downloadJSON() {
      const blob = new Blob([exportData()], { type:'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'labyrinth_15x15.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); },0);
    }

    function clearCurrent() {
      if (currentIndex === null) return;
      data[currentFloor][currentIndex] = createCellState();
      refreshGrid();
      markDirty('clear current');
      autoSave();
    }
    function clearFloor() {
      if (!confirm('Очистить весь текущий этаж?')) return;
      data[currentFloor] = Array.from({ length: TOTAL }, createCellState);
      refreshGrid();
      markDirty('clear floor');
      autoSave();
    }
    function clearAll() {
      if (!confirm('Полный сброс двух этажей?')) return;
      data = [
        Array.from({ length: TOTAL }, createCellState),
        Array.from({ length: TOTAL }, createCellState)
      ];
      currentIndex = null;
      refreshGrid();
      markDirty('clear all');
      autoSave();
    }

    function applyZoom(val) {
      document.documentElement.style.setProperty('--size-base', val);
      zoomValueEl.textContent = val + 'px';
    }

    // Слушатели
    zoomRangeEl.addEventListener('input', e => applyZoom(e.target.value));

    document.getElementById('moveUp').addEventListener('click', () => moveSelection(-1,0));
    document.getElementById('moveDown').addEventListener('click', () => moveSelection(1,0));
    document.getElementById('moveLeft').addEventListener('click', () => moveSelection(0,-1));
    document.getElementById('moveRight').addEventListener('click', () => moveSelection(0,1));

    document.querySelectorAll('.walls-dpad [data-wall]').forEach(btn =>
      btn.addEventListener('click', () => toggleWall(btn.dataset.wall))
    );

    markOpenedBtn.addEventListener('click', toggleOpened);
    document.getElementById('toggleFork').addEventListener('click', () => toggleMarker('fork'));
    document.getElementById('toggleLadder').addEventListener('click', () => toggleMarker('ladder'));
    document.getElementById('toggleExit').addEventListener('click', () => toggleMarker('exit'));

    document.getElementById('exportBtn').addEventListener('click', () => {
      exportAllFormatsToAreas();
      status('Сохранено: JSON + текст в поля');
    });

    document.getElementById('importBtn').addEventListener('click', (e) => {
      const ttxt = textArea.value.trim();
      const jtxt = jsonArea.value.trim();
      const needFile = e.shiftKey || (!ttxt && !jtxt);
      if (needFile) {
        fileInput.value = '';
        fileInput.click();
        status(e.shiftKey ? 'Открыт диалог выбора файла (Shift)' : 'Поля пусты — открыт диалог файла');
        return;
      }
      try {
        suppressAutoSave = true;
        if (ttxt) {
          importText(ttxt);
          status('Загружено из текста');
        } else {
          importData(jtxt);
          status('Загружено из JSON');
        }
        suppressAutoSave = false;
        exportAllFormatsToAreas();
      } catch(err) {
        suppressAutoSave = false;
        alert(err.message);
        status('Ошибка загрузки: '+err.message);
      }
    });

    importFileBtn.addEventListener('click', () => {
      fileInput.value = '';
      fileInput.click();
      status('Открыт диалог выбора файла');
    });

    document.getElementById('downloadBtn').addEventListener('click', downloadJSON);

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const content = reader.result;
        try {
          suppressAutoSave = true;
          if (/^LABYRINTH-TEXT/i.test(content.trim())) {
            importText(content);
            status('Файл загружен (текст)');
          } else {
            importData(content);
            status('Файл загружен (JSON)');
          }
          suppressAutoSave = false;
          exportAllFormatsToAreas();
        } catch(err) {
          suppressAutoSave = false;
          alert('Ошибка файла: '+err.message);
          status('Ошибка файла: '+err.message);
        }
      };
      reader.readAsText(file);
    });

    document.getElementById('clearCurrent').addEventListener('click', clearCurrent);
    document.getElementById('clearFloor').addEventListener('click', clearFloor);
    document.getElementById('clearAll').addEventListener('click', clearAll);

    document.getElementById('floorButtons').addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON') setFloor(parseInt(e.target.dataset.floor));
    });

    document.addEventListener('keydown', (e) => {
      if (e.target.matches('textarea, input, [contenteditable="true"]')) return;
      switch (e.key.toLowerCase()) {
        case 'arrowup':
        case 'w': moveSelection(-1,0); e.preventDefault(); break;
        case 'arrowdown':
        case 's': moveSelection(1,0); e.preventDefault(); break;
        case 'arrowleft':
        case 'a': moveSelection(0,-1); e.preventDefault(); break;
        case 'arrowright':
        case 'd': moveSelection(0,1); e.preventDefault(); break;
        case '1': toggleWall('top'); break;
        case '2': toggleWall('right'); break;
        case '3': toggleWall('bottom'); break;
        case '4': toggleWall('left'); break;
        case 'f': toggleMarker('fork'); break;
        case 'l': toggleMarker('ladder'); break;
        case 'h': toggleMarker('exit'); break;
        case 'e': toggleOpened(); break;
        case 'tab':
          setFloor(currentFloor === 0 ? 1 : 0);
          e.preventDefault();
          break;
      }
    });

    let lastTapTime = 0;
    gridEl.addEventListener('touchend', () => {
      const now = Date.now();
      if (now - lastTapTime < 350) {
        const cur = parseInt(zoomRangeEl.value,10);
        const next = cur < 34 ? 40 : 24;
        zoomRangeEl.value = next;
        applyZoom(next);
        status('Быстрое масштабирование: ' + next + 'px');
      }
      lastTapTime = now;
    });

    function autoInitZoom() {
      const vw = window.innerWidth;
      let suggested = 32;
      if (vw < 380) suggested = 20;
      else if (vw < 430) suggested = 22;
      else if (vw < 500) suggested = 24;
      else if (vw < 620) suggested = 26;
      zoomRangeEl.value = suggested;
      applyZoom(suggested);
    }

    // Инициализация
    buildGrid();
    autoInitZoom();
    showAutosavePromptIfNeeded();

  })();