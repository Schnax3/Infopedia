// ══════════════════════════════════════════════════════════════════
//  INFOPEDIA — main.js
//  Firebase Realtime Database + Auth  |  Roles: admin / mod / user
// ══════════════════════════════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getDatabase, ref, set, get, push, update, remove,
  onValue, serverTimestamp, query, orderByChild, limitToLast
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ─── Firebase Config ──────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyDV3g-gsC9cLB2ownqdz4ovFHK17A8JHMg",
  authDomain: "infopedia-62afe.firebaseapp.com",
  databaseURL: "https://infopedia-62afe-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "infopedia-62afe",
  storageBucket: "infopedia-62afe.firebasestorage.app",
  messagingSenderId: "669538536608",
  appId: "1:669538536608:web:03e64ce7d484580e00cdc5",
  measurementId: "G-HKVJFBPFYZ"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getDatabase(app);

// ─── App State ────────────────────────────────────────────────────
let currentUser    = null;   // Firebase Auth user
let currentProfile = null;   // DB profile { displayName, role, … }
let currentPage    = 'home';
let unsubscribers  = [];     // onValue listeners to clean up

// ─── Helpers ──────────────────────────────────────────────────────
const $    = id => document.getElementById(id);
const app$ = ()  => $('app');

function toast(msg, type = '') {
  const t = $('toast');
  t.textContent = msg;
  t.className   = type;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 3200);
}

