import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { createPortal } from 'react-dom';

// ADHD Nodeboard — v2.8
// Adds resizable column widths for the left (Routine/To-Do), middle (Nodeboard controls) and right (Reminders).
// Default: left column slightly wider. Drag the thin resizer bars between columns to resize.

const STORAGE_KEY = "adhd_nodeboard_v2_8";

// Toggle temporary diagnostic logging for portal/outside-click events. Set true
// while debugging and remove or set to false when finished.
const DEBUG_PORTAL_EVENTS = true;

const DEFAULT_NODES = [
  { id: "n1", title: "What I need to do today", x: 60, y: 60, category: "PurpleToPink", text: "Small, specific tasks: call Dr., do laundry.", reminder: null },
  { id: "n2", title: "In the coming week", x: 420, y: 80, category: "GreenToYellow", text: "Groceries, appointments, deadlines", reminder: null },
];

const DEFAULT_ROUTINES = {
  0: [ { id: 'r-sun-1', title: 'Sleep in / relax' }, { id: 'r-sun-2', title: 'Weekly planning (light)' } ],
  1: [ { id: 'r-mon-1', title: 'Morning meds' }, { id: 'r-mon-2', title: 'Pack school bag' }, { id: 'r-mon-3', title: 'Evening review' } ],
  2: [ { id: 'r-tue-1', title: 'Morning meds' }, { id: 'r-tue-2', title: 'Homework check' } ],
  3: [ { id: 'r-wed-1', title: 'Morning meds' }, { id: 'r-wed-2', title: 'Early dismissal: pack light' } ],
  4: [ { id: 'r-thu-1', title: 'Morning meds' }, { id: 'r-thu-2', title: 'Gym bag' } ],
  5: [ { id: 'r-fri-1', title: 'Morning meds' }, { id: 'r-fri-2', title: 'Plan weekend' } ],
  6: [ { id: 'r-sat-1', title: 'Sleep in / relax' }, { id: 'r-sat-2', title: 'Chores' } ],
};

const DEFAULT_TODOS = [];

// Supported node types
const NODE_TYPES = [
  { value: 'standard', label: 'Standard' },
  { value: 'list', label: 'List' },
  { value: 'grid', label: 'Grid' }
];
const CATEGORY_COLORS = {
  PurpleToPink: "linear-gradient(135deg,#6c4ef6 0%,#b13af5 50%,#ff6db3 100%)",
  GreenToYellow: "linear-gradient(135deg,#23cba7 0%,#59e3a3 50%,#d6ff7a 100%)",
  BlueToTeal: "linear-gradient(135deg,#4facfe 0%,#00f2fe 100%)",
  OrangeToRed: "linear-gradient(135deg,#ff9a66 0%,#ff6a88 50%,#ff4d4d 100%)",
  Sunset: "linear-gradient(135deg,#ffb199 0%,#ff758c 50%,#8e54e9 100%)",
  Ocean: "linear-gradient(135deg,#2b5876 0%,#4e4376 50%,#2b5876 100%)",
  Mint: "linear-gradient(135deg,#c1f7d5 0%,#a8edea 50%,#7be495 100%)",
  Gray: "linear-gradient(135deg,#ffffff11 0%,#ffffff08 100%)",
  Default: "linear-gradient(135deg,#ffffff22,#ffffff18)"
};

// Default two-color gradients (left->right and right->left colors) derived from the
// original CATEGORY_COLORS. Each entry stores { a: '#hex', b: '#hex' } and is editable
// by the user in Settings. We persist the user's custom gradients to localStorage.
const DEFAULT_CATEGORY_GRADIENTS = {
  PurpleToPink: { a: '#6c4ef6', b: '#ff6db3' },
  GreenToYellow: { a: '#23cba7', b: '#d6ff7a' },
  BlueToTeal: { a: '#4facfe', b: '#00f2fe' },
  OrangeToRed: { a: '#ff9a66', b: '#ff4d4d' },
  Sunset: { a: '#ffb199', b: '#8e54e9' },
  Ocean: { a: '#2b5876', b: '#4e4376' },
  Mint: { a: '#c1f7d5', b: '#7be495' },
  // Gray should be a readable mid-gray gradient (not pure white)
  Gray: { a: '#d0d3d6', b: '#b8bbc0' },
  // Default: match the subtle translucent default used previously (soft white overlay)
  Default: { a: 'rgba(255,255,255,0.14)', b: 'rgba(255,255,255,0.09)' }
};

