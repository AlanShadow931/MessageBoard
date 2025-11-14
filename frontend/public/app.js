const API = '/api';

const state = {
  me: null,
  tags: [],
  messages: [],
  filterTag: '',
  sse: null,
  notifyCount: 0,
};

function $(q) { return document.querySelector(q); }
function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v);
  });
  for (const c of children) e.append(c);
  return e;
}

async function api(path, opts={}) {
  const res = await fetch(API + path, { credentials: 'include', ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers||{}) } });
  if (!res.ok) throw await res.json().catch(() => ({ error: '錯誤' }));
  return res.json();
}
async function apiForm(path, form) {
  const res = await fetch(API + path, { method: 'POST', credentials: 'include', body: form });
  if (!res.ok) throw await res.json().catch(() => ({ error: '錯誤' }));
  return res.json();
}

function setTheme(theme) {
  if (theme === 'light') document.documentElement.classList.add('light');
  else document.documentElement.classList.remove('light');
  localStorage.setItem('theme', theme);
}

function escapeHTML(s) {
  return s.replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

// 將極簡 Markdown（圖片、連結、自動連結、換行）轉安全 HTML
function renderContent(text) {
  let out = escapeHTML(text || '');

  // 圖片：只允許 /uploads 或 http(s)
  out = out.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+|\/uploads\/[^\s)]+)\)/g, (m, alt, url) => {
    const safeAlt = escapeHTML(alt || '');
    const ok = /^(https?:\/\/|\/uploads\/)/.test(url);
    if (!ok) return m; // 不轉換不安全來源
    return `<img src="${url}" alt="${safeAlt}">`;
  });

  // 連結：[text](http...)
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, text, href) => {
    const safeText = escapeHTML(text);
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${safeText}</a>`;
  });

  // 自動連結 http(s)://... （避免破壞已轉換的標籤，先簡單排除以 < 開頭的）
  out = out.replace(/(^|[\s])((https?:\/\/[^\s<]+))/g, (m, pre, url) => {
    return `${pre}<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
  });

  // 換行
  out = out.replace(/\n/g, '<br>');
  return out;
}

// Auth UI
function renderAuth() {
  if (state.me) {
    $('#authArea').classList.add('hidden');
    $('#userArea').classList.remove('hidden');
    $('#userDisplay').textContent = `${state.me.display_name} (${state.me.role})`;
  } else {
    $('#authArea').classList.remove('hidden');
    $('#userArea').classList.add('hidden');
  }
}

// Tags
async function loadTags() {
  state.tags = await api('/tags');
  const filter = $('#tagFilter');
  filter.innerHTML = '<option value="">全部標籤</option>';
  state.tags.forEach(t => filter.append(el('option', { value: t.id }, t.name)));
  const list = $('#tagPanel #tagList');
  list.innerHTML = '';
  state.tags.forEach(t => {
    list.append(el('span', { class: 'tag' }, t.name));
  });
}

// Messages
async function loadMessages() {
  const q = $('#searchInput').value.trim();
  const tagId = $('#tagFilter').value;
  const qs = new URLSearchParams();
  if (q) qs.set('q', q);
  if (tagId) qs.set('tagId', tagId);
  state.messages = await api('/messages?' + qs.toString());
  renderMessages();
}

function renderMessages() {
  const box = $('#messageList');
  box.innerHTML = '';
  state.messages.filter(m => !m.parent_id).forEach(m => box.append(renderMessage(m)));
}

function renderMessage(m) {
  const meta = el('div', { class: 'meta' }, `${m.author.display_name} • ${new Date(m.created_at).toLocaleString()} ${m.edited ? '(已編輯)' : ''}`);
  const content = el('div', { class: 'content', html: renderContent(m.content) });

  const tagBox = el('div', {}, ...(m.tags||[]).map(tid => {
    const tag = state.tags.find(t => t.id === tid);
    return el('span', { class: 'tag' }, tag ? tag.name : `#${tid}`);
  }));

  const actions = el('div', { class: 'actions' },
    el('button', { onclick: () => like(m.id, 1) }, `👍 ${m.likes}`),
    el('button', { onclick: () => like(m.id, -1) }, `👎 ${m.dislikes}`),
    el('button', { class: 'secondary', onclick: () => replyTo(m) }, '回覆'),
    el('button', { class: 'secondary', onclick: () => report(m) }, '檢舉'),
  );

  if (state.me && (state.me.id === m.author.id || ['admin','moderator'].includes(state.me.role))) {
    actions.append(
      el('button', { class: 'secondary', onclick: () => editMessage(m) }, '編輯'),
      el('button', { class: 'danger', onclick: () => delMessage(m) }, '刪除'),
    );
  }

  // 套用標籤（作者或工作人員）
  if (state.me && (state.me.id === m.author.id || ['admin','moderator'].includes(state.me.role))) {
    const sel = el('select', { multiple: true, size: 3 });
    state.tags.forEach(t => sel.append(el('option', { value: t.id, ...(m.tags?.includes(t.id) ? { selected: true } : {}) }, t.name)));
    actions.append(
      sel,
      el('button', { class: 'secondary', onclick: async () => {
        const tag_ids = Array.from(sel.selectedOptions).map(o => Number(o.value));
        await api('/tags/apply', { method: 'POST', body: JSON.stringify({ message_id: m.id, tag_ids }) });
        await loadMessages();
      } }, '套用標籤')
    );
  }

  const root = el('div', { class: 'message' },
    meta, content, tagBox, actions,
    el('div', { class: 'replies', id: `replies-${m.id}` }, el('div', { class: 'muted' }, '載入回覆中...'))
  );

  // 載入回覆
  (async () => {
    const replies = await api(`/messages/${m.id}/replies`);
    const box = root.querySelector(`#replies-${m.id}`);
    box.innerHTML = '';
    replies.forEach(r => box.append(renderMessage(r)));
  })();

  return root;
}