function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(typeof v === 'number' ? v : Date.now());
  return d.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtDateTime(v) {
  if (!v) return '—';
  const d = new Date(typeof v === 'number' ? v : Date.now());
  return d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Parse simple wiki markup to HTML
function wikiToHtml(src) {
  let html = escHtml(src);
  html = html.replace(/^====(.+?)====$/gm, '<h4>$1</h4>');
  html = html.replace(/^===(.+?)===$/gm,  '<h3>$1</h3>');
  html = html.replace(/^==(.+?)==$/gm,    '<h2 id="s-$1">$1</h2>');
  html = html.replace(/'''(.+?)'''/g,     '<strong>$1</strong>');
  html = html.replace(/''(.+?)''/g,       '<em>$1</em>');
  html = html.replace(/\[\[(.+?)\|(.+?)\]\]/g, '<a href="#" onclick="navigate(\'article\',\'$1\')">$2</a>');
  html = html.replace(/\[\[(.+?)\]\]/g,   '<a href="#" onclick="navigate(\'article\',\'$1\')">$1</a>');
  html = html.replace(/^# (.+)$/gm,       '<li style="margin-left:1.5rem;list-style:decimal">$1</li>');
  html = html.replace(/^\* (.+)$/gm,      '<li style="margin-left:1.5rem;list-style:disc">$1</li>');
  html = html.replace(/\n{2,}/g,          '</p><p>');
  return '<p>' + html + '</p>';
}

function extractToc(src) {
  const heads = [];
  const re = /^==([^=].+?)==$/gm;
  let m;
  while ((m = re.exec(src)) !== null) heads.push(m[1].trim());
  return heads;
}

function slugify(s) {
  return s.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

// ─── Navigation ───────────────────────────────────────────────────
window.navigate = function(page, arg = '') {
  unsubscribers.forEach(u => u());
  unsubscribers = [];
  currentPage = page;
  window.scrollTo(0, 0);
  switch (page) {
    case 'home':     renderHome();          break;
    case 'article':  renderArticle(arg);    break;
    case 'edit':     renderEditor(arg);     break;
    case 'create':   renderEditor('');      break;
    case 'admin':    renderAdminPanel();    break;
    case 'mod':      renderModPanel();      break;
    case 'profile':  renderProfile();       break;
    case 'apply':    renderApply();         break;
    case 'logs':     renderLogs(arg);       break;
    case 'category': renderCategory(arg);   break;
    default:         renderHome();
  }
};

// ─── Auth UI ──────────────────────────────────────────────────────
function renderAuthArea() {
  const area = $('auth-area');
  if (!currentUser) {
    area.innerHTML = `
      <button class="nav-btn" onclick="showAuth('login')">Sign in</button>
      <button class="nav-btn" onclick="showAuth('register')">Join</button>`;
  } else {
    const r        = currentProfile?.role || 'user';
    const initials = (currentProfile?.displayName || currentUser.email || 'U').slice(0, 2).toUpperCase();
    area.innerHTML = `
      <div class="user-badge" onclick="toggleUserMenu()">
        <div class="avatar ${r}">${initials}</div>
        <span class="user-menu-trigger">
          ${escHtml(currentProfile?.displayName || currentUser.email)}
          <span class="role-pill ${r}">${r}</span>
        </span>
        <div id="user-dropdown" class="user-dropdown hidden" onclick="event.stopPropagation()">
          <div class="ud-item" onclick="navigate('profile')">My Profile</div>
          ${r !== 'user' ? `<div class="ud-item" onclick="navigate('${r}')">
            ${r === 'admin' ? 'Admin Panel' : 'Mod Panel'}
          </div>` : ''}
          ${r === 'user' ? `<div class="ud-item" onclick="navigate('apply')">Apply for Mod</div>` : ''}
          <div class="ud-item" onclick="navigate('create')">Create Article</div>
          <div class="ud-item danger" onclick="doSignOut()">Sign out</div>
        </div>
      </div>`;
  }
}

window.toggleUserMenu = function() {
  const dd = $('user-dropdown');
  dd.classList.toggle('hidden');
  setTimeout(() => {
    document.addEventListener('click', () => dd.classList.add('hidden'), { once: true });
  }, 0);
};

// ─── Auth Modal ───────────────────────────────────────────────────
window.showAuth = function(tab = 'login') {
  const mo = $('modal-overlay'), m = $('modal');
  mo.classList.remove('hidden');
  m.classList.remove('hidden');
  m.innerHTML = `
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <div class="auth-tabs">
      <div class="auth-tab ${tab === 'login' ? 'active' : ''}" id="tab-login" onclick="switchAuthTab('login')">Sign In</div>
      <div class="auth-tab ${tab === 'register' ? 'active' : ''}" id="tab-register" onclick="switchAuthTab('register')">Register</div>
    </div>
    <div id="auth-form"></div>`;
  renderAuthForm(tab);
};

window.switchAuthTab = function(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  $('tab-' + tab).classList.add('active');
  renderAuthForm(tab);
};

function renderAuthForm(tab) {
  const f = $('auth-form');
  if (tab === 'login') {
    f.innerHTML = `
      <div class="field-group">
        <label class="field-label">Email</label>
        <input class="field-input" type="email" id="ai-email" placeholder="you@example.com">
      </div>
      <div class="field-group">
        <label class="field-label">Password</label>
        <input class="field-input" type="password" id="ai-pass" placeholder="••••••••">
      </div>
      <button class="btn btn-primary" style="width:100%" onclick="doLogin()">Sign In</button>`;
  } else {
    f.innerHTML = `
      <div class="field-group">
        <label class="field-label">Display Name</label>
        <input class="field-input" type="text" id="ai-name" placeholder="Your username">
      </div>
      <div class="field-group">
        <label class="field-label">Email</label>
        <input class="field-input" type="email" id="ai-email" placeholder="you@example.com">
      </div>
      <div class="field-group">
        <label class="field-label">Password</label>
        <input class="field-input" type="password" id="ai-pass" placeholder="Min 6 characters">
      </div>
      <button class="btn btn-primary" style="width:100%" onclick="doRegister()">Create Account</button>`;
  }
}

window.closeModal = function() {
  $('modal-overlay').classList.add('hidden');
  $('modal').classList.add('hidden');
};

window.doLogin = async function() {
  const email = $('ai-email').value.trim();
  const pass  = $('ai-pass').value;
  try {
    await signInWithEmailAndPassword(auth, email, pass);
    closeModal();
    toast('Welcome back!', 'success');
  } catch (e) {
    toast('Login failed: ' + e.message, 'error');
  }
};

window.doRegister = async function() {
  const name  = $('ai-name')?.value.trim() || '';
  const email = $('ai-email').value.trim();
  const pass  = $('ai-pass').value;
  if (!name) { toast('Please enter a display name', 'error'); return; }
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, { displayName: name });
    await set(ref(db, `users/${cred.user.uid}`), {
      displayName: name,
      email,
      role: 'user',
      joinedAt: Date.now(),
      banned: false
    });
    closeModal();
    toast('Account created! Welcome to Infopedia.', 'success');
  } catch (e) {
    toast('Registration failed: ' + e.message, 'error');
  }
};

window.doSignOut = async function() {
  await signOut(auth);
  navigate('home');
  toast('Signed out.');
};

// ─── Load User Profile ────────────────────────────────────────────
async function loadProfile(uid) {
  const snap = await get(ref(db, `users/${uid}`));
  if (snap.exists()) {
    currentProfile = snap.val();
  } else {
    currentProfile = { displayName: currentUser.email, role: 'user', joinedAt: Date.now(), banned: false };
    await set(ref(db, `users/${uid}`), { ...currentProfile, email: currentUser.email });
  }
}

// ─── Auth State ───────────────────────────────────────────────────
onAuthStateChanged(auth, async user => {
  currentUser = user;
  if (user) {
    await loadProfile(user.uid);
    if (currentProfile.banned) {
      await signOut(auth);
      currentUser    = null;
      currentProfile = null;
      toast('Your account has been banned.', 'error');
    }
  } else {
    currentProfile = null;
  }
  renderAuthArea();
  navigate(currentPage);
});

// ─── HOME PAGE ────────────────────────────────────────────────────
async function renderHome() {
  app$().innerHTML = `<div class="loading-center"><div class="spinner"></div></div>`;
  const pagesSnap = await get(ref(db, 'articles'));
  const articles  = pagesSnap.exists() ? Object.entries(pagesSnap.val()) : [];
  const visible   = articles.filter(([, a]) => !a.deleted);
  const recent    = [...visible].sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0)).slice(0, 10);

  const cats = {};
  visible.forEach(([, a]) => {
    const c = a.category || 'Uncategorised';
    cats[c] = (cats[c] || 0) + 1;
  });

  app$().innerHTML = `
    <div class="page">
      <div class="home-hero">
        <h1><span style="color:var(--gold)">I</span>nfopedia</h1>
        <p class="tagline">The free encyclopedia that anyone can build.</p>
        <div class="home-stats">
          <div class="stat-item">
            <div class="stat-num">${visible.length}</div>
            <div class="stat-label">Articles</div>
          </div>
          <div class="stat-item">
            <div class="stat-num">${Object.keys(cats).length}</div>
            <div class="stat-label">Categories</div>
          </div>
        </div>
        ${currentUser
          ? `<button class="btn btn-primary" onclick="navigate('create')">+ New Article</button>`
          : `<button class="btn btn-primary" onclick="showAuth('register')">Get Started</button>`
        }
      </div>

      <h2>Browse by Category</h2>
      <div class="cat-grid">
        ${Object.entries(cats).map(([cat, count]) => `
          <div class="cat-card" onclick="navigate('category','${escHtml(cat)}')">
            <h3>${escHtml(cat)}</h3>
            <p>${count} article${count !== 1 ? 's' : ''}</p>
          </div>`).join('') || '<p class="muted">No categories yet.</p>'}
      </div>

      <div class="recent-articles">
        <h2>Recent Articles</h2>
        ${recent.length ? recent.map(([slug, a]) => `
          <div class="article-list-item">
            <div>
              <span class="ali-title" onclick="navigate('article','${escHtml(slug)}')">${escHtml(a.title)}</span>
              <span class="muted" style="margin-left:0.5rem">${escHtml(a.category || '')}</span>
            </div>
            <span class="ali-meta">${fmtDate(a.updatedAt)}</span>
          </div>`).join('')
        : '<p class="muted">No articles yet — be the first to create one!</p>'}
      </div>
    </div>`;
}