// Minimal safe-ish Markdown -> HTML converter supporting headings, bold, italic, inline code, links and line breaks.
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function markdownToHtml(md) {
  if (!md) return '';
  // escape first
  let out = escapeHtml(md);
  // code
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  // bold **text**
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // italic *text*
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // links [text](url)
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  // headings (# ..)
  out = out.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  out = out.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  out = out.replace(/^# (.*$)/gim, '<h1>$1</h1>');
  // convert remaining line breaks to <br>
  out = out.replace(/\n/g, '<br>');
  return out;
}

const styles = {
  primaryBtn: { background: 'linear-gradient(90deg,#7c5cff,#ff6db3)', border: 'none', color: 'white', padding: '8px 12px', borderRadius: 10, cursor: 'pointer', boxShadow: '0 6px 18px rgba(124,92,255,0.18)' },
  secondaryBtn: { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.06)', color: 'white', padding: '8px 12px', borderRadius: 10, cursor: 'pointer' },
  dangerBtn: { background: 'rgba(255,80,80,0.18)', border: '1px solid rgba(255,80,80,0.25)', color: 'white', padding: '8px 12px', borderRadius: 10, cursor: 'pointer' }
};

// Small/compact variants for node controls (to avoid making nodes taller)
// Make buttons shrinkable when container is tight: allow overflow hidden, ellipsis and flex shrink.
styles.smallBtn = { padding: '6px 8px', borderRadius: 8, fontSize: 13, lineHeight: '18px', display: 'inline-flex', alignItems: 'center', gap: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 };
styles.smallPrimary = { ...styles.primaryBtn, ...styles.smallBtn, padding: '6px 10px', boxShadow: 'none' };
styles.smallSecondary = { ...styles.secondaryBtn, ...styles.smallBtn };
styles.smallDanger = { ...styles.dangerBtn, ...styles.smallBtn };

// add subtle transitions for nicer interactions
styles.smallPrimary.transition = 'transform 120ms ease, box-shadow 120ms ease';
styles.smallSecondary.transition = 'transform 120ms ease, box-shadow 120ms ease';
styles.smallDanger.transition = 'transform 120ms ease, box-shadow 120ms ease';

function uid(prefix = "id") { return prefix + Math.random().toString(36).slice(2, 9); }

export default function App() {
  // --- column widths (resizable) ---
  // defaults: left slightly wider as requested
  const [leftWidth, setLeftWidth] = useState(() => { const saved = localStorage.getItem(STORAGE_KEY + ':leftWidth'); return saved ? Number(saved) : 380; });
  const [midWidth, setMidWidth] = useState(() => { const saved = localStorage.getItem(STORAGE_KEY + ':midWidth'); return saved ? Number(saved) : 300; });
  const [rightWidth, setRightWidth] = useState(() => { const saved = localStorage.getItem(STORAGE_KEY + ':rightWidth'); return saved ? Number(saved) : 320; });

  useEffect(() => { localStorage.setItem(STORAGE_KEY + ':leftWidth', String(leftWidth)); }, [leftWidth]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY + ':midWidth', String(midWidth)); }, [midWidth]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY + ':rightWidth', String(rightWidth)); }, [rightWidth]);

  // --- nodeboard state ---
  const [nodes, setNodes] = useState(() => { try { const raw = localStorage.getItem(STORAGE_KEY); if (!raw) return DEFAULT_NODES; const parsed = JSON.parse(raw); return parsed.nodes ?? DEFAULT_NODES; } catch { return DEFAULT_NODES; } });
  const [connections, setConnections] = useState(() => { try { const raw = localStorage.getItem(STORAGE_KEY); if (!raw) return []; const parsed = JSON.parse(raw); return parsed.connections ?? []; } catch { return []; } });
  // collections: containers on the board that can hold nodes (nodes keep absolute x/y but are visually grouped)
  const [collections, setCollections] = useState(() => { try { const raw = localStorage.getItem(STORAGE_KEY); if (!raw) return []; const parsed = JSON.parse(raw); return parsed.collections ?? []; } catch { return []; } });

  // --- reminders + todos + routines ---
  const [reminders, setReminders] = useState(() => { try { const raw = localStorage.getItem(STORAGE_KEY + ':reminders'); return raw ? JSON.parse(raw) : []; } catch { return []; } });
  const [todos, setTodos] = useState(() => { try { const raw = localStorage.getItem(STORAGE_KEY + ':todos'); return raw ? JSON.parse(raw) : DEFAULT_TODOS; } catch { return DEFAULT_TODOS; } });
  const [routines, setRoutines] = useState(() => { try { const raw = localStorage.getItem(STORAGE_KEY + ':routines'); return raw ? JSON.parse(raw) : DEFAULT_ROUTINES; } catch { return DEFAULT_ROUTINES; } });
  const [routineChecks, setRoutineChecks] = useState(() => { try { const raw = localStorage.getItem(STORAGE_KEY + ':routineChecks'); return raw ? JSON.parse(raw) : {}; } catch { return {}; } });
  // per-day "Done" state for routines: when a routine is marked Done for a date, it should not remind
  const [routineDones, setRoutineDones] = useState(() => { try { const raw = localStorage.getItem(STORAGE_KEY + ':routineDones'); return raw ? JSON.parse(raw) : {}; } catch { return {}; } });

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes, connections, collections })); }, [nodes, connections, collections]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY + ':reminders', JSON.stringify(reminders)); }, [reminders]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY + ':todos', JSON.stringify(todos)); }, [todos]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY + ':routines', JSON.stringify(routines)); }, [routines]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY + ':routineChecks', JSON.stringify(routineChecks)); }, [routineChecks]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY + ':routineDones', JSON.stringify(routineDones)); }, [routineDones]);

  // Backups viewer state (renderer-side UI) — lists backups from main process
  const [openBackupsViewer, setOpenBackupsViewer] = useState(false);
  const [backups, setBackups] = useState([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [viewingBackupContent, setViewingBackupContent] = useState(null);
  const [viewingBackupName, setViewingBackupName] = useState(null);
  // Category gradients: editable two-color gradients per category
  const [categoryGradients, setCategoryGradients] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY + ':categoryGradients');
      return raw ? JSON.parse(raw) : DEFAULT_CATEGORY_GRADIENTS;
    } catch {
      return DEFAULT_CATEGORY_GRADIENTS;
    }
  });
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY + ':categoryGradients', JSON.stringify(categoryGradients)); } catch { /* ignore */ } }, [categoryGradients]);

  // Backups enabled flag (persisted) and its draft for Settings
  const [backupsEnabled, setBackupsEnabled] = useState(() => { try { return localStorage.getItem(STORAGE_KEY + ':backupsEnabled') !== '0'; } catch { return true; } });
  const [draftBackupsEnabled, setDraftBackupsEnabled] = useState(backupsEnabled);


  // Helper: produce CSS background for a category from current gradients (fallback to old constant)
  function categoryBackground(cat) {
    try {
      const g = categoryGradients && categoryGradients[cat];
      if (g && g.a && g.b) {
        // if both stored colors are opaque pure white (old defaults), fall back to the
        // hard-coded CATEGORY_COLORS so nodes remain readable.
        function isOpaqueWhite(s) {
          if (!s) return false;
          const st = String(s).trim().toLowerCase();
          if (/^#(?:fff|ffffff)$/.test(st)) return true;
          if (/^rgb\(\s*255\s*,\s*255\s*,\s*255\s*\)$/.test(st)) return true;
          if (/^rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*(1(?:\.0+)?)\s*\)$/.test(st)) return true;
          return false;
        }
        if (isOpaqueWhite(g.a) && isOpaqueWhite(g.b)) {
          return CATEGORY_COLORS[cat] || CATEGORY_COLORS.Default;
        }
        return `linear-gradient(135deg, ${g.a} 0%, ${g.a} 50%, ${g.b} 100%)`;
      }
  } catch { /* ignore */ }
    return CATEGORY_COLORS[cat] || CATEGORY_COLORS.Default;
  }

  // --- board refs & measurements ---
  const outerRef = useRef(null);
  // ref to the right-hand reminders column so we can anchor floating controls relative to it
  const rightColRef = useRef(null);
  const innerRef = useRef(null);
  const nodeRefs = useRef({});
  const [nodeRects, setNodeRects] = useState({});
  // zoom scale for the board (persisted)
  // `scale` remains the global UI scale (Settings -> Global zoom). Introduce
  // `boardScale` to control only the nodes/board area so the two zooms are
  // independent.
  const [scale, setScale] = useState(() => { try { const s = parseFloat(localStorage.getItem(STORAGE_KEY + ':scale')); return (isNaN(s) ? 1 : s); } catch { return 1; } });
  const [boardScale, setBoardScale] = useState(() => { try { const s = parseFloat(localStorage.getItem(STORAGE_KEY + ':boardScale')); return (isNaN(s) ? 1 : s); } catch { return 1; } });
  // settings UI + z-indexing mode (auto | manual)
  const [openSettings, setOpenSettings] = useState(false);
  const [zMode, setZMode] = useState(() => { try { return localStorage.getItem(STORAGE_KEY + ':zMode') || 'auto'; } catch { return 'auto'; } });
  const zCounterRef = useRef(0);
  // global defaults (persisted)
  const [defaultTitleColor, setDefaultTitleColor] = useState(() => { try { return localStorage.getItem(STORAGE_KEY + ':defaultTitleColor'); } catch { return null; } });
  const [defaultTextColor, setDefaultTextColor] = useState(() => { try { return localStorage.getItem(STORAGE_KEY + ':defaultTextColor'); } catch { return null; } });
  const [defaultCategory, setDefaultCategory] = useState(() => { try { return localStorage.getItem(STORAGE_KEY + ':defaultCategory') || 'Default'; } catch { return 'Default'; } });
  const [autoColorOnConnect, setAutoColorOnConnect] = useState(() => { try { return localStorage.getItem(STORAGE_KEY + ':autoColorOnConnect') === '1'; } catch { return false; } });
  // Draft state used by the Settings modal (Save/Cancel semantics)
  const [draftZMode, setDraftZMode] = useState(zMode);
  const [draftDefaultTitleColor, setDraftDefaultTitleColor] = useState(defaultTitleColor);
  const [draftDefaultTextColor, setDraftDefaultTextColor] = useState(defaultTextColor);
  const [draftDefaultCategory, setDraftDefaultCategory] = useState(defaultCategory);
  const [draftAutoColorOnConnect, setDraftAutoColorOnConnect] = useState(autoColorOnConnect);
  const [draftScale, setDraftScale] = useState(scale);
  // Background notifications: keep renderer copy of the enabled flag and a draft for Settings
  const [bgNotificationsEnabled, setBgNotificationsEnabled] = useState(() => { try { return localStorage.getItem(STORAGE_KEY + ':bgNotificationsEnabled') === '1'; } catch { return false; } });
  const [draftBgNotificationsEnabled, setDraftBgNotificationsEnabled] = useState(bgNotificationsEnabled);
  const [openSettingsColorPicker, setOpenSettingsColorPicker] = useState(false);
  // Draft copy of category gradients to edit inside Settings modal
  const [draftCategoryGradients, setDraftCategoryGradients] = useState(categoryGradients);
  const [draftEditCategory, setDraftEditCategory] = useState(Object.keys(categoryGradients)[0] || 'Default');
  const [draftEditLeft, setDraftEditLeft] = useState((categoryGradients[draftEditCategory] && categoryGradients[draftEditCategory].a) || '#ffffff');
  const [draftEditRight, setDraftEditRight] = useState((categoryGradients[draftEditCategory] && categoryGradients[draftEditCategory].b) || '#ffffff');
  // collapsed state for left/right panels
  const [leftCollapsed, setLeftCollapsed] = useState(() => { return localStorage.getItem(STORAGE_KEY + ':leftCollapsed') === '1'; });
  const [rightCollapsed, setRightCollapsed] = useState(() => { return localStorage.getItem(STORAGE_KEY + ':rightCollapsed') === '1'; });

  useEffect(() => { localStorage.setItem(STORAGE_KEY + ':leftCollapsed', leftCollapsed ? '1' : '0'); }, [leftCollapsed]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY + ':rightCollapsed', rightCollapsed ? '1' : '0'); }, [rightCollapsed]);
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY + ':zMode', zMode); } catch (err) { console.warn('Failed saving zMode', err); } }, [zMode]);
  useEffect(() => { try { if (defaultTitleColor) localStorage.setItem(STORAGE_KEY + ':defaultTitleColor', defaultTitleColor); else localStorage.removeItem(STORAGE_KEY + ':defaultTitleColor'); } catch (err) { console.warn('Failed saving defaultTitleColor', err); } }, [defaultTitleColor]);
  useEffect(() => { try { if (defaultTextColor) localStorage.setItem(STORAGE_KEY + ':defaultTextColor', defaultTextColor); else localStorage.removeItem(STORAGE_KEY + ':defaultTextColor'); } catch (err) { console.warn('Failed saving defaultTextColor', err); } }, [defaultTextColor]);
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY + ':defaultCategory', defaultCategory); } catch (err) { console.warn('Failed saving defaultCategory', err); } }, [defaultCategory]);
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY + ':autoColorOnConnect', autoColorOnConnect ? '1' : '0'); } catch (err) { console.warn('Failed saving autoColorOnConnect', err); } }, [autoColorOnConnect]);
  // persist global zoom
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY + ':scale', String(scale)); } catch (err) { console.warn('Failed saving scale', err); } }, [scale]);
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY + ':boardScale', String(boardScale)); } catch (err) { console.warn('Failed saving boardScale', err); } }, [boardScale]);

  // Sync background-notifications flag to localStorage and to main process (Electron)
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY + ':bgNotificationsEnabled', bgNotificationsEnabled ? '1' : '0'); } catch { /* ignore */ }
    try {
      if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.invoke === 'function') {
        window.electronAPI.invoke('set-bg-notifications-enabled', !!bgNotificationsEnabled).catch(() => {});
      }
    } catch { /* ignore */ }
  }, [bgNotificationsEnabled]);

  // Persist reminders to main process so the background scheduler (in main) can pick them up
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.invoke === 'function') {
        window.electronAPI.invoke('persist-reminders', reminders).catch(() => {});
      }
    } catch { /* ignore */ }
  }, [reminders]);

  // Export payload generator (used by backups and export actions)
  const exportJSONSnapshot = useCallback(() => {
    try {
      return JSON.stringify({
        nodes, connections, collections,
        reminders, todos, routines,
        categoryGradients, defaultCategory, defaultTitleColor, defaultTextColor,
        // include key UI/settings so imports/restores preserve user's environment
        zMode, autoColorOnConnect, bgNotificationsEnabled,
        scale, boardScale,
        leftWidth, midWidth, rightWidth, leftCollapsed, rightCollapsed
      }, null, 2);
    } catch (err) {
      console.warn('exportJSONSnapshot failed', err);
      return '{}';
    }
  }, [
    nodes, connections, collections, reminders, todos, routines,
    categoryGradients, defaultCategory, defaultTitleColor, defaultTextColor,
    zMode, autoColorOnConnect, bgNotificationsEnabled, scale, boardScale,
    leftWidth, midWidth, rightWidth, leftCollapsed, rightCollapsed
  ]);

  // Helpers to show native alert/confirm but restore focus afterwards
  function _getFocusableAncestor(el) {
    try {
      if (!el) return null;
      const tag = (el.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || el.isContentEditable) return el;
      // if inside a contenteditable or input, find the nearest ancestor
      let node = el;
      while (node) {
        const t = (node.tagName || '').toLowerCase();
        if (t === 'input' || t === 'textarea' || node.isContentEditable) return node;
        node = node.parentElement;
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  const showAlert = useCallback((msg) => {
    try {
      // Open in-app alert modal instead of native alert()
      __setAlertState({ open: true, msg: String(msg || '') });
    } catch (err) {
      try { console.log('showAlert failed', err); } catch { /* ignore */ }
    }
  }, []);

  // In-app alert state and close helper
  const [__alertState, __setAlertState] = useState({ open: false, msg: null });
  function __closeAlert() { __setAlertState({ open: false, msg: null }); }

  // In-app async confirmation dialog (avoids native confirm() which can break focus)
  const [__confirmState, __setConfirmState] = useState({ open: false, msg: null, resolve: null });
  const confirmAsync = useCallback((msg) => {
    return new Promise(resolve => {
      __setConfirmState({ open: true, msg, resolve });
    });
  }, []);
  function __closeConfirm(result) {
    try {
      if (__confirmState && typeof __confirmState.resolve === 'function') __confirmState.resolve(result);
    } catch { /* ignore */ }
    __setConfirmState({ open: false, msg: null, resolve: null });
  }

  // --- automatic backups: every 3 changes create a backup via main process ---
  const changeCounterRef = useRef(0);

  // Keep track of last-focused input/editable so we can restore focus when the
  // app window regains focus after an external window/dialog closes.
  const _lastFocusedRef = useRef(null);
  useEffect(() => {
    function onFocusIn(e) {
      try {
        _lastFocusedRef.current = _getFocusableAncestor(e.target) || e.target;
      } catch {
        _lastFocusedRef.current = e.target;
      }
    }
    function onWindowFocus() {
      // small delay to allow native dialogs/windows to complete focus transitions
      setTimeout(() => {
        try {
          const el = _lastFocusedRef.current;
          if (el && document.contains(el) && typeof el.focus === 'function') {
            el.focus();
            if (typeof el.select === 'function') el.select();
          }
        } catch { /* ignore */ }
      }, 150);
    }
    window.addEventListener('focusin', onFocusIn);
    window.addEventListener('focus', onWindowFocus);
    return () => { window.removeEventListener('focusin', onFocusIn); window.removeEventListener('focus', onWindowFocus); };
  }, []);
  useEffect(() => {
    try {
      if (!backupsEnabled) return;
      if (!(typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.invoke === 'function')) return;
      changeCounterRef.current = (changeCounterRef.current || 0) + 1;
        if (changeCounterRef.current >= 3) {
        changeCounterRef.current = 0;
        try {
          const snap = exportJSONSnapshot();
          window.electronAPI.invoke('save-backup', snap).then(res => {
            if (res && res.success) console.info('[Nodeboard] backup saved', res.file);
            else console.warn('[Nodeboard] backup save failed', res && res.error);
          }).catch(err => console.warn('[Nodeboard] save-backup invoke failed', err));
        } catch (err) { console.warn('[Nodeboard] creating backup failed', err); }
      }
    } catch { /* ignore */ }
  }, [
    nodes, collections, connections, reminders, todos, routines,
    categoryGradients, defaultCategory, defaultTitleColor, defaultTextColor,
    zMode, autoColorOnConnect, bgNotificationsEnabled, scale, boardScale,
    leftWidth, midWidth, rightWidth, leftCollapsed, rightCollapsed,
    exportJSONSnapshot, backupsEnabled
  ]);

  // On mount, request persisted reminders and bg-flag from main (if available)
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.invoke === 'function') {
        // fetch persisted reminders from main and replace renderer reminders if present
        window.electronAPI.invoke('get-persisted-reminders').then(pr => {
          if (Array.isArray(pr) && pr.length) {
            try { setReminders(pr); } catch { /* ignore */ }
          }
        }).catch(() => {});
        window.electronAPI.invoke('get-bg-notifications-enabled').then(v => {
          try { setBgNotificationsEnabled(!!v); setDraftBgNotificationsEnabled(!!v); } catch { /* ignore */ }
        }).catch(() => {});

        // Listen for fired events coming from main
        try {
          window.electronAPI.on('reminder-fired', (payload) => {
            try {
              const id = payload && payload.id;
              if (!id) return;
              setReminders(prev => prev.map(x => x.id === id ? { ...x, fired: true } : x));
            } catch { /* ignore */ }
          });
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }, []);

  // Backups API helpers (call main process)
  async function refreshBackupsList() {
    try {
      if (!(typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.invoke === 'function')) return;
      setBackupsLoading(true);
      const list = await window.electronAPI.invoke('list-backups');
      setBackups(Array.isArray(list) ? list : []);
    } catch (err) {
      console.warn('Failed to list backups', err);
      setBackups([]);
    } finally { setBackupsLoading(false); }
  }

  async function viewBackup(name) {
    try {
      setViewingBackupContent(null);
      setViewingBackupName(name);
      const res = await window.electronAPI.invoke('read-backup', name);
      if (res && res.success) {
        setViewingBackupContent(res.content || '');
      } else {
        showAlert('Failed to read backup');
        setViewingBackupContent(null);
      }
    } catch (err) {
      console.warn('Failed to read backup', err);
      setViewingBackupContent(null);
      showAlert('Failed to read backup');
    }
  }

  async function removeBackup(name) {
    try {
      if (!(await confirmAsync('Delete this backup?'))) return;
      const res = await window.electronAPI.invoke('delete-backup', name);
      if (res && res.success) {
        await refreshBackupsList();
      } else {
        showAlert('Failed to delete backup');
      }
    } catch (err) { console.warn('delete-backup failed', err); showAlert('Failed to delete backup'); }
  }

  async function removeAllBackups() {
    try {
      if (!(await confirmAsync('Delete ALL backups? This cannot be undone.')) ) return;
      const res = await window.electronAPI.invoke('delete-all-backups');
      if (res && res.success) {
        await refreshBackupsList();
      } else {
        showAlert('Failed to delete all backups');
      }
    } catch (err) { console.warn('delete-all-backups failed', err); showAlert('Failed to delete all backups'); }
  }

  // Manual save backup (exposed to Settings UI)
  async function saveBackupNow() {
    try {
      if (!(typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.invoke === 'function')) { showAlert('Backup not available'); return; }
      const snap = exportJSONSnapshot();
      const res = await window.electronAPI.invoke('save-backup', snap);
      if (res && res.success) {
        showAlert('Backup saved: ' + res.file);
        // refresh list if backups viewer open
        if (openBackupsViewer) await refreshBackupsList();
      } else {
        console.warn('[Nodeboard] save-backup failed', res && res.error);
        showAlert('Backup failed');
      }
    } catch (err) { console.warn('saveBackupNow failed', err); showAlert('Backup failed'); }
  }

  async function restoreBackup(name) {
    try {
      // optional: create a safety snapshot before restoring
      try {
        const pre = exportJSONSnapshot();
        await window.electronAPI.invoke('save-backup', pre);
      } catch { /* ignore pre-restore failure */ }
      const res = await window.electronAPI.invoke('read-backup', name);
      if (!res || !res.success) { showAlert('Failed to read backup'); return; }
      const content = res.content || '';
      try {
        handleImportText(content);
        showAlert('Restore applied');
        setOpenBackupsViewer(false);
      } catch (err) {
        console.warn('restore import failed', err);
        showAlert('Invalid JSON');
      }
    } catch (err) { console.warn('restore failed', err); showAlert('Restore failed'); }
  }

  // When backups viewer opens, refresh list
  useEffect(() => {
    if (openBackupsViewer) refreshBackupsList();
  }, [openBackupsViewer]);

  // open settings modal and initialize draft state
  function openSettingsModal() {
    setDraftZMode(zMode);
    setDraftDefaultTitleColor(defaultTitleColor || null);
    setDraftDefaultTextColor(defaultTextColor || null);
    setDraftDefaultCategory(defaultCategory || 'Default');
    setDraftAutoColorOnConnect(!!autoColorOnConnect);
    setDraftScale(scale);
    // initialize draft gradients for editing
    setDraftCategoryGradients(categoryGradients);
    setDraftBgNotificationsEnabled(bgNotificationsEnabled);
    setDraftBackupsEnabled(backupsEnabled);
    const first = draftDefaultCategory || Object.keys(categoryGradients)[0] || 'Default';
    setDraftEditCategory(first);
    setDraftEditLeft((categoryGradients[first] && categoryGradients[first].a) || '#ffffff');
    setDraftEditRight((categoryGradients[first] && categoryGradients[first].b) || '#ffffff');
    setOpenSettings(true);
  }

  useLayoutEffect(() => {
    function measure() {
      const next = {};
      for (const n of nodes) {
        const el = nodeRefs.current[n.id];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        next[n.id] = { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
      }
      setNodeRects(next);
    }
    measure();
    const ro = new ResizeObserver(measure);
    for (const id of Object.keys(nodeRefs.current)) { const el = nodeRefs.current[id]; if (el) ro.observe(el); }
    window.addEventListener('resize', measure);
    // Zoom control is now rendered in the middle sidebar footer; we only need
    // to keep measuring node element sizes/positions here.
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [nodes, collections, scale, boardScale]);

  // --- resizing logic ---
  const resizingRef = useRef({ active: false, which: null, startX: 0, startLeft: 0, startMid: 0, startRight: 0 });

  function onResizerMouseDown(which, e) {
    e.preventDefault();
    // if a panel is collapsed and the user drags its resizer, expand it first
    if (which === 'left-mid' && leftCollapsed) setLeftCollapsed(false);
    if (which === 'main-right' && rightCollapsed) setRightCollapsed(false);
    resizingRef.current = { active: true, which, startX: e.clientX || (e.touches && e.touches[0].clientX), startLeft: leftWidth, startMid: midWidth, startRight: rightWidth };
    function onMove(ev) {
      const clientX = ev.clientX || (ev.touches && ev.touches[0].clientX);
      const dx = clientX - resizingRef.current.startX;
      if (resizingRef.current.which === 'left-mid') {
        const nextLeft = Math.max(240, resizingRef.current.startLeft + dx);
        setLeftWidth(nextLeft);
      } else if (resizingRef.current.which === 'mid-main') {
        const nextMid = Math.max(220, resizingRef.current.startMid + dx);
        setMidWidth(nextMid);
      } else if (resizingRef.current.which === 'main-right') {
        const nextRight = Math.max(220, resizingRef.current.startRight - dx);
        setRightWidth(nextRight);
      }
    }
    function onUp() {
      resizingRef.current.active = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
  }

  // collection resizer (bottom-right corner) — similar to the main resizers but per-collection
  function onCollectionResizerDown(collectionId, e) {
    e.preventDefault();
    const col = collections.find(c => c.id === collectionId);
    if (!col) return;
    const startX = e.clientX || (e.touches && e.touches[0].clientX);
    const startY = e.clientY || (e.touches && e.touches[0].clientY);
    const startW = col.w;
    const startH = col.h;
    function onMove(ev) {
      const clientX = ev.clientX || (ev.touches && ev.touches[0].clientX);
      const clientY = ev.clientY || (ev.touches && ev.touches[0].clientY);
      const dx = clientX - startX;
      const dy = clientY - startY;
      setCollections(prev => prev.map(c => c.id === collectionId ? { ...c, w: Math.max(200, startW + dx), h: Math.max(140, startH + dy) } : c));
    }
    function onUp() { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onUp); }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
  }

  // --- reminders scheduling ---
  useEffect(() => {
    // Prefer using the Electron-native notification bridge when available via
    // the preload context (window.electronAPI.invoke). Fall back to the
    // browser Notification API, and finally a plain alert if neither works.
    const hasBrowserNotification = (typeof Notification !== 'undefined');

    async function showNotification(payload) {
      try {
        // If running inside Electron with our preload bridge, use native OS notification
        if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.invoke === 'function') {
          try {
            // invoke returns a Promise; fire-and-forget is fine here
            window.electronAPI.invoke('show-notification', { title: payload.title || 'Reminder', body: payload.body || '' }).catch(err => console.warn('[Nodeboard] electron invoke failed', err));
            return;
          } catch (err) {
            console.warn('[Nodeboard] electronAPI.invoke error', err);
            // fall through to browser Notification
          }
        }

        // Browser Notification API
        if (hasBrowserNotification && Notification.permission === 'granted') {
          try {
            new Notification(payload.title || 'Reminder', { body: payload.body || '' });
            return;
          } catch (err) {
            console.warn('[Nodeboard] Browser Notification failed', err);
          }
        }

        // If permission is default, request it asynchronously (non-blocking)
        if (hasBrowserNotification && Notification.permission === 'default') {
          try { Notification.requestPermission().then(p => console.info('[Nodeboard] Notification permission:', p)).catch(() => {}); } catch { /* ignore */ }
        }

        // Final fallback visible alert
        try { showAlert(`${payload.title || 'Reminder'}\n${payload.body || ''}`); } catch { console.warn('[Nodeboard] alert fallback failed'); }
      } catch (err) {
        console.error('[Nodeboard] showNotification unexpected error', err);
      }
    }

    const timers = [];
    reminders.forEach(r => {
      if (!r || !r.enabled || r.fired) return;

      if (!r.time) {
        console.warn('[Nodeboard] Skipping reminder without time:', r);
        return;
      }
      const when = new Date(r.time).getTime();
      if (isNaN(when)) {
        console.warn('[Nodeboard] Skipping reminder with invalid time:', r.time, r);
        return;
      }

      const ms = when - Date.now();
      console.debug('[Nodeboard] Scheduling reminder', r.id, 'in (ms):', ms, 'for', new Date(when).toLocaleString());

      const fireAndMark = async () => {
        try {
          await showNotification({ title: r.title || 'Reminder', body: r.note || '' });
        } catch (err) {
          console.error('[Nodeboard] Error firing reminder:', err);
        }
        // mark as fired
        setReminders(prev => prev.map(x => x.id === r.id ? { ...x, fired: true } : x));
      };

      // If scheduled time already passed or is very near, fire immediately (use setTimeout 0 to avoid blocking)
      if (ms <= 0) {
        setTimeout(() => { fireAndMark(); }, 0);
      } else {
        const t = setTimeout(() => { fireAndMark(); }, ms);
        timers.push(t);
      }
    });

    return () => timers.forEach(clearTimeout);
  }, [reminders, showAlert]);

  // --- nodeboard interaction (dragging / connecting) ---
  const dragRef = useRef({ id: null, dx: 0, dy: 0 });
  const [connecting, setConnecting] = useState(null);
  const [tempLine, setTempLine] = useState(null);
  // collection dragging
  const collectionDragRef = useRef({ id: null, dx: 0, dy: 0 });
  const [editingCollectionId, setEditingCollectionId] = useState(null);
  const [editingCollectionTitle, setEditingCollectionTitle] = useState('');

  useEffect(() => { const applying = !!dragRef.current.id; document.body.style.userSelect = applying ? 'none' : ''; document.body.style.webkitUserSelect = applying ? 'none' : ''; });

  function getInnerRect() { return innerRef.current ? innerRef.current.getBoundingClientRect() : null; }
  function getBoardPoint(clientX, clientY) { const inner = getInnerRect(); if (!inner) return { x: clientX, y: clientY, clientX, clientY }; // account for boardScale: convert client coords to board (unscaled) coords
    const x = (clientX - inner.left) / boardScale; const y = (clientY - inner.top) / boardScale; return { x, y, clientX, clientY }; }

  function onNodeMouseDown(e, node) {
    if (e.target && e.target.closest && e.target.closest('[data-side]')) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const p = getBoardPoint(clientX, clientY);
    dragRef.current = { id: node.id, dx: p.x - node.x, dy: p.y - node.y };
    // auto z-index bump: give this node a higher z when dragging starts if zMode is 'auto'
    if (zMode === 'auto') {
      zCounterRef.current = (zCounterRef.current || 0) + 1;
      const nextZ = zCounterRef.current;
      setNodes(prev => prev.map(n => n.id === node.id ? { ...n, _z: nextZ } : n));
    }
    document.body.style.userSelect = 'none';
  }

  function onCollectionMouseDown(e, col) {
    e.preventDefault();
    e.stopPropagation();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const p = getBoardPoint(clientX, clientY);
    collectionDragRef.current = { id: col.id, dx: p.x - col.x, dy: p.y - col.y };
    document.body.style.userSelect = 'none';
    function onMove(ev) {
      const cx = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const cy = ev.touches ? ev.touches[0].clientY : ev.clientY;
      const np = getBoardPoint(cx, cy);
      setCollections(prev => prev.map(c => c.id === col.id ? { ...c, x: Math.max(0, np.x - collectionDragRef.current.dx), y: Math.max(0, np.y - collectionDragRef.current.dy) } : c));
    }
    function onUp() { collectionDragRef.current = { id: null, dx: 0, dy: 0 }; document.body.style.userSelect = ''; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onUp); }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
  }

  function onBoardPointerMove(e) {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    if (dragRef.current.id) {
      const p = getBoardPoint(clientX, clientY);
      const nodeId = dragRef.current.id;
      const node = nodes.find(n => n.id === nodeId) || null;
      let nextX = p.x - dragRef.current.dx;
      let nextY = p.y - dragRef.current.dy;
      if (node && node.collectionId) {
        const col = collections.find(c => c.id === node.collectionId);
        if (col) {
          const nodeW = nodeRects[nodeId]?.width || 220;
          const nodeH = nodeRects[nodeId]?.height || 120;
          const pad = 8;
          const headerH = 44; // leave room for collection header
          const minX = col.x + pad;
          const maxX = col.x + col.w - nodeW - pad;
          const minY = col.y + headerH + pad;
          const maxY = col.y + col.h - nodeH - pad;
          nextX = Math.min(Math.max(nextX, minX), Math.max(minX, maxX));
          nextY = Math.min(Math.max(nextY, minY), Math.max(minY, maxY));
        }
      }
      setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, x: nextX, y: nextY } : n));
    }
    if (connecting) {
      const inner = getInnerRect();
      const relX = clientX - (inner ? inner.left : 0);
      const relY = clientY - (inner ? inner.top : 0);
      // convert screen coords into board (unscaled) coords for the SVG which lives inside the scaled container
  setTempLine({ x1: connecting.startX, y1: connecting.startY, x2: (relX) / boardScale, y2: (relY) / boardScale });
    }
  }

  function onBoardPointerUp(e) {
    if (dragRef.current.id) { dragRef.current = { id: null, dx: 0, dy: 0 }; document.body.style.userSelect = ''; }
    if (connecting) {
      const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
      const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
      const el = document.elementFromPoint(clientX, clientY);
      const nodeEl = el && el.closest ? el.closest('[data-side]') : null;
      if (nodeEl && nodeEl.dataset) {
        const toId = nodeEl.dataset.nodeId;
        const toSide = nodeEl.dataset.side;
        const fromId = connecting.fromId;
        if (fromId !== toId) {
            // Only allow connecting an output side to an input side (right -> left).
            // Prevent output->output or input->input connections.
            if (connecting.fromSide === 'right' && toSide === 'left') {
              const created = { id: uid('c'), from: fromId, to: toId, fromSide: connecting.fromSide, toSide };
              setConnections(prev => { if (prev.find(x => x.from === fromId && x.to === toId && x.fromSide === connecting.fromSide && x.toSide === toSide)) return prev; return [...prev, created]; });

              // copy theme from source to target and slightly increase brightness so the chain looks progressive
              const src = nodes.find(n => n.id === fromId);
              if (src) {
                const srcBright = src._brightness || 1;
                // slightly brighter but noticeable — use 8% per connection and clamp
                const nextBright = Math.min(srcBright * 1.08, 1.5);
                // Only modify target node appearance when the user has enabled autoColorOnConnect.
                // When disabled, do not change category, title/text colors or brightness —
                // only the connection is created.
                if (autoColorOnConnect) {
                  setNodes(prev => prev.map(n => {
                    if (n.id === toId) {
                      const prevBright = n._brightness || 1;
                      return {
                        ...n,
                        category: src.category || n.category,
                        _brightness: Math.max(prevBright, nextBright),
                        titleColor: src.titleColor || n.titleColor,
                        textColor: src.textColor || n.textColor
                      };
                    }
                    return n;
                  }));
                }
              }
            } else {
              // invalid connection attempt (same-side); ignore or optionally notify
              // console.warn('Invalid connection: must connect output (right) -> input (left)');
            }
        }
      }
    }
    setConnecting(null); setTempLine(null);
  }

  function onConnectorDown(e, nodeId, side) { e.preventDefault(); e.stopPropagation(); const pos = connectorPosition(nodeId, side); setConnecting({ fromId: nodeId, fromSide: side, startX: pos.x, startY: pos.y }); setTempLine({ x1: pos.x, y1: pos.y, x2: pos.x + 1, y2: pos.y + 1 }); dragRef.current = { id: null, dx: 0, dy: 0 }; }

  function connectorPosition(nodeId, side) {
    // Prefer using the board's logical coordinates (node.x/node.y) so connector geometry
    // remains stable while the outer container is scrolled. Use measured widths/heights
    // from nodeRects for the horizontal offset.
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return null;
    // nodeRects are measured in client pixels (they reflect the scaled size in the DOM).
    // Convert to board coordinates by dividing by the current scale so geometry matches node.x/node.y.
  const measuredW = nodeRects[nodeId] && nodeRects[nodeId].width ? nodeRects[nodeId].width / boardScale : 260;
  const measuredH = nodeRects[nodeId] && nodeRects[nodeId].height ? nodeRects[nodeId].height / boardScale : 120;
    return { x: node.x + (side === 'right' ? measuredW : 0), y: node.y + measuredH / 2 };
  }

  function bezierPath(a, b, fromSide, toSide) {
    const dx = Math.max(120, Math.abs(b.x - a.x) * 0.45);
    const c1x = fromSide === 'right' ? a.x + dx : a.x - dx;
    const c1y = a.y;
    const c2x = toSide === 'left' ? b.x - dx : b.x + dx;
    const c2y = b.y;
    return `M ${a.x} ${a.y} C ${c1x} ${c1y} ${c2x} ${c2y} ${b.x} ${b.y}`;
  }

  function renderConnections() {
    return (
      <svg style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 22000 }}>
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(255,255,255,0.95)" />
          </marker>
        </defs>
        {connections.map(c => {
          const a = connectorPosition(c.from, c.fromSide);
          const b = connectorPosition(c.to, c.toSide);
          if (!a || !b) return null;
          const path = bezierPath(a, b, c.fromSide, c.toSide);
          return (
            <g key={c.id} style={{ pointerEvents: 'visibleStroke' }}>
              <path d={path} strokeWidth={10} stroke="rgba(255,255,255,0.06)" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <path d={path} strokeWidth={3.5} stroke="rgba(255,255,255,0.95)" fill="none" markerEnd="url(#arrow)" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          );
        })}
        {tempLine ? (<path d={`M ${tempLine.x1} ${tempLine.y1} C ${tempLine.x1 + 80} ${tempLine.y1} ${tempLine.x2 - 80} ${tempLine.y2} ${tempLine.x2} ${tempLine.y2}`} strokeWidth={2} strokeDasharray="8 6" stroke="rgba(255,255,255,0.6)" fill="none" />) : null}
      </svg>
    );
  }

  // --- nodeboard helpers ---
  function addNodeOfType(type = 'standard') {
    const base = { id: uid('n'), title: type === 'standard' ? 'New node' : (type === 'list' ? 'New list' : 'New grid'), titleColor: defaultTitleColor || null, textColor: defaultTextColor || null, x: 100 + Math.random() * 400, y: 100 + Math.random() * 200, category: defaultCategory || 'Default', _new: true };
    let n;
    if (type === 'list') {
      n = { ...base, type: 'list', text: '', items: [{ id: uid('li'), description: '' }] };
    } else if (type === 'grid') {
      n = { ...base, type: 'grid', text: '', rows: 1, cols: 1, gridItems: [{ id: uid('gcell'), description: '' }] };
    } else {
      n = { ...base, type: 'standard', text: 'Longer description will expand this node automatically.' };
    }
    setNodes(s => [...s, n]);
    // clear the transient _new flag after animation
    setTimeout(() => setNodes(s => s.map(x => x.id === n.id ? { ...x, _new: false } : x)), 260);
  }
  

  function addNodeInCollectionOfType(collectionId, type = 'standard') {
    const col = collections.find(c => c.id === collectionId);
    const baseX = col ? (col.x + 20) : (100 + Math.random() * 400);
    const baseY = col ? (col.y + 40) : (100 + Math.random() * 200);
    const base = { id: uid('n'), title: type === 'standard' ? 'New node' : (type === 'list' ? 'New list' : 'New grid'), titleColor: defaultTitleColor || null, textColor: defaultTextColor || null, x: baseX, y: baseY, category: defaultCategory || 'Default', collectionId, _new: true };
    let n;
    if (type === 'list') {
      n = { ...base, type: 'list', text: '', items: [{ id: uid('li'), description: '' }] };
    } else if (type === 'grid') {
      n = { ...base, type: 'grid', text: '', rows: 1, cols: 1, gridItems: [{ id: uid('gcell'), description: '' }] };
    } else {
      n = { ...base, type: 'standard', text: 'Longer description will expand this node automatically.' };
    }
    setNodes(s => [...s, n]);
    setTimeout(() => setNodes(s => s.map(x => x.id === n.id ? { ...x, _new: false } : x)), 260);
  }

  function addCollection() {
    const id = uid('col');
    const c = { id, title: 'New collection', x: 200 + Math.random() * 400, y: 120 + Math.random() * 200, w: 440, h: 300, _new: true };
    setCollections(prev => [...prev, c]);
    setTimeout(() => setCollections(prev => prev.map(x => x.id === id ? { ...x, _new: false } : x)), 260);
    return c;
  }

  function removeCollection(id) {
    // remove collection and any nodes that were placed inside it
    setCollections(prev => prev.filter(c => c.id !== id));
    setNodes(prev => prev.filter(n => n.collectionId !== id));
  }
  function removeNode(id) { setNodes(s => s.filter(n => n.id !== id)); setConnections(c => c.filter(x => x.from !== id && x.to !== id)); setReminders(r => r.filter(x => x.nodeId !== id)); }
  

  // --- To-Do helpers ---
  function addTodoTask(title, note, datetimeLocal) { const id = uid('t'); let reminderId = null; if (datetimeLocal) { const iso = new Date(datetimeLocal).toISOString(); const r = { id: uid('rem'), nodeId: null, title, note, time: iso, enabled: true, fired: false }; setReminders(prev => [...prev, r]); reminderId = r.id; } const t = { id, title, note, time: datetimeLocal ? new Date(datetimeLocal).toISOString() : null, reminderId }; setTodos(prev => [...prev, t]); return t; }
  function removeTodoTask(id) { const task = todos.find(t => t.id === id); if (task && task.reminderId) setReminders(prev => prev.filter(r => r.id !== task.reminderId)); setTodos(prev => prev.filter(t => t.id !== id)); }

  // --- Routine helpers ---
  
  function addRoutineItem(dayIndex, title) { const id = uid('r'); setRoutines(prev => ({ ...prev, [dayIndex]: [...(prev[dayIndex]||[]), { id, title }] })); }
  function removeRoutineItem(dayIndex, id) { setRoutines(prev => ({ ...prev, [dayIndex]: (prev[dayIndex]||[]).filter(x => x.id !== id) })); }

  // small UI state for add forms
  const [todoForm, setTodoForm] = useState({ title: '', note: '', datetime: '' });
  const [showTodoDatetime, setShowTodoDatetime] = useState(false);
  const [newRoutineText, setNewRoutineText] = useState('');
  // which node id has the color picker open (null = closed)
  const [openColorPicker, setOpenColorPicker] = useState(null);
  // transient flag: set when a pointer interaction is active inside a portaled control
  // (e.g. dragging inside the ColorPicker). The global outside-click handler will
  // consult this to avoid closing popovers while the user is actively dragging.
  const portalInteractionRef = useRef(false);
  // which reminder id has the note popover open (null = closed)
  const [openReminderNote, setOpenReminderNote] = useState(null);
  // which node id has the connections popover open (null = closed)
  const [openConnMenu, setOpenConnMenu] = useState(null);
  // (preview moved into the node editor modal)
  // form values for the connections popover per-node (target, fromSide, toSide)
  const [connFormValues, setConnFormValues] = useState({});
  // small help popover for the Routine area
  const [openRoutineHelp, setOpenRoutineHelp] = useState(false);
  // import/export menu state
  const [openImportMenu, setOpenImportMenu] = useState(false);
  const [openExportMenu, setOpenExportMenu] = useState(false);
  const importFileRef = useRef(null);
  // Import-as-text modal (for Electron clipboard/paste support)
  const [openImportText, setOpenImportText] = useState(false);
  const [importTextValue, setImportTextValue] = useState('');
  // selected day for editing routines (0=Sun..6=Sat)
  const [selectedRoutineDay, setSelectedRoutineDay] = useState(() => new Date().getDay());
  // day selector popover
  const [openDayMenu, setOpenDayMenu] = useState(false);
  // create-node menus (main toolbar and per-collection)
  const [openCreateNodeMenu, setOpenCreateNodeMenu] = useState(false);
  const [openCreateNodeMenuForCollection, setOpenCreateNodeMenuForCollection] = useState(null);

  function handleCreateNode(type, collectionId = null) {
    if (collectionId) addNodeInCollectionOfType(collectionId, type); else addNodeOfType(type);
    setOpenCreateNodeMenu(false);
    setOpenCreateNodeMenuForCollection(null);
  }

  // routine time popover state: { open: bool, routineId: string|null, time: 'HH:MM' }
  const [routineTimeMenu, setRoutineTimeMenu] = useState({ open: false, routineId: null, time: '09:00' });

  // node editor modal state
  const [editingNodeId, setEditingNodeId] = useState(null);
  const [editingNodeDraft, setEditingNodeDraft] = useState(null);
  // Board zoom control is rendered in the middle sidebar footer (no floating control)

  // Portal popover helper: position a themed popover near an anchor element (by id)
  // Portal popover with enter/exit animations. Use `isOpen` to control visibility; when
  // `isOpen` becomes false the popover animates closed before unmounting.
  // Simple in-app color picker (compact). Provides a preview button and a small popover
  // with HSV sliders + hex input. This avoids opening the browser-native color picker
  // which can be difficult to intercept reliably across platforms.
  function ColorPicker({ value, onChange, previewStyle = {} }) {
    const [open, setOpen] = useState(false);
    const idRef = useRef(uid('color-btn'));
    const id = idRef.current;
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    function hexToRgb(hex) {
      if (!hex) return { r: 255, g: 255, b: 255 };
      const h = hex.replace('#','');
      const bigint = parseInt(h.length===3 ? h.split('').map(c=>c+c).join('') : h, 16);
      return { r: (bigint>>16)&255, g: (bigint>>8)&255, b: bigint&255 };
    }
    function rgbToHex(r,g,b){
      const to = (n) => (Math.round(n).toString(16).padStart(2,'0'));
      return `#${to(r)}${to(g)}${to(b)}`;
    }
    function rgbToHsv(r,g,b){
      r/=255; g/=255; b/=255; const max=Math.max(r,g,b), min=Math.min(r,g,b); const d=max-min;
      let h=0, s = max===0 ? 0 : d/max, v=max;
      if (d!==0) {
        if (max===r) h = (g-b)/d + (g<b?6:0);
        else if (max===g) h = (b-r)/d + 2;
        else h = (r-g)/d + 4;
        h /= 6;
      }
      return { h: h*360, s: s*100, v: v*100 };
    }
    function hsvToRgb(h,s,v){
      h = (h%360+360)%360; s/=100; v/=100; const c = v*s; const x = c*(1-Math.abs((h/60)%2-1)); const m = v-c;
      let rr=0, gg=0, bb=0;
      if (h<60){ rr=c; gg=x; bb=0; } else if (h<120){ rr=x; gg=c; bb=0; } else if (h<180){ rr=0; gg=c; bb=x; } else if (h<240){ rr=0; gg=x; bb=c; } else if (h<300){ rr=x; gg=0; bb=c; } else { rr=c; gg=0; bb=x; }
      return { r: (rr+m)*255, g: (gg+m)*255, b: (bb+m)*255 };
    }

    const [hex, setHex] = useState(value || '#ffffff');
    useEffect(() => setHex(value || '#ffffff'), [value]);
    const initRgb = hexToRgb(hex);
    const [hsv, setHsv] = useState(rgbToHsv(initRgb.r, initRgb.g, initRgb.b));
    useEffect(() => { const rgb = hexToRgb(hex); setHsv(rgbToHsv(rgb.r, rgb.g, rgb.b)); }, [hex]);

    const svRef = useRef(null);
    const draggingRef = useRef(false);

    function pushChangeFromHsv(nextHsv){
      const rgb = hsvToRgb(nextHsv.h, nextHsv.s, nextHsv.v);
      const nextHex = rgbToHex(rgb.r, rgb.g, rgb.b);
      setHex(nextHex);
      setHsv(nextHsv);
      if (onChange) onChange(nextHex);
    }

    function onHexInput(v){
      if (!v) return; const cleaned = v[0]==='#' ? v : `#${v}`; setHex(cleaned);
      try { const rgb = hexToRgb(cleaned); const nextH = rgbToHsv(rgb.r,rgb.g,rgb.b); setHsv(nextH); if (onChange) onChange(cleaned); } catch { /* ignore */ }
    }

    function handleSvPointerMove(clientX, clientY){
      const el = svRef.current; if (!el) return;
      const r = el.getBoundingClientRect();
      const x = clamp(clientX - r.left, 0, r.width);
      const y = clamp(clientY - r.top, 0, r.height);
      const s = clamp((x / r.width) * 100, 0, 100);
      const v = clamp((1 - (y / r.height)) * 100, 0, 100);
      const next = { ...hsv, s, v };
      pushChangeFromHsv(next);
    }

    function onSvPointerDown(e){
      e.preventDefault(); e.stopPropagation(); draggingRef.current = true;
      const isTouch = e.type.startsWith('touch');
      const clientX = isTouch ? e.touches[0].clientX : e.clientX;
      const clientY = isTouch ? e.touches[0].clientY : e.clientY;
      handleSvPointerMove(clientX, clientY);
      function onMove(ev){ const cx = ev.touches ? ev.touches[0].clientX : ev.clientX; const cy = ev.touches ? ev.touches[0].clientY : ev.clientY; handleSvPointerMove(cx, cy); }
      function onUp(){ draggingRef.current = false; window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); }
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    }

    return (
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <button id={id} onClick={(e)=>{ e.stopPropagation(); setOpen(o=>!o); }} style={{ border: '1px solid rgba(255,255,255,0.06)', padding: 6, borderRadius: 6, background: hex, cursor: 'pointer', ...previewStyle }} aria-label="Color preview" />
        <PortalPopover anchorId={id} offsetX={0} offsetY={8} minWidth={260} zIndex={50000} isOpen={open}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} onClick={e=>e.stopPropagation()}>
            <div style={{ display: 'flex', gap: 10 }}>
              <div ref={svRef} onPointerDown={onSvPointerDown} style={{ width: 200, height: 140, borderRadius: 6, position: 'relative', cursor: 'crosshair', background: `hsl(${Math.round(hsv.h)}, 100%, 50%)` }}>
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, #fff, rgba(255,255,255,0))' }} />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, #000, rgba(0,0,0,0))' }} />
                {/* handle */}
                <div style={{ position: 'absolute', left: `${hsv.s}%`, top: `${100 - hsv.v}%`, transform: 'translate(-50%,-50%)', width: 12, height: 12, borderRadius: 12, border: '2px solid white', boxShadow: '0 2px 8px rgba(0,0,0,0.6)' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 80 }}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>Hue</div>
                <input type="range" min={0} max={360} value={Math.round(hsv.h)} onChange={e => { const nh = clamp(Number(e.target.value),0,360); const next = { ...hsv, h: nh }; pushChangeFromHsv(next); }} />
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>Hex</div>
                <input value={hex} onChange={e => setHex(e.target.value)} onBlur={e => onHexInput(e.target.value)} style={{ padding: 6, borderRadius: 6, border: '1px solid rgba(255,255,255,0.06)', background: 'transparent', color: 'white' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={(e)=>{ e.stopPropagation(); setOpen(false); }} style={{ ...styles.smallSecondary }}>Close</button>
            </div>
          </div>
        </PortalPopover>
      </div>
    );
  }
  function PortalPopover({ anchorId, offsetX = 0, offsetY = 8, minWidth = 0, maxWidth = 0, zIndex = 21000, children, isOpen = true }) {
    const isBrowser = typeof document !== 'undefined';
    const el = isBrowser ? document.getElementById(anchorId) : null;
    const rect = el ? el.getBoundingClientRect() : null;
    const left = rect ? rect.left + offsetX : 100; // Adjusted left position
    const top = rect ? rect.bottom + offsetY : 100;
    const baseStyle = { position: 'fixed', left, top, zIndex, background: 'rgba(12,16,22,0.75)', padding: 8, borderRadius: 8, boxShadow: '0 10px 30px rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.04)', minWidth };
    if (maxWidth) baseStyle.maxWidth = maxWidth;

    const [mounted, setMounted] = useState(isOpen);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
      let t;
      if (isOpen) {
        setMounted(true);
        // ensure we run after mount to trigger CSS transition
        const raf = requestAnimationFrame(() => setVisible(true));
        return () => cancelAnimationFrame(raf);
      } else {
        // play exit animation then unmount
        setVisible(false);
        t = setTimeout(() => setMounted(false), 220);
      }
      return () => clearTimeout(t);
    }, [isOpen]);

    // mark portal root so global outside-click handlers can detect clicks that originate
    // from inside a portal (and ignore them). Attach native capture-phase listeners
    // on the DOM node so we can stop native document handlers from receiving events
    // that start inside the portal (React's synthetic capture handlers don't prevent
    // native document listeners from firing).
    const portalRootRef = useRef(null);
    useEffect(() => {
      const el = portalRootRef.current;
      if (!el) return;
      const h = (ev) => {
        try {
          if (DEBUG_PORTAL_EVENTS) console.debug('[DBG PortalPopover native capture]', ev.type, ev && ev.target && (ev.target.id || ev.target.tagName));
          // Mark native events that originated inside a portal so global
          // document handlers can detect them without stopping native
          // propagation. Stopping native propagation prevents React's
          // synthetic event system (which listens at document) from
          // receiving events for elements inside the portal.
          try { ev._portalPopover = true; } catch { /* ignore */ }
        } catch {
          /* noop */
        }
      };
      el.addEventListener('pointerdown', h, { capture: true });
      el.addEventListener('mousedown', h, { capture: true });
      el.addEventListener('click', h, { capture: true });
      return () => {
        try {
          el.removeEventListener('pointerdown', h, { capture: true });
        } catch {
          /* noop */
        }
        try {
          el.removeEventListener('mousedown', h, { capture: true });
        } catch {
          /* noop */
        }
        try {
          el.removeEventListener('click', h, { capture: true });
        } catch {
          /* noop */
        }
      };
    }, [mounted]);

    if (!mounted) return null;

    const style = { ...baseStyle, transform: visible ? 'translateY(0) scale(1)' : 'translateY(6px) scale(0.985)', opacity: visible ? 1 : 0, transition: 'opacity 180ms ease, transform 180ms ease', willChange: 'transform, opacity' };

    return createPortal(
      <div ref={portalRootRef} data-portal-popover="1" onClick={(e) => e.stopPropagation()} style={style}>
        {children}
      </div>,
      document.body
    );
  }

  // Settings modal: simplified portal like the node editor modal. Using the same
  // structure avoids capture/ordering differences that caused popover flicker.
  function SettingsModal({ isOpen, children, onRequestClose }) {
    const isBrowser = typeof document !== 'undefined';
    if (!isBrowser || !isOpen) return null;
    return createPortal(
      <div data-portal-popover="1">
        <div style={{ position: 'fixed', inset: 0, backdropFilter: 'blur(4px)', pointerEvents: 'none', zIndex: 19990 }} />
        <div onClick={() => onRequestClose && onRequestClose()} style={{ position: 'fixed', inset: 0, zIndex: 20000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 680, maxWidth: '96%', borderRadius: 12, background: 'rgba(8,10,14,0.95)', padding: 18, boxShadow: '0 20px 60px rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.04)', maxHeight: '90vh', overflow: 'auto', boxSizing: 'border-box' }}>
            {children}
          </div>
        </div>
      </div>,
      document.body
    );
  }

  // Themed (non-native) select rendered as a button that opens a PortalPopover with options
  function ThemedSelect({ id, value, placeholder, options = [], minWidth = 140, onChange }) {
    const [open, setOpen] = useState(false);
    const label = (options.find(o => o.value === value) || {}).label || '';
    useEffect(() => { if (!open) return; function onDoc(e) { const el = document.getElementById(id); if (!el) return; if (e.target && !el.contains(e.target) && !document.getElementById(id + '-menu')?.contains(e.target)) setOpen(false); } document.addEventListener('click', onDoc); return () => document.removeEventListener('click', onDoc); }, [open, id]);
    return (
      <div style={{ position: 'relative' }}>
        <button id={id} onClick={(e) => { e.stopPropagation(); setOpen(s => !s); }} style={{ ...styles.smallSecondary, padding: '6px 10px', minWidth, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: value ? 'white' : 'rgba(255,255,255,0.6)' }}>{value ? label : (placeholder || 'Select...')}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ marginLeft: 8 }} xmlns="http://www.w3.org/2000/svg"><path d="M6 9l6 6 6-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
  <PortalPopover anchorId={id} minWidth={minWidth} zIndex={21000} isOpen={open}>
          <div id={id + '-menu'} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {options.map(o => (
              <button key={o.value} onClick={(ev) => { ev.stopPropagation(); onChange(o.value); setOpen(false); }} style={{ ...styles.smallSecondary, textAlign: 'left', padding: '6px 10px' }}>{o.label}</button>
            ))}
          </div>
        </PortalPopover>
      </div>
    );
  }


  // Close menus when clicking outside — simplified handler to avoid capture-phase
  // behavior that can interfere with input focus in some Electron builds.
  useEffect(() => {
    const anyOpen = openImportMenu || openExportMenu || openDayMenu || routineTimeMenu.open || openReminderNote || openRoutineHelp || openConnMenu || openSettings || !!editingNodeId || openColorPicker || openSettingsColorPicker;
    if (!anyOpen) return;

    function onDocClick(e) {
      try {
        if (portalInteractionRef && portalInteractionRef.current) return; // ignore active portal interactions
        const node = e && e.target;
        if (node && node.closest && node.closest('[data-portal-popover="1"]')) return; // click inside a portal — ignore
      } catch {
        /* ignore */
      }
      setOpenImportMenu(false);
      setOpenExportMenu(false);
      setOpenDayMenu(false);
      setRoutineTimeMenu({ open: false, routineId: null, time: '09:00' });
      setOpenReminderNote(null);
      setOpenRoutineHelp(false);
      setOpenConnMenu(null);
    }

    document.addEventListener('click', onDocClick, false);
    return () => document.removeEventListener('click', onDocClick, false);
  }, [openImportMenu, openExportMenu, openDayMenu, routineTimeMenu.open, openReminderNote, openRoutineHelp, openConnMenu, openSettings, editingNodeId, openColorPicker, openSettingsColorPicker]);

  

  function exportToFile() {
    try {
      const json = exportJSONSnapshot();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const fname = `nodeboard-export-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
      a.href = url; a.download = fname; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      showAlert('Exported JSON file: ' + fname);
    } catch (err) {
      console.error('Export failed', err); showAlert('Export failed: ' + (err && err.message ? err.message : String(err)));
    }
  }

  async function exportToClipboard() {
    try {
      const json = exportJSONSnapshot();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(json);
        showAlert('Exported JSON copied to clipboard');
      } else {
        // fallback: open prompt so user can copy
        prompt('Copy export JSON (Ctrl+C / Cmd+C):', json);
      }
    } catch (err) {
      console.error('Copy failed', err); showAlert('Copy failed: ' + (err && err.message ? err.message : String(err)));
    }
  }

  function handleImportText(t) {
    try {
      if (!t) return;
      const parsed = JSON.parse(t);
      // Restore collections first (so nodes referencing collectionId remain valid)
      if (parsed.collections) setCollections(parsed.collections || []);
      setNodes(parsed.nodes || []);
      setConnections(parsed.connections || []);
      setTodos(parsed.todos || []);
      setReminders(parsed.reminders || []);
      setRoutines(parsed.routines || DEFAULT_ROUTINES);
      if (parsed.categoryGradients) {
        try { setCategoryGradients(parsed.categoryGradients); setDraftCategoryGradients(parsed.categoryGradients); } catch { /* ignore */ }
      }
      if (parsed.defaultCategory) setDefaultCategory(parsed.defaultCategory);
      if (parsed.defaultTitleColor) setDefaultTitleColor(parsed.defaultTitleColor);
      if (parsed.defaultTextColor) setDefaultTextColor(parsed.defaultTextColor);
      // Optional: restore UI/settings state stored in exports
      if (parsed.zMode) setZMode(parsed.zMode);
      if (typeof parsed.autoColorOnConnect !== 'undefined') setAutoColorOnConnect(!!parsed.autoColorOnConnect);
      if (typeof parsed.bgNotificationsEnabled !== 'undefined') { setBgNotificationsEnabled(!!parsed.bgNotificationsEnabled); setDraftBgNotificationsEnabled(!!parsed.bgNotificationsEnabled); }
      if (typeof parsed.scale !== 'undefined') setScale(Number(parsed.scale) || 1);
      if (typeof parsed.boardScale !== 'undefined') setBoardScale(Number(parsed.boardScale) || 1);
      if (typeof parsed.leftWidth !== 'undefined') setLeftWidth(Number(parsed.leftWidth) || 380);
      if (typeof parsed.midWidth !== 'undefined') setMidWidth(Number(parsed.midWidth) || 300);
      if (typeof parsed.rightWidth !== 'undefined') setRightWidth(Number(parsed.rightWidth) || 320);
      if (typeof parsed.leftCollapsed !== 'undefined') setLeftCollapsed(!!parsed.leftCollapsed);
      if (typeof parsed.rightCollapsed !== 'undefined') setRightCollapsed(!!parsed.rightCollapsed);
      showAlert('Import successful');
    } catch (err) {
      console.error('Import failed', err); showAlert('Invalid JSON');
    }
  }

  function handleImportFile(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => { handleImportText(String(ev.target.result || '')); };
    reader.onerror = (err) => { console.error('File read error', err); alert('Failed to read file'); };
    reader.readAsText(f);
    // clear input so same file can be selected again
    e.target.value = '';
    setOpenImportMenu(false);
  }

  // --- routines helpers for selected day ---
  function getDateForWeekday(dayIndex) {
    const today = new Date();
    const diff = dayIndex - today.getDay();
    const target = new Date(today);
    target.setDate(today.getDate() + diff);
    target.setHours(0,0,0,0);
    return target;
  }

  // open node editor modal with a draft copy
  function openNodeEditor(node) {
    // prepare draft including type-specific data (list/grid)
    const draft = { id: node.id, title: node.title || '', titleColor: node.titleColor || null, text: node.text || '', textColor: node.textColor || null, category: node.category || 'Default', reminder: node.reminder ? { ...node.reminder } : null, _z: node._z || 0, type: node.type || 'standard' };
    if (draft.type === 'list') {
      draft.items = (node.items || []).map(i => ({ ...i }));
      if (!draft.items || draft.items.length === 0) draft.items = [{ id: uid('li'), description: '' }];
    } else if (draft.type === 'grid') {
      draft.rows = node.rows || 1;
      draft.cols = node.cols || 1;
      draft.gridItems = (node.gridItems || []).map(i => ({ ...i }));
      if (!draft.gridItems || draft.gridItems.length === 0) draft.gridItems = [{ id: uid('gcell'), description: '' }];
    }
    setEditingNodeId(node.id);
    setEditingNodeDraft(draft);
  }

  function closeNodeEditor() { setEditingNodeId(null); setEditingNodeDraft(null); }

  function saveNodeEditor() {
    if (!editingNodeDraft) return closeNodeEditor();
    const draft = editingNodeDraft;
    setNodes(prev => prev.map(n => {
      if (n.id !== draft.id) return n;
      const base = { ...n, title: draft.title, titleColor: draft.titleColor || null, text: draft.text, textColor: draft.textColor || null, category: draft.category, reminder: draft.reminder, _z: draft._z, type: draft.type || 'standard' };
      if (draft.type === 'list') {
        return { ...base, items: (draft.items || []).map(i => ({ ...i })) };
      }
      if (draft.type === 'grid') {
        return { ...base, rows: draft.rows || 1, cols: draft.cols || 1, gridItems: (draft.gridItems || []).map(i => ({ ...i })) };
      }
      return base;
    }));
    // persist reminder array: if reminder exists and has id, update or add; if removed, delete from reminders
    setReminders(prev => {
      const r = draft.reminder;
      if (!r) {
        return prev.filter(x => !(x.nodeId === draft.id));
      }
      // ensure nodeId set
      const newRem = { ...r, nodeId: draft.id };
      const found = prev.find(x => x.id === newRem.id);
      if (found) return prev.map(x => x.id === newRem.id ? newRem : x);
      return [...prev, newRem];
    });
    closeNodeEditor();
  }

  function dateKeyFromDate(d) {
    return d.toISOString().slice(0,10);
  }


  function toggleRoutineForSelectedDay(routineId) {
    // Toggle checked state for the routine on the selected date.
    // If the global `createRoutineReminders` flag is enabled, automatically create a reminder
    // when checking (no extra manual "Check" click required). Unchecking removes reminders.
    const targetDate = getDateForWeekday(selectedRoutineDay);
    const key = dateKeyFromDate(targetDate);

    // Compute new value from current state so we can act immediately (create/remove reminders)
    const currentDayMap = routineChecks[key] ? { ...routineChecks[key] } : {};
    const newVal = !currentDayMap[routineId];

    // Persist checked state
    setRoutineChecks(prev => {
      const dayMap = prev[key] ? { ...prev[key] } : {};
      dayMap[routineId] = newVal;
      return { ...prev, [key]: dayMap };
    });

    if (!newVal) {
      // If user unchecked the item, remove any reminder tied to this routine for that date
      setReminders(prev => prev.filter(r => !(r.routineId === routineId && r.time && r.time.slice(0,10) === key)));
    }
  }

  function toggleDoneForSelectedDay(routineId) {
    // Toggle done state for the routine on the selected date. When marked Done we remove reminders for that routine/date.
    const key = dateKeyFromDate(getDateForWeekday(selectedRoutineDay));
    const currentDay = routineDones[key] ? { ...routineDones[key] } : {};
    const newVal = !currentDay[routineId];
    setRoutineDones(prev => ({ ...prev, [key]: { ...(prev[key]||{}), [routineId]: newVal } }));
    if (newVal) {
      // If now marked Done, remove any reminders for that routine/date
      setReminders(prev => prev.filter(r => !(r.routineId === routineId && r.time && r.time.slice(0,10) === key)));
    }
  }

  // Create a reminder for the routine for the selected day at the provided HH:MM time (local)
  function createRoutineReminder(routineId, hhmm) {
    try {
      const target = getDateForWeekday(selectedRoutineDay);
      const [hh, mm] = (hhmm || '09:00').split(':').map(Number);
      target.setHours(hh, mm, 0, 0);
      const iso = target.toISOString();
      const routine = (routines[selectedRoutineDay] || []).find(x => x.id === routineId) || { title: 'Routine' };
      const rem = { id: uid('rem'), routineId: routineId, nodeId: null, title: routine.title, note: '', time: iso, enabled: true, fired: false };
      setReminders(prev => [...prev, rem]);
      // mark as checked for that date
      const key = dateKeyFromDate(getDateForWeekday(selectedRoutineDay));
      setRoutineChecks(prev => ({ ...prev, [key]: { ...(prev[key]||{}), [routineId]: true } }));
      setRoutineTimeMenu({ open: false, routineId: null, time: '09:00' });
    } catch (err) {
      console.error('Failed creating routine reminder', err);
      alert('Failed to create reminder');
    }
  }

  // helper: get selected day's routines and checks
  const todayIndex = new Date().getDay();
  const selectedDayIndex = typeof selectedRoutineDay === 'number' ? selectedRoutineDay : todayIndex;
  const routinesForSelected = routines[selectedDayIndex] || [];
  const selectedDateKey = dateKeyFromDate(getDateForWeekday(selectedDayIndex));
  const selectedChecks = routineChecks[selectedDateKey] || {};
  const selectedDones = routineDones[selectedDateKey] || {};

  // --- render ---
  // We apply the global scale using CSS transform but resize the root container
  // (width/height) inversely so the scaled content fills the Electron window and
  // doesn't leave extra empty space when zoom changes. This keeps the app visually
  // consistent with the window size while letting users zoom in/out the UI.
  const rootStyle = {
    // set the visible viewport size to (100% / scale) so after scaling the
    // content occupies the full window area
    // Keep the app fixed to the window so the unscaled layout box doesn't
    // grow beyond the viewport (which caused a large blank area below when
    // scale < 1). We then inverse-size the inner content and apply the
    // transform so the visual result still fills the window.
    position: 'fixed',
    left: 0,
    top: 0,
    width: `${100 / (scale || 1)}vw`,
    height: `${100 / (scale || 1)}vh`,
    transform: `scale(${scale})`,
    transformOrigin: '0 0',
    overflow: 'hidden',
    boxSizing: 'border-box',
    background: 'radial-gradient(ellipse at 10% 10%, #0b1440 0%, #08122a 30%, #04060a 100%)',
    color: 'white',
    display: 'flex',
    gap: 8
  };

  return (
    <div className="nodeboard-app" style={rootStyle}>
      {/* Inline CSS for global button transitions and small interactions */}
  <style>{`.nodeboard-app button{transition: transform 120ms ease, box-shadow 120ms ease, opacity 120ms ease; min-width: 0;} .nodeboard-app button:active{transform: scale(0.96);} .nodeboard-app .small-fade{transition: opacity 180ms ease, transform 180ms ease;} .nodeboard-app button.responsive-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}`}</style>

      {/* In-app Confirm dialog rendered into body to avoid native confirm() focus issues */}
      {__confirmState.open ? createPortal(
        <div data-portal-popover="1">
          <div style={{ position: 'fixed', inset: 0, backdropFilter: 'blur(4px)', pointerEvents: 'none', zIndex: 30990 }} />
          <div onClick={() => __closeConfirm(false)} style={{ position: 'fixed', inset: 0, zIndex: 31000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: 520, maxWidth: '96%', borderRadius: 12, background: 'rgba(8,10,14,0.95)', padding: 18, boxShadow: '0 20px 60px rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ marginBottom: 12, whiteSpace: 'pre-wrap' }}>{__confirmState.msg}</div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={() => __closeConfirm(false)} style={styles.secondaryBtn}>Cancel</button>
                <button onClick={() => __closeConfirm(true)} style={styles.primaryBtn}>OK</button>
              </div>
            </div>
          </div>
        </div>, document.body) : null}
      {__alertState.open ? createPortal(
        <div data-portal-popover="1">
          <div style={{ position: 'fixed', inset: 0, backdropFilter: 'blur(4px)', pointerEvents: 'none', zIndex: 30990 }} />
          <div onClick={() => __closeAlert()} style={{ position: 'fixed', inset: 0, zIndex: 31000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: 520, maxWidth: '96%', borderRadius: 12, background: 'rgba(8,10,14,0.95)', padding: 18, boxShadow: '0 20px 60px rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ marginBottom: 12, whiteSpace: 'pre-wrap' }}>{__alertState.msg}</div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => __closeAlert()} style={styles.primaryBtn}>OK</button>
              </div>
            </div>
          </div>
        </div>, document.body) : null}

      {/* LEFT column: Routine & To-Do windows */}
  <div style={{ width: leftCollapsed ? 52 : leftWidth, padding: leftCollapsed ? 6 : 12, display: 'flex', flexDirection: 'column', gap: 12, position: 'relative', transition: 'width 220ms cubic-bezier(.2,.9,.2,1), padding 160ms ease' }}>
        {leftCollapsed ? (
          // Render the collapsed-open button directly positioned within the left column
          // container (which already has position: 'relative'). This ensures the button
          // stays anchored to the bottom even when the inner content height is small.
          <button onClick={() => setLeftCollapsed(false)} style={{ ...styles.smallPrimary, padding: 8, width: 36, height: 36, position: 'absolute', left: 8, bottom: 12, zIndex: 2000 }}>›</button>
        ) : null}

  <div style={{ transition: 'opacity 220ms ease, transform 220ms ease', opacity: leftCollapsed ? 0 : 1, transform: leftCollapsed ? 'translateX(-8px)' : 'translateX(0)', pointerEvents: leftCollapsed ? 'none' : 'auto' }}>

        {/* Routine window */}
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 12, backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>Routine</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
                Daily recurring tasks — editing: {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][selectedDayIndex]}{selectedDayIndex === todayIndex ? ' (Today)' : ''}
              </div>
              {/* Day selector: themed popover */}
              <div style={{ marginTop: 8, display: 'flex', gap: 6, position: 'relative' }}>
                <div style={{ position: 'relative' }}>
                  <button id="day-selector-btn" onClick={(ev) => { ev.stopPropagation(); setOpenDayMenu(s => !s); }} style={{ ...styles.smallSecondary, padding: '6px 10px', minWidth: 120, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][selectedDayIndex]}</span>
                    <span style={{ opacity: 0.85 }}>{selectedDayIndex === todayIndex ? '(Today)' : 'Select'}</span>
                  </button>
                  <PortalPopover anchorId="day-selector-btn" minWidth={180} isOpen={openDayMenu}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((full, i) => (
                        <button key={full} onClick={() => { setSelectedRoutineDay(i); setOpenDayMenu(false); }} style={{ ...styles.smallSecondary, textAlign: 'left', padding: '6px 10px' }}>{full}{i === todayIndex ? ' (Today)' : ''}</button>
                      ))}
                    </div>
                  </PortalPopover>
                </div>
              </div>
            </div>
            <div style={{ fontSize: 12, opacity: 0.9 }}>{routinesForSelected.length} items</div>
          </div>

          <div style={{ marginTop: 10 }}>
            {routinesForSelected.length === 0 ? <div style={{ color: 'rgba(255,255,255,0.6)' }}>No routines set for {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][selectedDayIndex]}.</div> : routinesForSelected.map(item => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 6, borderRadius: 8, marginTop: 6, background: 'rgba(0,0,0,0.12)', position: 'relative' }}>
                {/* Styled checkbox-button that opens a time popover */}
                <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                  <button id={`routine-time-btn-${item.id}`} onClick={(ev) => { ev.stopPropagation(); setRoutineTimeMenu(m => ({ ...m, open: true, routineId: item.id })); }} style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.12)', background: selectedChecks[item.id] ? 'linear-gradient(90deg,#7c5cff,#ff6db3)' : 'rgba(255,255,255,0.02)', color: 'white', cursor: 'pointer' }} title="Set/check">
                    {selectedChecks[item.id] ? '✓' : ''}
                  </button>

                  <PortalPopover anchorId={`routine-time-btn-${item.id}`} minWidth={220} isOpen={routineTimeMenu.open && routineTimeMenu.routineId === item.id}>
                    <div style={{ minWidth: 220 }}>
                      <div style={{ fontSize: 13, marginBottom: 6 }}>Reminder time for {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][selectedDayIndex]}</div>
                      <input type="time" value={routineTimeMenu.time} onChange={e => setRoutineTimeMenu(m => ({ ...m, time: e.target.value }))} style={{ width: '100%', padding: 8, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', color: 'white' }} />
                      <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
                        <button onClick={() => { createRoutineReminder(item.id, routineTimeMenu.time); }} style={{ ...styles.smallPrimary }}>Set reminder</button>
                        <button onClick={() => { const key = dateKeyFromDate(getDateForWeekday(selectedDayIndex)); setRoutineChecks(prev => ({ ...prev, [key]: { ...(prev[key]||{}), [item.id]: true } })); setRoutineTimeMenu({ open: false, routineId: null, time: '09:00' }); }} style={{ ...styles.smallSecondary }}>Check</button>
                        <button onClick={() => { toggleRoutineForSelectedDay(item.id); setRoutineTimeMenu({ open: false, routineId: null, time: '09:00' }); }} style={{ ...styles.smallDanger }}>Uncheck</button>
                      </div>
                    </div>
                  </PortalPopover>
                </div>

                <button onClick={(ev) => { ev.stopPropagation(); toggleDoneForSelectedDay(item.id); }} style={ selectedDones[item.id] ? { ...styles.smallPrimary, marginLeft: 6 } : { ...styles.smallSecondary, marginLeft: 6 } }>{ selectedDones[item.id] ? 'Done ✓' : 'Done' }</button>

                <div style={{ flex: 1 }}>{item.title}</div>
                <button onClick={() => removeRoutineItem(selectedDayIndex, item.id)} style={styles.dangerBtn}>Remove</button>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
            <input placeholder={`Add routine for ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][selectedDayIndex]}`} value={newRoutineText} onChange={e => setNewRoutineText(e.target.value)} style={{ flex: 1, padding: 8, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', color: 'white' }} />
            <button onClick={() => { if (!newRoutineText.trim()) return; addRoutineItem(selectedDayIndex, newRoutineText.trim()); setNewRoutineText(''); }} style={styles.primaryBtn}>Add</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8, position: 'relative' }}>
              <button id="routine-help-btn" onClick={(ev) => { ev.stopPropagation(); setOpenRoutineHelp(h => !h); }} title="Help" style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.06)', color: 'white', borderRadius: 6, padding: '6px 8px', cursor: 'pointer' }}>?</button>
              <PortalPopover anchorId="routine-help-btn" minWidth={200} maxWidth={320} isOpen={openRoutineHelp}>
                <div style={{ minWidth: 200, maxWidth: 320 }}>
                  <div style={{ fontSize: 13, marginBottom: 6, fontWeight: 700 }}>Reminders</div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: '1.3' }}>Reminders are created only when you click the "Set reminder" button on a routine. Use the small left button to open the time popover and choose a time.</div>
                </div>
              </PortalPopover>
            </div>
          </div>
        </div>

        {/* To-Do window */}
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 12, backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>To‑Do</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>Temporary tasks — add optional reminders</div>
            </div>
            <div style={{ fontSize: 12 }}>{todos.length} items</div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input placeholder="Task title" value={todoForm.title} onChange={e => setTodoForm(t => ({ ...t, title: e.target.value }))} style={{ flex: 1, padding: 8, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', color: 'white' }} />
            <button onClick={() => setShowTodoDatetime(s => !s)} style={{ ...styles.secondaryBtn, padding: 8, borderRadius: 8, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Set date/time (alarm)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 8v5l4 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M21 10.5C21 15.7467 16.5228 20 12 20C7.47715 20 3 15.7467 3 10.5C3 5.25329 7.47715 1 12 1C16.5228 1 21 5.25329 21 10.5Z" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>
          {todoForm.datetime ? <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>Scheduled: {new Date(todoForm.datetime).toLocaleString()}</div> : null}
          {showTodoDatetime ? (
            <div style={{ marginTop: 8 }}>
              <input type="datetime-local" value={todoForm.datetime} onChange={e => setTodoForm(t => ({ ...t, datetime: e.target.value }))} style={{ width: '100%', maxWidth: '100%', padding: 8, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', color: 'white' }} />
            </div>
          ) : null}
          <textarea placeholder="Optional note" value={todoForm.note} onChange={e => setTodoForm(t => ({ ...t, note: e.target.value }))} style={{ padding: 8, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', color: 'white', minHeight: 60 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { if (!todoForm.title.trim()) return; addTodoTask(todoForm.title.trim(), todoForm.note.trim(), todoForm.datetime || null); setTodoForm({ title: '', note: '', datetime: '' }); }} style={styles.primaryBtn}>Add To‑Do</button>
            <button onClick={() => { setTodoForm({ title: '', note: '', datetime: '' }); }} style={styles.secondaryBtn}>Clear</button>
          </div>

          <div style={{ marginTop: 6, maxHeight: 240, overflow: 'auto' }}>
            {todos.length === 0 ? <div style={{ color: 'rgba(255,255,255,0.6)' }}>No to-dos — add one above.</div> : todos.slice().reverse().map(t => (
              <div key={t.id} style={{ padding: 8, marginTop: 8, borderRadius: 8, background: 'rgba(255,255,255,0.02)', display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <div style={{ fontWeight: 700 }}>{t.title}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>{t.note}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{t.time ? new Date(t.time).toLocaleString() : ''}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button onClick={async () => { if (await confirmAsync('Delete this to-do?')) removeTodoTask(t.id); }} style={styles.dangerBtn}>Delete</button>
                </div>
              </div>
            ))}
          </div>
    </div>
  </div>

        {/* bottom-left collapse button when expanded */}
        {!leftCollapsed ? (
          <button onClick={() => setLeftCollapsed(true)} style={{ ...styles.smallSecondary, position: 'absolute', left: 8, bottom: 12, padding: 8, width: 36, height: 36, zIndex: 2000 }}>‹</button>
        ) : null}

      </div>

      {/* resizer between left and middle */}
      <div onMouseDown={(e) => onResizerMouseDown('left-mid', e)} onTouchStart={(e) => onResizerMouseDown('left-mid', e)} style={{ width: 8, cursor: 'col-resize', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.03), transparent)' }} />

  {/* Middle sidebar (original Sweet Nodeboard controls) */}
  <div style={{ width: midWidth, padding: 12, background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(6px)', borderRight: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Sweet-Themed Nodeboard</h2>
        <p style={{ marginTop: 6, color: 'rgba(255,255,255,0.7)' }}>Nodes, connectors and reminders. (Nodeboard controls)</p>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <div style={{ position: 'relative' }}>
            <button id="create-node-btn" onClick={(e) => { e.stopPropagation(); setOpenCreateNodeMenu(s => !s); }} style={styles.primaryBtn}>+ Node ▾</button>
            <PortalPopover anchorId="create-node-btn" minWidth={180} isOpen={openCreateNodeMenu}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {NODE_TYPES.map(t => (
                  <button key={t.value} onClick={(ev) => { ev.stopPropagation(); handleCreateNode(t.value); }} style={{ ...styles.smallSecondary, textAlign: 'left', padding: '6px 10px' }}>{t.label}</button>
                ))}
              </div>
            </PortalPopover>
          </div>
          <button onClick={() => addCollection()} style={{ ...styles.secondaryBtn }}>+ Collection</button>

          {/* Import menu */}
          <div style={{ position: 'relative' }}>
            <button id="import-btn" onClick={(e) => { e.stopPropagation(); setOpenImportMenu(s => !s); }} style={styles.secondaryBtn}>Import ▾</button>
            <PortalPopover anchorId="import-btn" minWidth={220} isOpen={openImportMenu}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button onClick={() => { setOpenImportText(true); setOpenImportMenu(false); }} style={{ ...styles.smallSecondary, textAlign: 'left' }}>Paste JSON</button>
                <button onClick={() => { importFileRef.current && importFileRef.current.click(); }} style={{ ...styles.smallSecondary, textAlign: 'left' }}>Choose file…</button>
                <input ref={importFileRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={handleImportFile} />
              </div>
            </PortalPopover>
          </div>

            {/* Import text modal for Paste JSON (works in Electron) */}
            {openImportText ? (
              <SettingsModal isOpen={openImportText} onRequestClose={() => setOpenImportText(false)}>
                <div style={{ width: 640, maxWidth: '96%', borderRadius: 8, background: 'transparent', padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>Import JSON</div>
                    <button onClick={() => setOpenImportText(false)} style={{ ...styles.secondaryBtn }}>X</button>
                  </div>
                  <textarea value={importTextValue} onChange={e => setImportTextValue(e.target.value)} placeholder={'Paste export JSON here'} style={{ width: '100%', minHeight: 220, resize: 'vertical', background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid rgba(255,255,255,0.06)', padding: 8, borderRadius: 8, fontFamily: 'monospace', fontSize: 12 }} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
                    <button onClick={() => { setImportTextValue(''); setOpenImportText(false); }} style={styles.secondaryBtn}>Cancel</button>
                    <button onClick={() => { handleImportText(importTextValue); setImportTextValue(''); setOpenImportText(false); }} style={styles.primaryBtn}>Import</button>
                  </div>
                </div>
              </SettingsModal>
            ) : null}

          {/* Export menu */}
          <div style={{ position: 'relative' }}>
            <button id="export-btn" onClick={(e) => { e.stopPropagation(); setOpenExportMenu(s => !s); }} style={styles.secondaryBtn}>Export ▾</button>
            <PortalPopover anchorId="export-btn" minWidth={220} isOpen={openExportMenu}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button onClick={() => { exportToFile(); setOpenExportMenu(false); }} style={{ ...styles.smallSecondary, textAlign: 'left' }}>Download file</button>
                <button onClick={() => { exportToClipboard(); setOpenExportMenu(false); }} style={{ ...styles.smallSecondary, textAlign: 'left' }}>Copy to clipboard</button>
              </div>
            </PortalPopover>
          </div>
          <div style={{ position: 'relative' }}>
            <button id="settings-btn" onClick={(e) => { e.stopPropagation(); openSettingsModal(); }} style={{ ...styles.secondaryBtn }}>Settings ⚙</button>
            <SettingsModal isOpen={openSettings} onRequestClose={() => setOpenSettings(false)}>
              <div onClick={e => e.stopPropagation()} style={{ width: 680, maxWidth: '96%', borderRadius: 12, background: 'rgba(8,10,14,0.95)', padding: 18, boxShadow: '0 20px 60px rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.04)', maxHeight: '90vh', overflow: 'auto', boxSizing: 'border-box' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>Settings</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { saveBackupNow(); }} style={styles.secondaryBtn}>Save backup now</button>
                    <button onClick={() => { setOpenBackupsViewer(true); /* keep settings open so backups modal overlays */ }} style={styles.secondaryBtn}>Backups</button>
                    <button onClick={() => { /* Cancel: discard drafts */ setOpenSettings(false); }} style={styles.secondaryBtn}>Cancel</button>
                    <button onClick={() => {
                      // Save drafts into main state (these effects persist to localStorage)
                      setZMode(draftZMode);
                      setDefaultTitleColor(draftDefaultTitleColor || null);
                      setDefaultTextColor(draftDefaultTextColor || null);
                      setDefaultCategory(draftDefaultCategory || 'Default');
                      setAutoColorOnConnect(!!draftAutoColorOnConnect);
                      // background notifications setting
                      setBgNotificationsEnabled(!!draftBgNotificationsEnabled);
                      // backups enabled setting
                      setBackupsEnabled(!!draftBackupsEnabled);
                      try { localStorage.setItem(STORAGE_KEY + ':backupsEnabled', draftBackupsEnabled ? '1' : '0'); } catch { /* ignore */ }
                      // Also persist immediately (don't rely solely on useEffect timing)
                      try { localStorage.setItem(STORAGE_KEY + ':bgNotificationsEnabled', draftBgNotificationsEnabled ? '1' : '0'); } catch { /* ignore */ }
                      try { if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.invoke === 'function') window.electronAPI.invoke('set-bg-notifications-enabled', !!draftBgNotificationsEnabled).catch(() => {}); } catch { /* ignore */ }
                      // commit edited category gradients
                      try { setCategoryGradients(draftCategoryGradients); } catch { /* ignore */ }
                      // apply global zoom
                      setScale(draftScale || 1);
                      setOpenSettings(false);
                    }} style={styles.primaryBtn}>Save</button>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 18 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Z‑Indexing</div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      <button onClick={(ev) => { ev.stopPropagation(); setZMode('auto'); }} style={ zMode === 'auto' ? styles.smallPrimary : styles.smallSecondary }>Auto</button>
                      <button onClick={(ev) => { ev.stopPropagation(); setZMode('manual'); }} style={ zMode === 'manual' ? styles.smallPrimary : styles.smallSecondary }>Manual</button>
                    </div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', marginBottom: 12 }}>When Auto is enabled, nodes you start dragging are brought to the top automatically. When Manual is selected you can set z-index per-node from the node editor.</div>

                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Defaults for new nodes</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 13, marginBottom: 6 }}>Default title color</div>
                        <ColorPicker value={draftDefaultTitleColor || '#ffffff'} onChange={v => setDraftDefaultTitleColor(v)} previewStyle={{ width: '100%', height: 36, borderRadius: 8, border: '1px solid rgba(255,255,255,0.04)', padding: 4 }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 13, marginBottom: 6 }}>Default text color</div>
                        <ColorPicker value={draftDefaultTextColor || '#ffffff'} onChange={v => setDraftDefaultTextColor(v)} previewStyle={{ width: '100%', height: 36, borderRadius: 8, border: '1px solid rgba(255,255,255,0.04)', padding: 4 }} />
                      </div>
                    </div>

                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 13, marginBottom: 6 }}>Default Node Color/Gradient</div>
                      <div>
                        <button id="settings-default-color-btn" onClick={(ev) => { ev.stopPropagation(); setOpenSettingsColorPicker(s => !s); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: 8, borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', cursor: 'pointer' }}>
                          <div style={{ width: 36, height: 26, borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)', background: categoryBackground(draftDefaultCategory) }} />
                          <div style={{ flex: 1, textAlign: 'left', fontSize: 13 }}>{(draftDefaultCategory || '').replace(/([A-Z])/g, ' $1').trim()}</div>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ marginLeft: 4 }} xmlns="http://www.w3.org/2000/svg"><path d="M6 9l6 6 6-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                        <PortalPopover anchorId="settings-default-color-btn" offsetX={-120} zIndex={21000} isOpen={openSettingsColorPicker}>
                          <div style={{ display: 'flex', gap: 8 }}>
                            {Object.keys(categoryGradients).map(k => (
                              <button key={k} onClick={(ev) => { ev.stopPropagation(); setDraftDefaultCategory(k); setOpenSettingsColorPicker(false); }} title={k} style={{ width: 36, height: 26, borderRadius: 6, border: draftDefaultCategory === k ? '2px solid rgba(255,255,255,0.95)' : '1px solid rgba(0,0,0,0.2)', background: categoryBackground(k), cursor: 'pointer', padding: 0 }} />
                            ))}
                          </div>
                        </PortalPopover>
                      </div>
                    </div>

                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 13, marginBottom: 6, fontWeight: 700 }}>Custom Category Gradient</div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ width: 220 }}>
                          <ThemedSelect
                            id={`settings-gradient-category`}
                            value={draftEditCategory}
                            placeholder="Category..."
                            minWidth={160}
                            options={Object.keys(draftCategoryGradients).map(k => ({ value: k, label: k }))}
                            onChange={(c) => {
                              setDraftEditCategory(c);
                              const g = (draftCategoryGradients && draftCategoryGradients[c]) || categoryGradients[c] || { a: '#ffffff', b: '#ffffff' };
                              setDraftEditLeft(g.a); setDraftEditRight(g.b);
                            }}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <div>
                            <div style={{ fontSize: 12, marginBottom: 4 }}>Left → Right</div>
                            <ColorPicker value={draftEditLeft} onChange={v => setDraftEditLeft(v)} previewStyle={{ width: 64, height: 36, borderRadius: 6, border: '1px solid rgba(255,255,255,0.04)' }} />
                          </div>
                          <div>
                            <div style={{ fontSize: 12, marginBottom: 4 }}>Right → Left</div>
                            <ColorPicker value={draftEditRight} onChange={v => setDraftEditRight(v)} previewStyle={{ width: 64, height: 36, borderRadius: 6, border: '1px solid rgba(255,255,255,0.04)' }} />
                          </div>
                        </div>
                        <div>
                          <button onClick={() => {
                            setDraftCategoryGradients(prev => ({ ...prev, [draftEditCategory]: { a: draftEditLeft, b: draftEditRight } }));
                          }} style={styles.smallPrimary}>Apply</button>
                        </div>
                      </div>
                      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>Choose a gradient, pick two colors and click Apply — these changes will be saved when you click Save at the top of this modal.<br></br>(Note: This overrides the "Default Node Color/Gradient" that you've set.)</div>
                    </div>
                    <hr></hr>
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button onClick={() => setDraftAutoColorOnConnect(s => !s)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: 6, borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', background: draftAutoColorOnConnect ? 'linear-gradient(90deg,#7c5cff,#ff6db3)' : 'rgba(255,255,255,0.02)', cursor: 'pointer' }}>
                          <div style={{ width: 16, height: 16, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', background: draftAutoColorOnConnect ? 'rgba(255,255,255,0.14)' : 'transparent' }}>
                            {draftAutoColorOnConnect ? (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 6L9 17l-5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            ) : null}
                          </div>
                          <div style={{ fontSize: 13, color: 'white' }}>Auto color-on-connect (copy title/text colors across a connection)</div>
                        </button>
                      </div>
                    </div>
                  </div>

                    <div style={{ width: 220 }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Global theme</div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', marginBottom: 8 }}>Placeholder (coming soon)</div>
                    <div style={{ marginTop: 12 }}>
                      <button onClick={() => { setDraftDefaultTitleColor(null); setDraftDefaultTextColor(null); setDraftDefaultCategory('Default'); setDraftAutoColorOnConnect(false); }} style={styles.smallDanger}>Reset defaults</button>
                    </div>

                    <div style={{ marginTop: 18 }}>
                      <div style={{ fontWeight: 700, marginBottom: 6 }}>Global zoom</div>
                      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', marginBottom: 8 }}>Scale the whole board (50% - 200%)</div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input type="range" min={0.5} max={2} step={0.05} value={draftScale} onChange={e => setDraftScale(Math.max(0.5, Number(e.target.value) || 1))} style={{ flex: 1 }} />
                        <div style={{ width: 64, textAlign: 'right', fontSize: 13 }}>{Math.round(draftScale * 100)}%</div>
                      </div>
                    </div>
                    
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontWeight: 700, marginBottom: 6 }}>Background notifications</div>
                      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', marginBottom: 8 }}>Keep the app running in the background (tray) so reminders fire even when the window is closed.</div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button onClick={() => setDraftBgNotificationsEnabled(s => !s)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: 6, borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', background: draftBgNotificationsEnabled ? 'linear-gradient(90deg,#7c5cff,#ff6db3)' : 'rgba(255,255,255,0.02)', cursor: 'pointer' }}>
                          <div style={{ width: 16, height: 16, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', background: draftBgNotificationsEnabled ? 'rgba(255,255,255,0.14)' : 'transparent' }}>{draftBgNotificationsEnabled ? '✓' : ''}</div>
                          <div style={{ fontSize: 13, color: 'white' }}>{draftBgNotificationsEnabled ? 'Enabled' : 'Disabled'}</div>
                        </button>
                      </div>
                      <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button onClick={async () => {
                          try {
                            if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.invoke === 'function') {
                              const ok = await window.electronAPI.invoke('show-notification', { title: 'Nodeboard test', body: 'This is a test notification' });
                              if (ok) alert('Notification sent'); else alert('Notification failed or not supported (check system settings)');
                            } else {
                              alert('Notification not available in this environment');
                            }
                          } catch (err) { alert('Notification error: ' + (err && err.message ? err.message : String(err))); }
                        }} style={{ ...styles.smallSecondary }}>Test notification</button>
                      </div>
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>Automatic backups</div>
                        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', marginBottom: 8 }}>Create automatic backups in your user data directory every 3 changes.</div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <button onClick={() => setDraftBackupsEnabled(s => !s)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: 6, borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', background: draftBackupsEnabled ? 'linear-gradient(90deg,#7c5cff,#ff6db3)' : 'rgba(255,255,255,0.02)', cursor: 'pointer' }}>
                            <div style={{ width: 16, height: 16, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', background: draftBackupsEnabled ? 'rgba(255,255,255,0.14)' : 'transparent' }}>{draftBackupsEnabled ? '✓' : ''}</div>
                            <div style={{ fontSize: 13, color: 'white' }}>{draftBackupsEnabled ? 'Enabled' : 'Disabled'}</div>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </SettingsModal>
            {openBackupsViewer ? (
              <SettingsModal isOpen={openBackupsViewer} onRequestClose={() => { setOpenBackupsViewer(false); setViewingBackupContent(null); setViewingBackupName(null); }}>
                <div onClick={e => e.stopPropagation()} style={{ width: 820, maxWidth: '96%', borderRadius: 12, background: 'rgba(8,10,14,0.95)', padding: 18, boxShadow: '0 20px 60px rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.04)', maxHeight: '90vh', overflow: 'auto', boxSizing: 'border-box' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>Backups</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => { refreshBackupsList(); }} style={styles.smallSecondary}>Refresh</button>
                      <button onClick={async () => { if (await confirmAsync('Delete ALL backups? This cannot be undone.')) removeAllBackups(); }} style={styles.dangerBtn}>Delete All</button>
                      <button onClick={() => { setOpenBackupsViewer(false); setViewingBackupContent(null); setViewingBackupName(null); }} style={styles.secondaryBtn}>Close</button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ width: 360, maxHeight: '60vh', overflow: 'auto', borderRight: '1px solid rgba(255,255,255,0.03)', paddingRight: 12 }}>
                      {backupsLoading ? <div style={{ color: 'rgba(255,255,255,0.7)' }}>Loading…</div> : (
                        backups.length ? backups.map(b => (
                          <div key={b.name} style={{ padding: 8, marginBottom: 8, borderRadius: 8, background: 'rgba(255,255,255,0.02)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ fontWeight: 700, fontSize: 13 }}>{b.name}</div>
                              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{b.size ? `${Math.round(b.size/1024)} KB` : ''}</div>
                            </div>
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{b.time ? new Date(b.time).toLocaleString() : ''}</div>
                            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                              <button onClick={() => viewBackup(b.name)} style={styles.smallSecondary}>View</button>
                              <button onClick={async () => { if (await confirmAsync('Restore this backup? This will overwrite your current board.')) restoreBackup(b.name); }} style={styles.primaryBtn}>Restore</button>
                              <button onClick={() => removeBackup(b.name)} style={styles.dangerBtn}>Delete</button>
                            </div>
                          </div>
                        )) : <div style={{ color: 'rgba(255,255,255,0.7)' }}>No backups found</div>
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, marginBottom: 8 }}>{viewingBackupName || 'Preview'}</div>
                      {viewingBackupContent !== null ? (
                        <textarea readOnly value={viewingBackupContent} style={{ width: '100%', minHeight: 360, resize: 'vertical', background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid rgba(255,255,255,0.06)', padding: 8, borderRadius: 8, fontFamily: 'monospace', fontSize: 12 }} />
                      ) : (
                        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Select a backup to view its JSON here. You can restore or delete backups from the list.</div>
                      )}
                    </div>
                  </div>
                </div>
              </SettingsModal>
            ) : null}
          </div>
        </div>
        <div style={{ marginTop: 12, fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>Nodes: {nodes.length} • Connections: {connections.length} • Reminders: {reminders.length}</div>
        {/* nodes list: make this a flexible scroll area so it grows to the available space */}
        <div style={{ marginTop: 10, overflow: 'auto', flex: 1, minHeight: 0 }}>
          {nodes.map(n => (
            <div key={n.id} style={{ padding: 8, marginTop: 8, borderRadius: 8, background: 'rgba(255,255,255,0.02)' }}>
              <div style={{ fontWeight: 700 }}>{n.title}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>{n.type === 'list' ? `List: ${ (n.items && n.items.length) || 0 } items` : (n.type === 'grid' ? `Grid: ${n.rows || 1}x${n.cols || 1}` : (n.text ? `${n.text.slice(0,80)}${n.text.length>80?'...':''}` : ''))}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={() => openNodeEditor(n)} style={styles.secondaryBtn}>Edit</button>
                {/* Connections manager (only in the list) */}
                <div style={{ position: 'relative' }}>
                  <button id={`conn-btn-${n.id}`} onClick={(e) => { e.stopPropagation(); const next = openConnMenu === n.id ? null : n.id; setOpenConnMenu(next); if (next) setConnFormValues(prev => ({ ...prev, [n.id]: prev[n.id] || { target: '', fromSide: 'right', toSide: 'left' } })); }} style={styles.secondaryBtn}>Conns</button>
                  <PortalPopover anchorId={`conn-btn-${n.id}`} minWidth={300} isOpen={openConnMenu === n.id}>
                      <div style={{ minWidth: 300 }}>
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>Connections</div>
                        <div style={{ maxHeight: 180, overflow: 'auto', marginBottom: 8 }}>
                          {connections.filter(c => c.from === n.id || c.to === n.id).length === 0 ? (
                            <div style={{ color: 'rgba(255,255,255,0.7)' }}>No connections</div>
                          ) : connections.filter(c => c.from === n.id || c.to === n.id).map(c => {
                            const otherId = c.from === n.id ? c.to : c.from;
                            const other = nodes.find(x => x.id === otherId);
                            const dir = c.from === n.id ? '→' : '←';
                            return (
                              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                                <div style={{ fontSize: 13 }}>{c.from === n.id ? `${n.title} ${dir} ${other ? other.title : otherId}` : `${other ? other.title : otherId} ${dir} ${n.title}`}</div>
                                <button onClick={() => { setConnections(prev => prev.filter(x => x.id !== c.id)); }} style={{ ...styles.smallDanger }}>Remove</button>
                              </div>
                            );
                          })}
                        </div>
                        <div style={{ fontSize: 13, marginBottom: 6 }}>Create connection</div>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                          <div style={{ flex: 1 }}>
                            <ThemedSelect
                              id={`conn-target-${n.id}`}
                              value={(connFormValues[n.id] && connFormValues[n.id].target) || ''}
                              placeholder="Select node..."
                              minWidth={180}
                              options={[{ value: '', label: 'Select node...' }, ...nodes.filter(x => x.id !== n.id).map(x => ({ value: x.id, label: x.title }))]}
                              onChange={(v) => setConnFormValues(prev => ({ ...prev, [n.id]: { ...(prev[n.id] || { fromSide: 'right', toSide: 'left' }), target: v } }))}
                            />
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <div style={{ width: 100 }}>
                              <ThemedSelect id={`conn-fromside-${n.id}`} value={(connFormValues[n.id] && connFormValues[n.id].fromSide) || 'right'} minWidth={100} options={[{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }]} onChange={(v) => setConnFormValues(prev => ({ ...prev, [n.id]: { ...(prev[n.id] || {}), fromSide: v } }))} />
                            </div>

                            <div style={{ width: 100 }}>
                              <ThemedSelect id={`conn-toside-${n.id}`} value={(connFormValues[n.id] && connFormValues[n.id].toSide) || 'left'} minWidth={100} options={[{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }]} onChange={(v) => setConnFormValues(prev => ({ ...prev, [n.id]: { ...(prev[n.id] || {}), toSide: v } }))} />
                            </div>
                          </div>
                          <button onClick={() => {
                            const form = connFormValues[n.id] || {};
                            const targetId = form.target || '';
                            if (!targetId) return alert('Select a target node');
                            const fromSide = form.fromSide || 'right';
                            const toSide = form.toSide || 'left';
                            // avoid duplicates
                            setConnections(prev => {
                              if (prev.find(x => x.from === n.id && x.to === targetId && x.fromSide === fromSide && x.toSide === toSide)) return prev;
                              return [...prev, { id: uid('c'), from: n.id, to: targetId, fromSide, toSide }];
                            });
                            setOpenConnMenu(null);
                          }} style={{ ...styles.smallPrimary }}>Create</button>
                        </div>
                      </div>
                    </PortalPopover>
                </div>
                <button onClick={async () => { if (await confirmAsync('Delete node?')) removeNode(n.id); }} style={styles.dangerBtn}>Delete</button>
              </div>
            </div>
          ))}
        </div>

        {/* footer: board zoom controls (fixed to bottom of middle sidebar) */}
        <div style={{ marginTop: 12, paddingTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'rgba(12,16,22,0.5)', padding: 8, borderRadius: 10, border: '1px solid rgba(255,255,255,0.04)' }}>
              <button onClick={() => setBoardScale(s => Math.max(0.4, +(s - 0.1).toFixed(2)))} style={{ ...styles.smallSecondary }}>−</button>
              <div style={{ color: 'white', fontSize: 13, minWidth: 60, textAlign: 'center' }}>{Math.round(boardScale * 100)}%</div>
              <button onClick={() => setBoardScale(s => Math.min(2.5, +(s + 0.1).toFixed(2)))} style={{ ...styles.smallSecondary }}>+</button>
              <button onClick={() => setBoardScale(1)} style={{ ...styles.smallSecondary }}>Reset</button>
            </div>
          </div>
        </div>
      </div>

      {/* resizer between middle and main board */}
      <div onMouseDown={(e) => onResizerMouseDown('mid-main', e)} onTouchStart={(e) => onResizerMouseDown('mid-main', e)} style={{ width: 8, cursor: 'col-resize', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.03), transparent)' }} />

      {/* Main board area */}
      <div ref={outerRef} style={{ position: 'relative', flex: 1, overflow: 'auto' }} onMouseMove={onBoardPointerMove} onTouchMove={onBoardPointerMove} onMouseUp={onBoardPointerUp} onTouchEnd={onBoardPointerUp}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(180deg, rgba(255,255,255,0.02) 1px, transparent 1px)', backgroundSize: '40px 40px', opacity: 0.25 }} />

  <div ref={innerRef} style={{ position: 'relative', minWidth: 4000, minHeight: 3000, transition: 'transform 180ms ease', transform: `scale(${boardScale})`, transformOrigin: '0 0', willChange: 'transform' }}>

          {/* Collections: rendered first so nodes appear above the collection background */}
          {collections.map(col => (
            <div key={col.id} style={{ position: 'absolute', left: col.x, top: col.y, width: col.w, height: col.h, borderRadius: 12, background: 'linear-gradient(180deg, rgba(255,255,255,0.01), rgba(255,255,255,0.015))', border: '1px solid rgba(255,255,255,0.04)', padding: 8, boxSizing: 'border-box', transition: 'opacity 220ms ease, transform 220ms cubic-bezier(.2,.9,.2,1)', opacity: col._new ? 0 : 1, transform: col._new ? 'scale(0.96) translateY(6px)' : 'none' }}>
              <div onMouseDown={(e) => onCollectionMouseDown(e, col)} onTouchStart={(e) => onCollectionMouseDown(e, col)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, cursor: 'move', padding: '4px' }}>
                <div style={{ fontWeight: 800 }}>
                  {editingCollectionId === col.id ? (
                    <input autoFocus value={editingCollectionTitle} onChange={e => setEditingCollectionTitle(e.target.value)} onBlur={() => { setCollections(prev => prev.map(c => c.id === col.id ? { ...c, title: editingCollectionTitle || c.title } : c)); setEditingCollectionId(null); }} onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.currentTarget.blur(); } }} style={{ padding: 6, borderRadius: 6, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', color: 'white' }} />
                  ) : (
                    <div onDoubleClick={() => { setEditingCollectionId(col.id); setEditingCollectionTitle(col.title); }} style={{ userSelect: 'none' }}>{col.title}</div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ position: 'relative' }}>
                    <button id={`col-create-node-btn-${col.id}`} onClick={(ev) => { ev.stopPropagation(); setOpenCreateNodeMenuForCollection(openCreateNodeMenuForCollection === col.id ? null : col.id); }} style={{ ...styles.smallPrimary }}>+ Node ▾</button>
                    <PortalPopover anchorId={`col-create-node-btn-${col.id}`} minWidth={160} isOpen={openCreateNodeMenuForCollection === col.id}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {NODE_TYPES.map(t => (
                          <button key={t.value} onClick={(ev) => { ev.stopPropagation(); handleCreateNode(t.value, col.id); }} style={{ ...styles.smallSecondary, textAlign: 'left', padding: '6px 10px' }}>{t.label}</button>
                        ))}
                      </div>
                    </PortalPopover>
                  </div>
                  <button onClick={async (ev) => { ev.stopPropagation(); if (await confirmAsync('Delete collection and its nodes?')) removeCollection(col.id); }} style={styles.smallDanger}>Delete</button>
                </div>
              </div>
              <div style={{ marginTop: 8, height: `calc(100% - 44px)`, backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(180deg, rgba(255,255,255,0.02) 1px, transparent 1px)', backgroundSize: '40px 40px', opacity: 0.08, borderRadius: 8 }} />
              {/* resize handle bottom-right */}
              <div onMouseDown={(e) => onCollectionResizerDown(col.id, e)} onTouchStart={(e) => onCollectionResizerDown(col.id, e)} style={{ position: 'absolute', right: 8, bottom: 8, width: 14, height: 14, background: 'rgba(255,255,255,0.06)', borderRadius: 3, cursor: 'nwse-resize' }} />
            </div>
          ))}

          {/* Connections overlay + curves */}
          {renderConnections()}

          {/* Nodes */}
          {nodes.map(node => (
            <div key={node.id} ref={el => (nodeRefs.current[node.id] = el)} style={{ position: 'absolute', left: node.x, top: node.y, padding: 12, borderRadius: 14, boxShadow: '0 10px 30px rgba(0,0,0,0.45)', background: categoryBackground(node.category), minWidth: (node.type === 'grid' ? Math.max(220, (node.cols || 1) * 120 + ((node.cols || 1) - 1) * 8 + 32) : 220), maxWidth: (node.type === 'grid' ? Math.max(520, (node.cols || 1) * 120 + ((node.cols || 1) - 1) * 8 + 32) : 520), transition: 'opacity 220ms ease, transform 220ms cubic-bezier(.2,.9,.2,1), filter 180ms ease', opacity: node._new ? 0 : 1, transform: node._new ? 'scale(0.96) translateY(6px)' : 'none', zIndex: (node._z ? node._z : 1), filter: `brightness(${node._brightness || 1})` }} onMouseDown={(e) => onNodeMouseDown(e, node)} onTouchStart={(e) => onNodeMouseDown(e, node)}>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div data-node-id={node.id} data-side={'left'} onMouseDown={(e) => onConnectorDown(e, node.id, 'left')} onTouchStart={(e) => onConnectorDown(e, node.id, 'left')} style={{ width: 22, height: 22, borderRadius: 16, border: '2px solid rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'rgba(255,255,255,0.03)' }} title="Input">
                    <div style={{ width: 8, height: 8, borderRadius: 8, background: 'white' }} />
                  </div>
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: node.titleColor || 'white' }} dangerouslySetInnerHTML={{ __html: markdownToHtml(node.title) }} />
                  {node.type === 'list' ? (
                    <div style={{ marginTop: 8 }}>
                      {/* show node description above the list preview */}
                      <div style={{ fontSize: 13, lineHeight: '1.3', color: node.textColor || 'rgba(255,255,255,0.9)', marginBottom: 8 }} dangerouslySetInnerHTML={{ __html: markdownToHtml(node.text) }} />
                      <div style={{ fontSize: 13, color: node.textColor || 'rgba(255,255,255,0.95)', marginBottom: 8 }}>List • { (node.items && node.items.length) || 0 } item(s)</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {(node.items && node.items.length) ? node.items.map(it => (
                          <div key={it.id} style={{ padding: 8, borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.02)', color: node.textColor || 'rgba(255,255,255,0.9)', fontSize: 13 }}>
                            {it.description ? it.description : <span style={{ color: 'rgba(255,255,255,0.55)' }}>Empty</span>}
                          </div>
                        )) : (
                          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>No items yet</div>
                        )}
                      </div>
                    </div>
                  ) : node.type === 'grid' ? (
                    <div style={{ marginTop: 8 }}>
                      {/* show node description above the grid preview */}
                      <div style={{ fontSize: 13, lineHeight: '1.3', color: node.textColor || 'rgba(255,255,255,0.9)', marginBottom: 8 }} dangerouslySetInnerHTML={{ __html: markdownToHtml(node.text) }} />
                      <div style={{ fontSize: 13, color: node.textColor || 'rgba(255,255,255,0.95)', marginBottom: 8 }}>Grid • {node.rows || 1} x {node.cols || 1}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${node.cols || 1}, minmax(120px,1fr))`, gap: 8, overflowX: 'auto' }}>
                        {(node.gridItems && node.gridItems.length) ? node.gridItems.map((cell, i) => (
                          <div key={cell.id || i} style={{ padding: 8, borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.02)', color: node.textColor || 'rgba(255,255,255,0.9)', fontSize: 13, boxSizing: 'border-box', minHeight: 40, display: 'flex', alignItems: 'flex-start', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                            {cell.description ? cell.description : <span style={{ color: 'rgba(255,255,255,0.55)' }}>Empty</span>}
                          </div>
                        )) : (
                          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Empty grid</div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop: 8, fontSize: 13, lineHeight: '1.25', color: node.textColor || 'rgba(255,255,255,0.95)' }} dangerouslySetInnerHTML={{ __html: markdownToHtml(node.text) }} />
                  )}

                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button onClick={(ev) => { ev.stopPropagation(); openNodeEditor(node); }} style={{ ...styles.smallSecondary }}>Edit</button>
                    {node.type === 'list' ? (
                      <button onClick={(ev) => { ev.stopPropagation(); setNodes(prev => prev.map(n => n.id === node.id ? { ...n, items: [...(n.items||[]), { id: uid('li'), description: '' }] } : n)); }} style={{ ...styles.smallPrimary }}>+ Item</button>
                    ) : null}
                  </div>
                </div>

                <div style={{ width: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div data-node-id={node.id} data-side={'right'} onMouseDown={(e) => onConnectorDown(e, node.id, 'right')} onTouchStart={(e) => onConnectorDown(e, node.id, 'right')} style={{ width: 26, height: 26, borderRadius: 16, border: '2px solid rgba(255,255,255,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'rgba(255,255,255,0.06)' }} title="Output">
                    <div style={{ width: 10, height: 10, borderRadius: 10, background: 'white' }} />
                  </div>
                </div>
              </div>
            </div>
          ))}

        </div>

        {/* Zoom controls moved into middle sidebar footer (no floating controls) */}
      </div>

      {/* resizer between main and right */}
      <div onMouseDown={(e) => onResizerMouseDown('main-right', e)} onTouchStart={(e) => onResizerMouseDown('main-right', e)} style={{ width: 8, cursor: 'col-resize', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.03), transparent)' }} />

      {/* Right column: Reminders list (supports collapse) */}
  <div ref={rightColRef} style={{ width: rightCollapsed ? 52 : rightWidth, padding: rightCollapsed ? 6 : 16, background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(6px)', borderLeft: '1px solid rgba(255,255,255,0.04)', position: 'relative', transition: 'width 220ms cubic-bezier(.2,.9,.2,1), padding 160ms ease' }}>
        {rightCollapsed ? (
          // Render the collapsed-open button directly in the right column container so it
          // stays anchored to the bottom (mirrors left-pane fix).
          <button onClick={() => setRightCollapsed(false)} style={{ ...styles.smallPrimary, padding: 8, width: 36, height: 36, position: 'absolute', right: 8, bottom: 12, zIndex: 2000 }}>‹</button>
        ) : (
          <>
            <h3 style={{ margin: 0, fontSize: 16 }}>Reminders</h3>
            <div style={{ marginTop: 8, color: 'rgba(255,255,255,0.75)' }}>Reminders created from nodes or to-dos</div>
            <div style={{ marginTop: 12, overflow: 'auto', maxHeight: '70vh' }}>
              {reminders.length === 0 ? <div style={{ color: 'rgba(255,255,255,0.6)' }}>No reminders yet.</div> : reminders.slice().reverse().map(r => (
                <div key={r.id} style={{ padding: 10, marginBottom: 8, borderRadius: 8, background: 'rgba(255,255,255,0.02)', position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ fontWeight: 700 }}>{r.title}</div>
                      <button id={`reminder-note-btn-${r.id}`} onClick={(ev) => { ev.stopPropagation(); setOpenReminderNote(openReminderNote === r.id ? null : r.id); }} title="Show note" style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.06)', color: 'white', borderRadius: 6, padding: '4px 6px', cursor: 'pointer' }}>i</button>
                    </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>{new Date(r.time).toLocaleString()}</div>

                  <PortalPopover anchorId={`reminder-note-btn-${r.id}`} minWidth={220} isOpen={openReminderNote === r.id}>
                    <div style={{ minWidth: 220 }}>
                      <div style={{ fontSize: 13, opacity: 0.9, marginBottom: 6 }}>Note</div>
                      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>{r.note || <span style={{ color: 'rgba(255,255,255,0.55)' }}>No note provided</span>}</div>
                    </div>
                  </PortalPopover>

                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button onClick={() => setReminders(prev => prev.map(x => x.id === r.id ? { ...x, enabled: !x.enabled } : x))} style={styles.secondaryBtn}>{r.enabled ? 'On' : 'Off'}</button>
                    <button onClick={() => { setReminders(prev => prev.filter(x => x.id !== r.id)); setTodos(prev => prev.map(t => t.reminderId === r.id ? { ...t, reminderId: null } : t)); setNodes(prev => prev.map(n => n.reminder && n.reminder.id === r.id ? { ...n, reminder: null } : n)); }} style={styles.dangerBtn}>Delete</button>
                  </div>
                </div>
              ))}
            </div>

            {/* bottom-right collapse button when expanded */}
            <button onClick={() => setRightCollapsed(true)} style={{ ...styles.smallSecondary, position: 'absolute', right: 8, bottom: 12, padding: 8, width: 36, height: 36, zIndex: 2000 }}>›</button>
          </>
        )}
      </div>

      {/* Node editor modal (full-screen overlay via portal) */}
      {editingNodeId && editingNodeDraft ? createPortal(
        <div data-portal-popover="1">
          {/* backdrop blur placed first so it renders beneath the modal wrapper */}
          <div style={{ position: 'fixed', inset: 0, backdropFilter: 'blur(4px)', pointerEvents: 'none', zIndex: 19990 }} />
          <div onClick={() => closeNodeEditor()} style={{ position: 'fixed', inset: 0, zIndex: 20000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: 640, maxWidth: '96%', borderRadius: 12, background: 'rgba(8,10,14,0.85)', padding: 18, boxShadow: '0 20px 60px rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.04)', maxHeight: '90vh', overflow: 'auto', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Edit Node</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={async () => { if (await confirmAsync('Delete node?')) { removeNode(editingNodeId); closeNodeEditor(); } }} style={styles.dangerBtn}>Delete</button>
                <button onClick={() => closeNodeEditor()} style={styles.secondaryBtn}>Cancel</button>
                <button onClick={() => saveNodeEditor()} style={styles.primaryBtn}>Save</button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 20 }}>
                <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, marginBottom: 6 }}>Title</div>
                <input autoFocus value={editingNodeDraft.title} onChange={e => setEditingNodeDraft(d => ({ ...d, title: e.target.value }))} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.02)', color: 'white' }} />
                <div style={{ fontSize: 13, marginTop: 12, marginBottom: 6 }}>Description</div>
                <textarea value={editingNodeDraft.text} onChange={e => setEditingNodeDraft(d => ({ ...d, text: e.target.value }))} style={{ width: '100%', minHeight: 120, maxHeight: '60vh', padding: 10, borderRadius: 8, border: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.02)', color: 'white', resize: 'vertical' }} />

                {/* Type-specific editors: List and Grid items are edited inside the node editor */}
                {editingNodeDraft.type === 'list' ? (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 13, marginBottom: 6 }}>List items</div>
                    {(editingNodeDraft.items || []).map((it, idx) => (
                      <div key={it.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                        <div style={{ width: 28, textAlign: 'center', color: 'rgba(255,255,255,0.8)' }}>{idx + 1}.</div>
                        <input value={it.description} onChange={e => setEditingNodeDraft(d => ({ ...d, items: d.items.map(x => x.id === it.id ? { ...x, description: e.target.value } : x) }))} placeholder="Item description" style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.02)', color: 'white' }} />
                        <button onClick={() => setEditingNodeDraft(d => ({ ...d, items: (d.items || []).filter(x => x.id !== it.id) }))} style={styles.smallDanger}>Del</button>
                      </div>
                    ))}
                    <div style={{ marginTop: 8 }}>
                      <button onClick={() => setEditingNodeDraft(d => ({ ...d, items: [...(d.items || []), { id: uid('li'), description: '' }] }))} style={styles.smallPrimary}>Add list item</button>
                    </div>
                  </div>
                ) : editingNodeDraft.type === 'grid' ? (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 13, marginBottom: 6 }}>Grid</div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ fontSize: 12 }}>Rows</div>
                        <input type="number" min={1} value={editingNodeDraft.rows || 1} onChange={e => {
                          const rows = Math.max(1, Number(e.target.value) || 1);
                          setEditingNodeDraft(d => {
                            const cols = d.cols || 1;
                            const desired = rows * cols;
                            let items = d.gridItems ? [...d.gridItems] : [];
                            while (items.length < desired) items.push({ id: uid('gcell'), description: '' });
                            if (items.length > desired) items = items.slice(0, desired);
                            return { ...d, rows, gridItems: items };
                          });
                        }} style={{ width: 80, padding: 8, borderRadius: 8, border: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.02)', color: 'white' }} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ fontSize: 12 }}>Cols</div>
                        <input type="number" min={1} value={editingNodeDraft.cols || 1} onChange={e => {
                          const cols = Math.max(1, Number(e.target.value) || 1);
                          setEditingNodeDraft(d => {
                            const rows = d.rows || 1;
                            const desired = rows * cols;
                            let items = d.gridItems ? [...d.gridItems] : [];
                            while (items.length < desired) items.push({ id: uid('gcell'), description: '' });
                            if (items.length > desired) items = items.slice(0, desired);
                            return { ...d, cols, gridItems: items };
                          });
                        }} style={{ width: 80, padding: 8, borderRadius: 8, border: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.02)', color: 'white' }} />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${editingNodeDraft.cols || 1}, 1fr)`, gap: 8 }}>
                      {(editingNodeDraft.gridItems || []).map((cell, i) => (
                        <div key={cell.id} style={{ display: 'flex', flexDirection: 'column' }}>
                          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', marginBottom: 4 }}>Cell {i + 1}</div>
                          <input value={cell.description} onChange={e => setEditingNodeDraft(d => ({ ...d, gridItems: d.gridItems.map(g => g.id === cell.id ? { ...g, description: e.target.value } : g) }))} placeholder="Cell description" style={{ padding: 8, borderRadius: 8, border: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.02)', color: 'white' }} />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 13, marginBottom: 6 }}>Reminder</div>
                  {editingNodeDraft.reminder ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input type="datetime-local" value={(editingNodeDraft.reminder.time && new Date(editingNodeDraft.reminder.time).toISOString().slice(0,16)) || ''} onChange={e => { const val = e.target.value; setEditingNodeDraft(d => ({ ...d, reminder: val ? { ...d.reminder, id: d.reminder?.id || uid('rem'), time: new Date(val).toISOString(), enabled: true, fired: false } : null })); }} style={{ padding: 8, borderRadius: 8, border: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.02)', color: 'white' }} />
                      <button onClick={() => setEditingNodeDraft(d => ({ ...d, reminder: null }))} style={styles.smallDanger}>Remove</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => { const iso = new Date(Date.now() + 5*60*1000).toISOString().slice(0,16); setEditingNodeDraft(d => ({ ...d, reminder: { id: uid('rem'), nodeId: d.id, title: d.title, note: d.text, time: new Date(iso).toISOString(), enabled: true, fired: false } })); }} style={styles.smallPrimary}>Set reminder</button>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ width: 180, marginLeft: 8 }}>
                <div style={{ fontSize: 13, marginBottom: 6 }}>Color</div>
                {zMode === 'manual' ? (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 13, marginBottom: 6 }}>Z-Index</div>
                    <input type="number" value={editingNodeDraft._z || 0} onChange={e => setEditingNodeDraft(d => ({ ...d, _z: Number(e.target.value) }))} style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.02)', color: 'white' }} />
                  </div>
                ) : null}
                <div>
                  <button id="editor-color-btn" onClick={(ev) => { ev.stopPropagation(); setOpenColorPicker(openColorPicker === 'editor' ? null : 'editor'); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: 8, borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', cursor: 'pointer' }}>
                    <div style={{ width: 36, height: 26, borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)', background: categoryBackground(editingNodeDraft.category) }} />
                    <div style={{ flex: 1, textAlign: 'left', fontSize: 13 }}>{(editingNodeDraft.category || '').replace(/([A-Z])/g, ' $1').trim()}</div>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ marginLeft: 4 }} xmlns="http://www.w3.org/2000/svg"><path d="M6 9l6 6 6-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                  <PortalPopover anchorId="editor-color-btn" offsetX={-120} zIndex={21000} isOpen={openColorPicker === 'editor'}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {Object.keys(categoryGradients).map(k => (
                        <button key={k} onClick={(ev) => { ev.stopPropagation(); setEditingNodeDraft(d => ({ ...d, category: k })); setOpenColorPicker(null); }} title={k} style={{ width: 36, height: 26, borderRadius: 6, border: editingNodeDraft.category === k ? '2px solid rgba(255,255,255,0.95)' : '1px solid rgba(0,0,0,0.2)', background: categoryBackground(k), cursor: 'pointer', padding: 0 }} />
                      ))}
                    </div>
                  </PortalPopover>
                  </div>

                  {/* Title/Text color pickers */}
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 13, marginBottom: 6 }}>Title color</div>
                    <ColorPicker value={editingNodeDraft.titleColor || '#ffffff'} onChange={v => setEditingNodeDraft(d => ({ ...d, titleColor: v }))} previewStyle={{ width: '100%', height: 36, borderRadius: 8, border: '1px solid rgba(255,255,255,0.04)', padding: 4 }} />

                    <div style={{ fontSize: 13, marginTop: 10, marginBottom: 6 }}>Text color</div>
                    <ColorPicker value={editingNodeDraft.textColor || '#ffffff'} onChange={v => setEditingNodeDraft(d => ({ ...d, textColor: v }))} previewStyle={{ width: '100%', height: 36, borderRadius: 8, border: '1px solid rgba(255,255,255,0.04)', padding: 4 }} />

                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button onClick={() => setEditingNodeDraft(d => ({ ...d, titleColor: null, textColor: null }))} style={styles.smallSecondary}>Clear</button>
                    </div>
                  </div>

                  {/* Inline preview in the editor modal */}
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Preview</div>
                    <div style={{ padding: 10, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.03)', maxHeight: 280, overflow: 'auto' }}>
                      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 6, color: editingNodeDraft.titleColor || 'white' }} dangerouslySetInnerHTML={{ __html: markdownToHtml(editingNodeDraft.title) }} />
                      <div style={{ fontSize: 13, lineHeight: '1.3', color: editingNodeDraft.textColor || 'rgba(255,255,255,0.9)' }} dangerouslySetInnerHTML={{ __html: markdownToHtml(editingNodeDraft.text) }} />
                    </div>
                  </div>
                </div>
            </div>
          </div>
          </div>
        </div>, document.body) : null}
    </div>
  );
}