async function postMessage(parent_id = null) {
  const content = $('#messageInput').value.trim();
  let imageUrl = null;
  const file = $('#imageFile').files?.[0];
  if (file) {
    const form = new FormData();
    form.append('image', file);
    const up = await apiForm('/upload', form);
    imageUrl = up.url;
  }
  const finalContent = imageUrl ? `${content}\n\n![image](${imageUrl})` : content;
  await api('/messages', { method: 'POST', body: JSON.stringify({ content: finalContent, parent_id }) });
  $('#messageInput').value = '';
  $('#imageFile').value = '';
  await loadMessages();
}

async function editMessage(m) {
  const content = prompt('編輯內容：', m.content);
  if (content == null) return;
  await api(`/messages/${m.id}`, { method: 'PUT', body: JSON.stringify({ content }) });
  await loadMessages();
}

async function delMessage(m) {
  if (!confirm('確定刪除？')) return;
  await api(`/messages/${m.id}`, { method: 'DELETE' });
  await loadMessages();
}

async function like(id, value) {
  await api(`/messages/${id}/like`, { method: 'POST', body: JSON.stringify({ value }) });
  await loadMessages();
}

async function report(m) {
  const reason = prompt('請輸入檢舉理由：');
  if (!reason) return;
  await api(`/messages/${m.id}/report`, { method: 'POST', body: JSON.stringify({ reason }) });
  alert('已送出檢舉');
}

function replyTo(m) {
  const content = prompt(`回覆 ${m.author.display_name}:`);
  if (!content) return;
  api('/messages', { method: 'POST', body: JSON.stringify({ content, parent_id: m.id }) }).then(loadMessages);
}

// Auth
function openLogin() { $('#loginDialog').showModal(); }
function openRegister() { $('#registerDialog').showModal(); }