// ─── CATEGORY PAGE ────────────────────────────────────────────────
async function renderCategory(cat) {
  app$().innerHTML = `<div class="loading-center"><div class="spinner"></div></div>`;
  const snap     = await get(ref(db, 'articles'));
  const articles = snap.exists() ? Object.entries(snap.val()) : [];
  const filtered = articles
    .filter(([, a]) => !a.deleted && (a.category || 'Uncategorised') === cat)
    .sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0));

  app$().innerHTML = `
    <div class="page">
      <div class="flex-between mb1" style="align-items:center;flex-wrap:wrap;gap:0.75rem">
        <div>
          <h1 style="margin:0">${escHtml(cat)}</h1>
          <p class="muted" style="margin:0.25rem 0 0">${filtered.length} article${filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="navigate('home')">← All Categories</button>
      </div>
      <hr style="margin:1.25rem 0">

      ${filtered.length ? filtered.map(([slug, a]) => `
        <div class="article-list-item">
          <div>
            <span class="ali-title" onclick="navigate('article','${escHtml(slug)}')">${escHtml(a.title)}</span>
            ${a.subtitle ? `<span class="muted" style="margin-left:0.5rem;font-size:0.85rem">${escHtml(a.subtitle)}</span>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:1rem;flex-shrink:0">
            <span class="muted" style="font-size:0.8rem">by ${escHtml(a.authorName || '—')}</span>
            <span class="ali-meta">${fmtDate(a.updatedAt)}</span>
          </div>
        </div>`).join('')
      : `<div class="empty-state">
           <p>No articles in this category yet.</p>
           ${currentUser
             ? `<button class="btn btn-primary mt1" onclick="navigate('create')">Create the first one</button>`
             : `<button class="btn btn-secondary mt1" onclick="showAuth('register')">Join to contribute</button>`}
         </div>`}
    </div>`;
}

// ─── SEARCH ───────────────────────────────────────────────────────
const searchInput = $('search-input');
const searchDD    = $('search-results');
let searchTimer;

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const q = searchInput.value.trim().toLowerCase();
  if (!q) { searchDD.classList.add('hidden'); return; }
  searchTimer = setTimeout(async () => {
    const snap = await get(ref(db, 'articles'));
    if (!snap.exists()) return;
    const results = Object.entries(snap.val())
      .filter(([slug, a]) => !a.deleted && (
        a.title?.toLowerCase().includes(q) ||
        slug.toLowerCase().includes(q) ||
        a.category?.toLowerCase().includes(q)
      )).slice(0, 8);
    if (!results.length) { searchDD.classList.add('hidden'); return; }
    searchDD.innerHTML = results.map(([slug, a]) => `
      <div class="search-item" onclick="searchSelect('${escHtml(slug)}')">
        <div>${escHtml(a.title)}</div>
        <div class="s-cat">${escHtml(a.category || '')}</div>
      </div>`).join('');
    searchDD.classList.remove('hidden');
  }, 250);
});

window.searchSelect = function(slug) {
  searchDD.classList.add('hidden');
  searchInput.value = '';
  navigate('article', slug);
};

document.addEventListener('click', e => {
  if (!e.target.closest('.search-wrap')) searchDD.classList.add('hidden');
});

// ─── ARTICLE PAGE ─────────────────────────────────────────────────
async function renderArticle(slug) {
  if (!slug) { renderHome(); return; }
  app$().innerHTML = `<div class="loading-center"><div class="spinner"></div></div>`;

  const snap = await get(ref(db, `articles/${slug}`));
  if (!snap.exists() || snap.val().deleted) {
    app$().innerHTML = `
      <div class="page empty-state">
        <h3>Article not found</h3>
        <p>This article may have been deleted or never existed.</p>
        <button class="btn btn-secondary mt1" onclick="navigate('home')">← Back to Home</button>
      </div>`;
    return;
  }

  const article  = snap.val();
  const role     = currentProfile?.role || 'guest';
  const uid      = currentUser?.uid;
  const isOwner  = uid && article.authorId === uid;
  const canEdit  = currentUser && (role === 'admin' || role === 'mod' || isOwner);
  const toc      = extractToc(article.content || '');

  app$().innerHTML = `
    <div class="page">
      <div class="wiki-layout">
        <main>
          <div class="article-header">
            <h1 class="article-title">${escHtml(article.title)}</h1>
            ${article.subtitle ? `<p class="article-subtitle">${escHtml(article.subtitle)}</p>` : ''}
            <div class="article-meta">
              <span>Author: <strong>${escHtml(article.authorName || 'Unknown')}</strong></span>
              <span>Category:
                <strong>
                  <a href="#" onclick="navigate('category','${escHtml(article.category || 'Uncategorised')}')" style="color:inherit">
                    ${escHtml(article.category || '—')}
                  </a>
                </strong>
              </span>
              <span>Updated: <strong>${fmtDate(article.updatedAt)}</strong></span>
            </div>
          </div>

          <div class="article-actions">
            ${canEdit ? `<button class="btn btn-secondary btn-sm" onclick="navigate('edit','${slug}')">✎ Edit</button>` : ''}
            ${(role === 'mod' || role === 'admin') ? `
              <button class="btn btn-secondary btn-sm" onclick="navigate('logs','${slug}')">📋 Logs</button>` : ''}
            ${role === 'admin' ? `
              <button class="btn btn-warn btn-sm" onclick="deleteArticle('${slug}')">🗑 Delete Article</button>` : ''}
            <button class="btn btn-ghost btn-sm" onclick="navigate('home')">← Back</button>
          </div>

          <div class="article-body">${wikiToHtml(article.content || '')}</div>

          <div id="discussion-section"></div>
        </main>

        <aside>
          ${toc.length ? `
          <div class="sidebar-card">
            <h4>Contents</h4>
            <ul class="toc">
              ${toc.map(h => `<li><a href="#s-${escHtml(h)}">${escHtml(h)}</a></li>`).join('')}
            </ul>
          </div>` : ''}
          <div class="sidebar-card">
            <h4>Article Info</h4>
            <div class="sidebar-row"><span class="sidebar-label">Created</span><span class="sidebar-val">${fmtDate(article.createdAt)}</span></div>
            <div class="sidebar-row">
              <span class="sidebar-label">Category</span>
              <span class="sidebar-val">
                <a href="#" onclick="navigate('category','${escHtml(article.category || 'Uncategorised')}')" style="color:inherit">
                  ${escHtml(article.category || '—')}
                </a>
              </span>
            </div>
            <div class="sidebar-row"><span class="sidebar-label">Slug</span><span class="sidebar-val" style="font-family:monospace;font-size:0.78rem">${escHtml(slug)}</span></div>
          </div>
        </aside>
      </div>
    </div>`;

  loadDiscussions(slug);
}

// ─── DISCUSSIONS ──────────────────────────────────────────────────
function loadDiscussions(articleSlug) {
  const sec = $('discussion-section');
  if (!sec) return;
  const role   = currentProfile?.role || 'guest';
  const uid    = currentUser?.uid;
  const canMod = role === 'mod' || role === 'admin';

  const discRef = ref(db, `discussions/${articleSlug}`);
  const unsub = onValue(discRef, snap => {
    const threads = snap.exists()
      ? Object.entries(snap.val()).filter(([, t]) => !t.deleted)
      : [];

    sec.innerHTML = `
      <div class="discussion-section">
        <div class="discussion-header">
          <h2 style="border:none;margin:0">Discussion</h2>
          ${currentUser ? `<button class="btn btn-secondary btn-sm" onclick="openNewThread('${articleSlug}')">+ New Thread</button>` : ''}
        </div>
        ${threads.length === 0 ? '<p class="muted">No discussions yet.</p>' : ''}
        ${threads.map(([tid, thread]) => renderThreadHtml(articleSlug, tid, thread, uid, role, canMod)).join('')}
      </div>`;
  });
  unsubscribers.push(unsub);
}

function renderThreadHtml(slug, tid, thread, uid, role, canMod) {
  const msgs = thread.messages ? Object.entries(thread.messages) : [];
  return `
    <div class="disc-thread" id="thread-${tid}">
      <div class="disc-thread-header">
        <span class="disc-thread-title">${escHtml(thread.title)}</span>
        <div class="flex-gap">
          <span class="badge badge-${thread.closed ? 'closed' : 'open'}">${thread.closed ? 'Closed' : 'Open'}</span>
          ${canMod ? `
            <button class="btn btn-ghost btn-sm" onclick="toggleThreadClose('${slug}','${tid}',${!!thread.closed})">
              ${thread.closed ? 'Reopen' : 'Close'}
            </button>
            <button class="btn btn-ghost btn-sm" style="color:var(--accent)" onclick="deleteThread('${slug}','${tid}')">Delete</button>` : ''}
        </div>
      </div>
      ${msgs.map(([mid, msg]) => `
        <div class="disc-message">
          <div>
            <span class="disc-msg-author">${escHtml(msg.authorName)}</span>
            <span class="disc-msg-time">${fmtDateTime(msg.createdAt)}</span>
            ${msg.authorRole && msg.authorRole !== 'user'
              ? `<span class="role-pill ${msg.authorRole}" style="margin-left:0.3rem">${msg.authorRole}</span>`
              : ''}
          </div>
          <div class="disc-msg-body">${escHtml(msg.body)}</div>
          ${canMod && !thread.closed ? `
            <div class="disc-msg-actions">
              <button class="btn btn-ghost btn-sm" style="color:var(--accent)" onclick="deleteMessage('${slug}','${tid}','${mid}')">Delete msg</button>
            </div>` : ''}
        </div>`).join('')}
      ${currentUser && !thread.closed ? `
        <div class="disc-reply-box">
          <textarea id="reply-${tid}" placeholder="Write a reply…"></textarea>
          <button class="btn btn-secondary btn-sm mt1" onclick="postReply('${slug}','${tid}')">Post Reply</button>
        </div>` : ''}
    </div>`;
}

window.openNewThread = function(slug) {
  const mo = $('modal-overlay'), m = $('modal');
  mo.classList.remove('hidden');
  m.classList.remove('hidden');
  m.innerHTML = `
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <h3 style="margin-bottom:1rem">New Discussion Thread</h3>
    <div class="field-group">
      <label class="field-label">Thread Title</label>
      <input class="field-input" id="nt-title" placeholder="What would you like to discuss?">
    </div>
    <div class="field-group">
      <label class="field-label">Opening Message</label>
      <textarea class="field-input" id="nt-body" rows="4" style="resize:vertical" placeholder="Start the conversation…"></textarea>
    </div>
    <button class="btn btn-primary" onclick="createThread('${slug}')">Start Thread</button>`;
};

window.createThread = async function(slug) {
  const title = $('nt-title').value.trim();
  const body  = $('nt-body').value.trim();
  if (!title || !body) { toast('Please fill in both fields', 'error'); return; }
  const tid = push(ref(db, `discussions/${slug}`)).key;
  await set(ref(db, `discussions/${slug}/${tid}`), {
    title,
    closed: false,
    createdAt: Date.now(),
    authorId: currentUser.uid,
    messages: {
      [push(ref(db)).key]: {
        authorId:   currentUser.uid,
        authorName: currentProfile.displayName,
        authorRole: currentProfile.role,
        body,
        createdAt: Date.now()
      }
    }
  });
  await logAction(slug, 'thread_created', { title });
  closeModal();
  toast('Thread started!', 'success');
};

window.postReply = async function(slug, tid) {
  const ta   = $('reply-' + tid);
  const body = ta?.value.trim();
  if (!body) { toast('Message cannot be empty', 'error'); return; }
  const mid = push(ref(db, `discussions/${slug}/${tid}/messages`)).key;
  await set(ref(db, `discussions/${slug}/${tid}/messages/${mid}`), {
    authorId:   currentUser.uid,
    authorName: currentProfile.displayName,
    authorRole: currentProfile.role,
    body,
    createdAt: Date.now()
  });
  ta.value = '';
  await logAction(slug, 'discussion_reply', { threadId: tid });
};

window.toggleThreadClose = async function(slug, tid, isClosed) {
  await update(ref(db, `discussions/${slug}/${tid}`), { closed: !isClosed });
  await logAction(slug, isClosed ? 'thread_reopened' : 'thread_closed', { tid });
};

window.deleteThread = async function(slug, tid) {
  if (!confirm('Delete this thread?')) return;
  await update(ref(db, `discussions/${slug}/${tid}`), { deleted: true });
  await logAction(slug, 'thread_deleted', { tid });
  toast('Thread deleted.');
};

window.deleteMessage = async function(slug, tid, mid) {
  if (!confirm('Delete this message?')) return;
  await remove(ref(db, `discussions/${slug}/${tid}/messages/${mid}`));
  await logAction(slug, 'message_deleted', { tid, mid });
  toast('Message deleted.');
};

// ─── LOG ACTION ───────────────────────────────────────────────────
async function logAction(articleSlug, action, meta = {}) {
  const key = push(ref(db, `logs/${articleSlug}`)).key;
  await set(ref(db, `logs/${articleSlug}/${key}`), {
    action,
    meta:      JSON.stringify(meta),
    userId:    currentUser?.uid || 'system',
    userName:  currentProfile?.displayName || 'System',
    userRole:  currentProfile?.role || 'user',
    createdAt: Date.now()
  });
}

// ─── EDITOR ───────────────────────────────────────────────────────
async function renderEditor(slug) {
  if (!currentUser) { showAuth('login'); return; }

  let article = null;
  if (slug) {
    const snap = await get(ref(db, `articles/${slug}`));
    if (snap.exists()) article = snap.val();
  }

  const isNew = !slug;
  app$().innerHTML = `
    <div class="editor-page">
      <h1 style="margin-bottom:1.5rem">${isNew ? 'Create New Article' : 'Edit Article'}</h1>

      <div class="field-group">
        <label class="field-label">Title *</label>
        <input class="field-input" id="e-title" value="${escHtml(article?.title || '')}" placeholder="Article title">
      </div>

      <div class="field-group">
        <label class="field-label">Subtitle / Tagline</label>
        <input class="field-input" id="e-subtitle" value="${escHtml(article?.subtitle || '')}" placeholder="Optional one-line summary">
      </div>

      <div class="field-group">
        <label class="field-label">Category</label>
        <input class="field-input" id="e-category" value="${escHtml(article?.category || '')}" placeholder="e.g. Science, History, Technology">
      </div>

      <div class="field-group">
        <label class="field-label">Content *</label>
        <p class="field-hint" style="margin-bottom:0.5rem">
          Use wiki markup: <code>==Heading==</code>, <code>'''bold'''</code>, <code>''italic''</code>, <code>[[Page Title]]</code>
        </p>
        <div class="editor-toolbar">
          <button class="tb-btn" onclick="insertMarkup('===','===')" title="Heading">H</button>
          <button class="tb-btn" onclick="insertMarkup(\"'''\",\"'''\")" title="Bold"><b>B</b></button>
          <button class="tb-btn" onclick="insertMarkup(\"''\",\"''\")" title="Italic"><i>I</i></button>
          <button class="tb-btn" onclick="insertMarkup('[[',']]')" title="Link">🔗</button>
          <button class="tb-btn" onclick="insertMarkup('* ','')" title="Bullet">•</button>
          <button class="tb-btn" onclick="insertMarkup('# ','')" title="Numbered">1.</button>
          <button class="tb-btn" onclick="previewContent()" title="Preview">Preview</button>
        </div>
        <textarea class="editor-field" id="e-content" placeholder="Start writing…">${escHtml(article?.content || '')}</textarea>
      </div>

      <div class="field-group">
        <label class="field-label">Edit Summary</label>
        <input class="field-input" id="e-summary" placeholder="Briefly describe your changes">
      </div>

      <div id="preview-box" class="hidden" style="border:1px solid var(--border);border-radius:var(--radius);padding:1.25rem;margin-bottom:1rem;background:var(--paper2)"></div>

      <div class="editor-actions">
        <button class="btn btn-primary" onclick="saveArticle('${slug}')">
          ${isNew ? '✓ Publish Article' : '✓ Save Changes'}
        </button>
        <button class="btn btn-secondary" onclick="navigate(${slug ? `'article','${slug}'` : `'home'`})">Cancel</button>
      </div>
    </div>`;
}

window.insertMarkup = function(pre, post) {
  const ta = $('e-content');
  const s = ta.selectionStart, e = ta.selectionEnd;
  const sel = ta.value.slice(s, e);
  ta.value = ta.value.slice(0, s) + pre + sel + post + ta.value.slice(e);
  ta.focus();
  ta.selectionStart = s + pre.length;
  ta.selectionEnd   = e + pre.length;
};

window.previewContent = function() {
  const box = $('preview-box');
  const src = $('e-content').value;
  box.innerHTML = '<h3 style="margin-bottom:0.5rem">Preview</h3>' + wikiToHtml(src);
  box.classList.toggle('hidden', box.innerHTML.trim() === '');
};

window.saveArticle = async function(existingSlug) {
  const title    = $('e-title').value.trim();
  const subtitle = $('e-subtitle').value.trim();
  const category = $('e-category').value.trim();
  const content  = $('e-content').value.trim();
  const summary  = $('e-summary').value.trim();

  if (!title || !content) { toast('Title and content are required', 'error'); return; }

  const slug  = existingSlug || slugify(title);
  const isNew = !existingSlug;

  if (isNew) {
    const check = await get(ref(db, `articles/${slug}`));
    if (check.exists() && !check.val().deleted) {
      toast('An article with this title already exists.', 'error');
      return;
    }
  }

  const existing = isNew ? null : (await get(ref(db, `articles/${existingSlug}`))).val();

  if (!isNew && existing) {
    const revKey = push(ref(db, `revisions/${slug}`)).key;
    await set(ref(db, `revisions/${slug}/${revKey}`), {
      ...existing,
      savedAt:     Date.now(),
      savedBy:     currentUser.uid,
      savedByName: currentProfile.displayName
    });
  }

  const now = Date.now();
  await set(ref(db, `articles/${slug}`), {
    title, subtitle, category, content,
    authorId:      isNew ? currentUser.uid            : existing?.authorId,
    authorName:    isNew ? currentProfile.displayName : existing?.authorName,
    updatedBy:     currentUser.uid,
    updatedByName: currentProfile.displayName,
    createdAt:     isNew ? now : existing?.createdAt,
    updatedAt:     now,
    deleted:       false
  });

  await logAction(slug, isNew ? 'article_created' : 'article_edited', { summary: summary || 'No summary' });
  toast(isNew ? 'Article published!' : 'Changes saved!', 'success');
  navigate('article', slug);
};

// ─── DELETE ARTICLE ───────────────────────────────────────────────
window.deleteArticle = async function(slug) {
  if (!confirm('Permanently delete this article?')) return;
  await update(ref(db, `articles/${slug}`), { deleted: true });
  await logAction(slug, 'article_deleted', {});
  toast('Article deleted.', 'success');
  navigate('home');
};

// ─── LOGS PAGE ────────────────────────────────────────────────────
async function renderLogs(slug) {
  const role = currentProfile?.role;
  if (role !== 'mod' && role !== 'admin') { toast('Access denied', 'error'); navigate('home'); return; }

  app$().innerHTML = `<div class="loading-center"><div class="spinner"></div></div>`;
  const snap = await get(ref(db, `logs/${slug}`));
  const logs = snap.exists()
    ? Object.values(snap.val()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    : [];

  const revSnap = await get(ref(db, `revisions/${slug}`));
  const revs    = revSnap.exists()
    ? Object.entries(revSnap.val()).sort((a, b) => (b[1].savedAt || 0) - (a[1].savedAt || 0))
    : [];

  app$().innerHTML = `
    <div class="panel-page">
      <div class="flex-between mb1">
        <h1>Page Logs: ${escHtml(slug)}</h1>
        <button class="btn btn-secondary btn-sm" onclick="navigate('article','${slug}')">← Back to Article</button>
      </div>

      <h2>Action Log</h2>
      ${logs.length === 0 ? '<p class="muted">No log entries.</p>' : logs.map(l => `
        <div class="log-entry">
          <span class="log-time">${fmtDateTime(l.createdAt)}</span>
          <span class="log-action">${escHtml(l.action)}</span>
          <span class="log-user">${escHtml(l.userName)}</span>
          <span class="role-pill ${l.userRole}">${l.userRole}</span>
          <span class="muted">${escHtml(l.meta || '')}</span>
        </div>`).join('')}

      <h2 style="margin-top:2rem">Revision History</h2>
      ${revs.length === 0 ? '<p class="muted">No revisions saved yet.</p>' : revs.map(([rid, r]) => `
        <div class="log-entry" style="flex-direction:column;align-items:flex-start;gap:0.3rem">
          <div class="flex-gap">
            <span class="log-time">${fmtDateTime(r.savedAt)}</span>
            <span class="log-user">${escHtml(r.savedByName || '?')}</span>
          </div>
          <div class="muted" style="font-size:0.82rem">
            Title: "${escHtml(r.title)}" — ${(r.content || '').length} chars
          </div>
        </div>`).join('')}
    </div>`;
}

// ─── MOD PANEL ────────────────────────────────────────────────────
async function renderModPanel() {
  const role = currentProfile?.role;
  if (role !== 'mod' && role !== 'admin') { toast('Access denied', 'error'); navigate('home'); return; }

  app$().innerHTML = `<div class="loading-center"><div class="spinner"></div></div>`;
  const [articlesSnap, usersSnap, appsSnap] = await Promise.all([
    get(ref(db, 'articles')),
    get(ref(db, 'users')),
    get(ref(db, 'applications'))
  ]);

  const articles = articlesSnap.exists() ? Object.entries(articlesSnap.val()) : [];
  const users    = usersSnap.exists()    ? Object.entries(usersSnap.val())    : [];
  const apps     = appsSnap.exists()     ? Object.entries(appsSnap.val())     : [];

  app$().innerHTML = `
    <div class="panel-page">
      <h1>Moderator Panel</h1>
      <div class="panel-tabs">
        <div class="panel-tab active" id="ptab-users"    onclick="switchPanelTab('users')">Users</div>
        <div class="panel-tab"        id="ptab-articles" onclick="switchPanelTab('articles')">Articles</div>
        <div class="panel-tab"        id="ptab-apps"     onclick="switchPanelTab('apps')">Mod Applications</div>
      </div>
      <div id="ptab-content-users">${renderModUsers(users)}</div>
      <div id="ptab-content-articles" class="hidden">${renderModArticles(articles)}</div>
      <div id="ptab-content-apps"     class="hidden">${renderModApps(apps, role)}</div>
    </div>`;
}

window.switchPanelTab = function(tab) {
  document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
  $('ptab-' + tab).classList.add('active');
  ['users', 'articles', 'apps'].forEach(t => {
    $('ptab-content-' + t).classList.toggle('hidden', t !== tab);
  });
};

function renderModUsers(users) {
  if (!users.length) return '<p class="muted">No users.</p>';
  return `
    <table class="user-table">
      <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>
        ${users.map(([uid, u]) => `
          <tr>
            <td>${escHtml(u.displayName || '—')}</td>
            <td>${escHtml(u.email || '—')}</td>
            <td><span class="role-pill ${u.role || 'user'}">${u.role || 'user'}</span></td>
            <td>${fmtDate(u.joinedAt)}</td>
            <td>${u.banned
              ? '<span class="badge badge-closed">Banned</span>'
              : '<span class="badge badge-open">Active</span>'}</td>
            <td><div class="actions-cell">
              ${u.banned
                ? `<button class="btn btn-success btn-sm" onclick="unbanUser('${uid}')">Unban</button>`
                : `<button class="btn btn-warn btn-sm"    onclick="banUser('${uid}')">Ban</button>`}
            </div></td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function renderModArticles(articles) {
  const all = articles.filter(([, a]) => !a.deleted);
  if (!all.length) return '<p class="muted">No articles.</p>';
  return `
    <table class="user-table">
      <thead><tr><th>Title</th><th>Author</th><th>Category</th><th>Updated</th><th>Actions</th></tr></thead>
      <tbody>
        ${all.map(([slug, a]) => `
          <tr>
            <td><a href="#" onclick="navigate('article','${escHtml(slug)}')">${escHtml(a.title)}</a></td>
            <td>${escHtml(a.authorName || '—')}</td>
            <td>${escHtml(a.category || '—')}</td>
            <td>${fmtDate(a.updatedAt)}</td>
            <td><div class="actions-cell">
              <button class="btn btn-secondary btn-sm" onclick="navigate('logs','${slug}')">Logs</button>
              <button class="btn btn-secondary btn-sm" onclick="navigate('edit','${slug}')">Edit</button>
            </div></td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function renderModApps(apps, role) {
  const pending = apps.filter(([, a]) => a.status === 'pending');
  if (!pending.length) return '<p class="muted">No pending applications.</p>';
  return pending.map(([aid, a]) => `
    <div style="border:1px solid var(--border);border-radius:var(--radius);padding:1rem;margin-bottom:1rem">
      <div class="flex-between mb1">
        <div>
          <strong>${escHtml(a.userName)}</strong>
          <span class="muted" style="margin-left:0.5rem">${escHtml(a.userEmail || '')}</span>
        </div>
        <span class="badge badge-pending">Pending</span>
      </div>
      <p style="font-size:0.9rem;margin-bottom:0.75rem">${escHtml(a.reason)}</p>
      <div class="flex-gap">
        <button class="btn btn-success btn-sm" onclick="reviewApplication('${aid}','approved','${a.userId}')">Approve</button>
        <button class="btn btn-warn btn-sm"    onclick="reviewApplication('${aid}','rejected','${a.userId}')">Reject</button>
        <span class="muted">${fmtDateTime(a.createdAt)}</span>
      </div>
    </div>`).join('');
}

window.banUser = async function(uid) {
  if (!confirm('Ban this user?')) return;
  await update(ref(db, `users/${uid}`), { banned: true });
  toast('User banned.');
  renderModPanel();
};

window.unbanUser = async function(uid) {
  await update(ref(db, `users/${uid}`), { banned: false });
  toast('User unbanned.', 'success');
  renderModPanel();
};

// ─── ADMIN PANEL ──────────────────────────────────────────────────
async function renderAdminPanel() {
  if (currentProfile?.role !== 'admin') { toast('Access denied', 'error'); navigate('home'); return; }

  app$().innerHTML = `<div class="loading-center"><div class="spinner"></div></div>`;
  const usersSnap = await get(ref(db, 'users'));
  const users     = usersSnap.exists() ? Object.entries(usersSnap.val()) : [];

  app$().innerHTML = `
    <div class="panel-page">
      <h1>Admin Panel</h1>
      <div class="panel-tabs">
        <div class="panel-tab active" id="ptab-users"    onclick="switchPanelTab('users')">User Management</div>
        <div class="panel-tab"        id="ptab-articles" onclick="switchPanelTab('articles')">Articles</div>
        <div class="panel-tab"        id="ptab-apps"     onclick="switchPanelTab('apps')">Applications</div>
      </div>

      <div id="ptab-content-users">
        <table class="user-table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            ${users.map(([uid, u]) => `
              <tr>
                <td>${escHtml(u.displayName || '—')}</td>
                <td>${escHtml(u.email || '—')}</td>
                <td><span class="role-pill ${u.role || 'user'}">${u.role || 'user'}</span></td>
                <td>${u.banned
                  ? '<span class="badge badge-closed">Banned</span>'
                  : '<span class="badge badge-open">Active</span>'}</td>
                <td><div class="actions-cell">
                  ${u.role !== 'admin' ? `
                    <select class="field-input" style="padding:0.2rem 0.5rem;font-size:0.8rem;height:auto" onchange="setRole('${uid}',this.value)">
                      <option value="user"  ${u.role === 'user'  ? 'selected' : ''}>User</option>
                      <option value="mod"   ${u.role === 'mod'   ? 'selected' : ''}>Mod</option>
                      <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                    </select>` : '<span class="muted">—</span>'}
                  ${u.banned
                    ? `<button class="btn btn-success btn-sm" onclick="unbanUser('${uid}')">Unban</button>`
                    : `<button class="btn btn-warn btn-sm"    onclick="banUser('${uid}')">Ban</button>`}
                </div></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div id="ptab-content-articles" class="hidden">
        <div id="admin-articles-content"><div class="loading-center"><div class="spinner"></div></div></div>
      </div>
      <div id="ptab-content-apps" class="hidden">
        <div id="admin-apps-content"><div class="loading-center"><div class="spinner"></div></div></div>
      </div>
    </div>`;

  document.querySelectorAll('.panel-tab').forEach(t => {
    t.addEventListener('click', async () => {
      const tab = t.id.replace('ptab-', '');
      if (tab === 'articles' && $('admin-articles-content')) {
        const snap = await get(ref(db, 'articles'));
        const arts = snap.exists() ? Object.entries(snap.val()) : [];
        $('admin-articles-content').innerHTML = renderAdminArticles(arts);
      }
      if (tab === 'apps' && $('admin-apps-content')) {
        const snap = await get(ref(db, 'applications'));
        const apps = snap.exists() ? Object.entries(snap.val()) : [];
        $('admin-apps-content').innerHTML = renderModApps(apps, 'admin');
      }
    });
  });
}

function renderAdminArticles(articles) {
  const all = articles.filter(([, a]) => !a.deleted);
  return `
    <table class="user-table">
      <thead><tr><th>Title</th><th>Author</th><th>Updated</th><th>Actions</th></tr></thead>
      <tbody>
        ${all.map(([slug, a]) => `
          <tr>
            <td><a href="#" onclick="navigate('article','${escHtml(slug)}')">${escHtml(a.title)}</a></td>
            <td>${escHtml(a.authorName || '—')}</td>
            <td>${fmtDate(a.updatedAt)}</td>
            <td><div class="actions-cell">
              <button class="btn btn-secondary btn-sm" onclick="navigate('logs','${slug}')">Logs</button>
              <button class="btn btn-secondary btn-sm" onclick="navigate('edit','${slug}')">Edit</button>
              <button class="btn btn-warn btn-sm"      onclick="deleteArticle('${slug}')">Delete</button>
            </div></td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

window.setRole = async function(uid, role) {
  await update(ref(db, `users/${uid}`), { role });
  toast(`Role updated to ${role}.`, 'success');
};

// ─── MOD APPLICATIONS ─────────────────────────────────────────────
async function renderApply() {
  if (!currentUser) { showAuth('login'); return; }
  if (currentProfile?.role !== 'user') {
    app$().innerHTML = `<div class="page empty-state"><h3>You already have elevated permissions.</h3></div>`;
    return;
  }

  const snap    = await get(ref(db, 'applications'));
  const existing = snap.exists()
    ? Object.values(snap.val()).find(a => a.userId === currentUser.uid && a.status === 'pending')
    : null;

  if (existing) {
    app$().innerHTML = `
      <div class="page"><div class="apply-card">
        <h2>Application Pending</h2>
        <p>Your application for moderator status is currently under review. Please check back later.</p>
        <button class="btn btn-secondary mt1" onclick="navigate('home')">← Home</button>
      </div></div>`;
    return;
  }

  app$().innerHTML = `
    <div class="page">
      <div class="apply-card">
        <h2>Apply for Moderator</h2>
        <p class="muted" style="margin-bottom:1.5rem">
          Moderators can edit any article, view page logs, close discussions, delete messages, and ban users.
          Your application will be reviewed by an admin or existing moderator.
        </p>
        <div class="field-group">
          <label class="field-label">Why do you want to be a moderator?</label>
          <textarea class="field-input" id="app-reason" rows="6" style="resize:vertical"
            placeholder="Explain your interest and any relevant experience…"></textarea>
        </div>
        <div class="editor-actions">
          <button class="btn btn-primary"   onclick="submitApplication()">Submit Application</button>
          <button class="btn btn-secondary" onclick="navigate('home')">Cancel</button>
        </div>
      </div>
    </div>`;
}

window.submitApplication = async function() {
  const reason = $('app-reason').value.trim();
  if (!reason || reason.length < 30) { toast('Please write at least 30 characters.', 'error'); return; }
  const key = push(ref(db, 'applications')).key;
  await set(ref(db, `applications/${key}`), {
    userId:    currentUser.uid,
    userName:  currentProfile.displayName,
    userEmail: currentUser.email,
    reason,
    status:    'pending',
    createdAt: Date.now()
  });
  toast('Application submitted! You will be notified.', 'success');
  navigate('home');
};

window.reviewApplication = async function(aid, status, userId) {
  await update(ref(db, `applications/${aid}`), { status, reviewedAt: Date.now(), reviewedBy: currentUser.uid });
  if (status === 'approved') {
    await update(ref(db, `users/${userId}`), { role: 'mod' });
    toast('Application approved — user is now a moderator.', 'success');
  } else {
    toast('Application rejected.');
  }
  renderModPanel();
};

// ─── PROFILE PAGE ─────────────────────────────────────────────────
async function renderProfile() {
  if (!currentUser) { showAuth('login'); return; }
  const uid        = currentUser.uid;
  const snap       = await get(ref(db, 'articles'));
  const myArticles = snap.exists()
    ? Object.entries(snap.val()).filter(([, a]) => a.authorId === uid && !a.deleted)
    : [];

  app$().innerHTML = `
    <div class="page" style="max-width:700px">
      <h1>${escHtml(currentProfile?.displayName || 'Profile')}</h1>
      <div class="flex-gap mb1" style="margin-top:0.5rem">
        <span class="role-pill ${currentProfile?.role}">${currentProfile?.role}</span>
        <span class="muted">Joined ${fmtDate(currentProfile?.joinedAt)}</span>
        <span class="muted">${currentUser.email}</span>
      </div>
      <hr>
      <h2>My Articles (${myArticles.length})</h2>
      ${myArticles.length ? myArticles.map(([slug, a]) => `
        <div class="article-list-item">
          <span class="ali-title" onclick="navigate('article','${escHtml(slug)}')">${escHtml(a.title)}</span>
          <div class="flex-gap">
            <button class="btn btn-ghost btn-sm" onclick="navigate('edit','${slug}')">Edit</button>
            <span class="ali-meta">${fmtDate(a.updatedAt)}</span>
          </div>
        </div>`).join('')
      : '<p class="muted">You haven\'t created any articles yet.</p>'}
      <div class="mt2">
        <button class="btn btn-primary" onclick="navigate('create')">+ New Article</button>
        ${currentProfile?.role === 'user'
          ? `<button class="btn btn-secondary" style="margin-left:0.5rem" onclick="navigate('apply')">Apply for Mod</button>`
          : ''}
      </div>
    </div>`;
}

// ─── INIT ─────────────────────────────────────────────────────────
renderHome();