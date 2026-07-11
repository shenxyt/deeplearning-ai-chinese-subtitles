// 链接保存窗口:把想看的课程/页面链接存成待执行任务。
// 数据存 chrome.storage.local 的 TASKS_KEY 下,与字幕缓存(subs:*)隔离。

const TASKS_KEY = 'tasks:links';

const $ = id => document.getElementById(id);
const listEl = $('list');
const countEl = $('count');

async function loadTasks() {
  const data = await chrome.storage.local.get(TASKS_KEY);
  return data[TASKS_KEY] || [];
}

async function saveTasks(tasks) {
  await chrome.storage.local.set({ [TASKS_KEY]: tasks });
}

function normalizeUrl(raw) {
  let s = raw.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try {
    return new URL(s).href;
  } catch {
    return null;
  }
}

function render(tasks, flashId) {
  const pending = tasks.filter(t => !t.done).length;
  countEl.textContent = tasks.length ? `待办 ${pending} / 共 ${tasks.length}` : '';

  if (!tasks.length) {
    listEl.innerHTML = '<div class="empty">还没有保存的链接<br>点上面「保存当前页面」或粘贴链接添加</div>';
    return;
  }

  listEl.textContent = '';
  // 未完成在前,新的在前
  const sorted = [...tasks].sort((a, b) => (a.done - b.done) || (b.createdAt - a.createdAt));
  for (const t of sorted) {
    const row = document.createElement('div');
    row.className = 'task' + (t.done ? ' done' : '') + (t.id === flashId ? ' flash' : '');

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!t.done;
    cb.title = t.done ? '标记为待办' : '标记为已完成';
    cb.addEventListener('change', () => toggleDone(t.id));

    const body = document.createElement('div');
    body.className = 'body';

    const a = document.createElement('a');
    a.className = 'title';
    a.textContent = t.title || t.url;
    a.href = t.url;
    a.title = t.url;
    a.addEventListener('click', e => {
      e.preventDefault();
      chrome.tabs.create({ url: t.url });
    });
    body.appendChild(a);

    if (t.title) {
      const u = document.createElement('div');
      u.className = 'url';
      u.textContent = t.url;
      body.appendChild(u);
    }
    if (t.note) {
      const n = document.createElement('div');
      n.className = 'note';
      n.textContent = '📝 ' + t.note;
      body.appendChild(n);
    }

    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '✕';
    del.title = '删除';
    del.addEventListener('click', () => removeTask(t.id));

    row.appendChild(cb);
    row.appendChild(body);
    row.appendChild(del);
    listEl.appendChild(row);
  }

  if (flashId) {
    setTimeout(() => {
      const el = listEl.querySelector('.task.flash');
      if (el) el.classList.remove('flash');
    }, 800);
  }
}

async function addTask({ url, title, note }) {
  const tasks = await loadTasks();
  const existing = tasks.find(t => t.url === url);
  if (existing) {
    // 已存在就不重复加,补充备注并高亮提示
    if (note) existing.note = note;
    existing.done = false;
    await saveTasks(tasks);
    render(tasks, existing.id);
    return;
  }
  const task = {
    id: Date.now() + ':' + Math.random().toString(36).slice(2, 8),
    url,
    title: title || '',
    note: note || '',
    done: false,
    createdAt: Date.now(),
  };
  tasks.push(task);
  await saveTasks(tasks);
  render(tasks, task.id);
}

async function toggleDone(id) {
  const tasks = await loadTasks();
  const t = tasks.find(x => x.id === id);
  if (t) t.done = !t.done;
  await saveTasks(tasks);
  render(tasks);
}

async function removeTask(id) {
  const tasks = (await loadTasks()).filter(t => t.id !== id);
  await saveTasks(tasks);
  render(tasks);
}

$('saveCurrent').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !/^https?:/i.test(tab.url)) return;
  await addTask({ url: tab.url, title: tab.title, note: $('noteInput').value.trim() });
  $('noteInput').value = '';
});

$('addBtn').addEventListener('click', addManual);
$('urlInput').addEventListener('keydown', e => { if (e.key === 'Enter') addManual(); });
$('noteInput').addEventListener('keydown', e => { if (e.key === 'Enter') addManual(); });

async function addManual() {
  const url = normalizeUrl($('urlInput').value);
  if (!url) {
    $('urlInput').focus();
    $('urlInput').style.borderColor = '#d93025';
    setTimeout(() => { $('urlInput').style.borderColor = ''; }, 1200);
    return;
  }
  await addTask({ url, note: $('noteInput').value.trim() });
  $('urlInput').value = '';
  $('noteInput').value = '';
}

$('clearDone').addEventListener('click', async () => {
  const tasks = (await loadTasks()).filter(t => !t.done);
  await saveTasks(tasks);
  render(tasks);
});

loadTasks().then(render);