async function doLogin() {
  const username = $('#loginUsername').value.trim();
  const password = $('#loginPassword').value.trim();
  try {
    state.me = await api('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    $('#loginDialog').close();
    renderAuth(); applyThemeFromUser();
    startSSE(); await refreshAll();
  } catch (e) {
    alert(e.error || '登入失敗');
  }
}

async function doRegister() {
  const username = $('#regUsername').value.trim();
  const displayName = $('#regDisplay').value.trim();
  const password = $('#regPassword').value.trim();
  try {
    state.me = await api('/auth/register', { method: 'POST', body: JSON.stringify({ username, password, displayName }) });
    $('#registerDialog').close();
    renderAuth(); applyThemeFromUser();
    startSSE(); await refreshAll();
  } catch (e) {
    alert(e.error || '註冊失敗');
  }
}

async function logout() {
  await api('/auth/logout', { method: 'POST' });
  state.me = null;
  stopSSE();
  renderAuth();
}

async function me() {
  try {
    state.me = await api('/auth/me');
  } catch {
    state.me = null;
  }
  renderAuth();
  applyThemeFromUser();
}

function applyThemeFromUser() {
  const saved = localStorage.getItem('theme');
  if (state.me?.theme) setTheme(state.me.theme);
  else if (saved) setTheme(saved);
  else setTheme('light');
}

async function saveSettings() {
  const display_name = $('#setDisplay').value.trim();
  const password = $('#setPassword').value.trim();
  const theme = $('#setTheme').value;
  await api('/users/me', { method: 'PUT', body: JSON.stringify({ display_name, password: password || undefined, theme }) });
  alert('已儲存');
  $('#settingsDialog').close();
  await me();
}

async function applyRole() {
  const uid = $('#roleUserId').value.trim();
  const role = $('#roleSelect').value;
  if (!uid) return;
  await api(`/users/${uid}/role`, { method: 'PUT', body: JSON.stringify({ role }) });
  alert('已套用');
}

function openSettings() {
  if (state.me?.role === 'admin') $('#roleAdmin').classList.remove('hidden');
  else $('#roleAdmin').classList.add('hidden');
  $('#setDisplay').value = state.me?.display_name || '';
  $('#setTheme').value = state.me?.theme || 'light';
  $('#setPassword').value = '';
  $('#settingsDialog').showModal();
}

// Notifications
function startSSE() {
  stopSSE();
  if (!state.me) return;
  const sse = new EventSource('/api/notifications/stream', { withCredentials: true });
  sse.onmessage = (ev) => {
    state.notifyCount++;
    $('#notifyCount').textContent = String(state.notifyCount);
  };
  sse.onerror = () => { /* auto-retry */ };
  state.sse = sse;
}
function stopSSE() {
  if (state.sse) { state.sse.close(); state.sse = null; }
}
async function openNotifications() {
  const list = await api('/notifications');
  const box = $('#notifyList');
  box.innerHTML = '';
  list.forEach(n => {
    const type = n.type === 'reply' ? '有人回覆了你的留言' : '你的留言有新的反應';
    box.append(el('div', { class: 'message' }, `${type} (${new Date(n.created_at).toLocaleString()})`));
  });
  $('#notifyDialog').showModal();
}
async function markRead() {
  await api('/notifications/read', { method: 'POST' });
  state.notifyCount = 0;
  $('#notifyCount').textContent = '0';
  $('#notifyDialog').close();
}

// Emojis
const EMOJIS = ['😀','😄','😁','😊','😎','😍','🤗','🤔','👍','👎','🎉','🔥','🚀','💡','⚠️','✅','❌','🙌','👏','🤝','😢','😭','😡','🥳','💯'];
function setupEmojiPicker() {
  const picker = $('#emojiPicker');
  picker.innerHTML = '';
  EMOJIS.forEach(e => picker.append(el('span', { class: 'emoji', onclick: () => {
    const ta = $('#messageInput');
    ta.value += e;
    picker.classList.add('hidden');
  } }, e)));
}

// Events
$('#themeToggle').addEventListener('click', () => {
  const current = document.documentElement.classList.contains('light') ? 'light' : 'dark';
  const next = current === 'light' ? 'dark' : 'light';
  setTheme(next);
  // 同步到後端，並更新本地狀態，讓設定頁面顯示一致
  if (state.me) {
    state.me.theme = next;
    api('/users/me', { method: 'PUT', body: JSON.stringify({ theme: next }) }).catch(()=>{});
  }
});
$('#loginBtn').addEventListener('click', openLogin);
$('#registerBtn').addEventListener('click', openRegister);
$('#doLogin').addEventListener('click', (e)=>{ e.preventDefault(); doLogin(); });
$('#toRegister').addEventListener('click', (e)=>{ e.preventDefault(); $('#loginDialog').close(); openRegister(); });
$('#doRegister').addEventListener('click', (e)=>{ e.preventDefault(); doRegister(); });
$('#logoutBtn').addEventListener('click', logout);
$('#postBtn').addEventListener('click', ()=> postMessage());
$('#refreshBtn').addEventListener('click', loadMessages);
$('#searchInput').addEventListener('keydown', (e)=>{ if(e.key==='Enter') loadMessages(); });
$('#tagFilter').addEventListener('change', loadMessages);
$('#settingsBtn').addEventListener('click', openSettings);
$('#saveSettings').addEventListener('click', (e)=>{ e.preventDefault(); saveSettings(); });
$('#applyRole').addEventListener('click', (e)=>{ e.preventDefault(); applyRole(); });
$('#notifyBtn').addEventListener('click', openNotifications);
$('#markRead').addEventListener('click', (e)=>{ e.preventDefault(); markRead(); });

$('#emojiBtn').addEventListener('click', ()=>{
  const p = $('#emojiPicker');
  if (p.classList.contains('hidden')) { setupEmojiPicker(); p.classList.remove('hidden'); }
  else p.classList.add('hidden');
});
document.addEventListener('click', (e)=>{
  if (!$('#emojiPicker').contains(e.target) && e.target.id !== 'emojiBtn') {
    $('#emojiPicker').classList.add('hidden');
  }
});

// 標籤建立
$('#addTagBtn').addEventListener('click', async ()=>{
  const name = $('#newTagInput').value.trim();
  if (!name) return;
  try {
    await api('/tags', { method: 'POST', body: JSON.stringify({ name }) });
    $('#newTagInput').value = '';
    await loadTags(); await loadMessages();
  } catch(e) {
    alert(e.error || '建立標籤失敗（需要版主或管理員）');
  }
});

async function refreshAll() {
  await loadTags();
  await loadMessages();
}

(async function init() {
  // 初始主題
  const saved = localStorage.getItem('theme') || 'light';
  setTheme(saved);
  await me();
  await refreshAll();
  startSSE();
})();