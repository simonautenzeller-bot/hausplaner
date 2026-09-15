// Datenschicht: alles liegt lokal im Browser (localStorage). Keine Server-Anbindung.
// Klassisches Script (kein ES-Modul), damit die App auch per Doppelklick (file://) funktioniert.
(function () {
  const LIVE_KEY = 'hausplaner:data';
  const DEMO_KEY = 'hausplaner:demo-data';
  const MODE_KEY = 'hausplaner:mode';
  const FINANZEN_KEY = 'finanzen-app:v3';
  const SCHEMA_VERSION = 1;
  const APP_VERSION = '1.4.0';

  function uid() {
    if (window.crypto?.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function baseCategories() {
    return [
      { id: 'cat-moebel', type: 'wishlist', name: 'Möbel', icon: '🛋️', color: '#8d6e63' },
      { id: 'cat-smarthome', type: 'wishlist', name: 'Smart Home', icon: '💡', color: '#1e88e5' },
      { id: 'cat-pv', type: 'wishlist', name: 'Photovoltaik', icon: '☀️', color: '#f9a825' },
      { id: 'cat-sonstiges-w', type: 'wishlist', name: 'Sonstiges', icon: '📦', color: '#78909c' },
      { id: 'cat-kredit', type: 'fixed', name: 'Kredit', icon: '🏦', color: '#5e35b1' },
      { id: 'cat-versicherung', type: 'fixed', name: 'Versicherung', icon: '🛡️', color: '#00897b' },
      { id: 'cat-strom', type: 'fixed', name: 'Strom', icon: '⚡', color: '#f9a825' },
      { id: 'cat-wasser', type: 'fixed', name: 'Wasser', icon: '💧', color: '#039be5' },
      { id: 'cat-tonnen', type: 'fixed', name: 'Müllgebühren', icon: '🗑️', color: '#6d4c41' },
      { id: 'cat-sonstiges-f', type: 'fixed', name: 'Sonstiges', icon: '📎', color: '#78909c' },
    ];
  }

  function defaultData() {
    return {
      version: SCHEMA_VERSION,
      settings: { theme: 'system', showPurchased: false },
      categories: baseCategories(),
      wishlistItems: [],
      fixedCosts: [],
    };
  }

  function demoData() {
    const now = new Date().toISOString();
    const categories = baseCategories();
    categories.push({ id: 'cat-garten', type: 'wishlist', name: 'Garten', icon: '🌳', color: '#43a047' });

    const w = (categoryId, name, price, priority, note, purchased, link) => ({
      id: uid(), categoryId, name, price, priority, note: note || '', link: link || '',
      purchased: !!purchased, createdAt: now, updatedAt: now,
    });
    const f = (categoryId, name, amount, cycle, note, loan) => ({
      id: uid(), categoryId, name, amount, cycle, note: note || '',
      isLoan: !!loan, totalAmount: loan ? loan.total : null, alreadyPaid: loan ? loan.paid : null,
      createdAt: now, updatedAt: now,
    });

    return {
      version: SCHEMA_VERSION,
      settings: { theme: 'system', showPurchased: false },
      categories,
      wishlistItems: [
        w('cat-moebel', 'Ecksofa, grau', 1200, 'hoch', '3 Modelle vergleichen, Lieferzeit prüfen', false, 'https://example.com/sofa'),
        w('cat-moebel', 'Ausziehbarer Esstisch', 650, 'mittel', '', true),
        w('cat-smarthome', 'Philips Hue Starter-Set', 180, 'niedrig', ''),
        w('cat-smarthome', 'Smarte Türklingel', 220, 'mittel', 'Mit Kamera, DSGVO-konform wählen'),
        w('cat-pv', 'PV-Anlage 8 kWp inkl. Speicher', 18000, 'hoch', 'Angebote von 3 Installateuren einholen'),
        w('cat-sonstiges-w', 'Rasenmähroboter', 850, 'niedrig', ''),
        w('cat-garten', 'Gartenhäuschen', 1500, 'mittel', 'Baugenehmigung prüfen'),
      ],
      fixedCosts: [
        f('cat-kredit', 'Hauskredit', 780, 'monthly', 'Anschlussfinanzierung 2032 einplanen', { total: 220000, paid: 45000 }),
        f('cat-versicherung', 'Wohngebäudeversicherung', 32, 'monthly', 'jährliche Zahlung, hier als Monatswert'),
        f('cat-versicherung', 'Hausratversicherung', 12, 'monthly', ''),
        f('cat-strom', 'Ökostromvertrag', 145, 'monthly', ''),
        f('cat-wasser', 'Wasser / Abwasser', 45, 'monthly', ''),
        f('cat-tonnen', 'Restmüll- und Bio-Tonne', 68, 'quarterly', ''),
        f('cat-sonstiges-f', 'Schornsteinfeger', 60, 'yearly', ''),
      ],
    };
  }

  function getMode() {
    return sessionStorage.getItem(MODE_KEY) === 'demo' ? 'demo' : 'live';
  }
  function currentKey() {
    return getMode() === 'demo' ? DEMO_KEY : LIVE_KEY;
  }
  function seedForMode() {
    return getMode() === 'demo' ? demoData() : defaultData();
  }

  function normalize(parsed) {
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.categories)) return seedForMode();
    return {
      version: SCHEMA_VERSION,
      settings: { theme: 'system', showPurchased: false, ...(parsed.settings || {}) },
      categories: parsed.categories,
      wishlistItems: Array.isArray(parsed.wishlistItems) ? parsed.wishlistItems : [],
      fixedCosts: Array.isArray(parsed.fixedCosts) ? parsed.fixedCosts : [],
    };
  }

  function load() {
    const key = currentKey();
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        const seeded = seedForMode();
        localStorage.setItem(key, JSON.stringify(seeded));
        return seeded;
      }
      return normalize(JSON.parse(raw));
    } catch {
      return seedForMode();
    }
  }

  let data = load();

  function persist() {
    localStorage.setItem(currentKey(), JSON.stringify(data));
  }

  const listeners = new Set();
  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
  function notify() {
    persist();
    listeners.forEach((fn) => fn(data));
  }

  function getData() {
    return data;
  }
  function getSettings() {
    return data.settings;
  }
  function updateSettings(patch) {
    data.settings = { ...data.settings, ...patch };
    notify();
  }

  // ---- Demo-Modus ----
  function isDemoMode() {
    return getMode() === 'demo';
  }
  function setMode(mode) {
    const next = mode === 'demo' ? 'demo' : 'live';
    if (next === getMode()) return;
    sessionStorage.setItem(MODE_KEY, next);
    data = load();
    notify();
  }

  // ---- Kategorien ----
  function getCategories(type) {
    return data.categories.filter((c) => c.type === type);
  }
  function addCategory({ type, name, icon, color }) {
    const cat = { id: uid(), type, name: name.trim(), icon: icon || '🏷️', color: color || '#607d8b' };
    data.categories.push(cat);
    notify();
    return cat;
  }
  function updateCategory(id, patch) {
    const cat = data.categories.find((c) => c.id === id);
    if (!cat) return;
    Object.assign(cat, patch);
    notify();
  }
  function deleteCategory(id) {
    const cat = data.categories.find((c) => c.id === id);
    if (!cat) return { ok: false, reason: 'not-found' };
    const siblings = data.categories.filter((c) => c.type === cat.type && c.id !== id);
    if (siblings.length === 0) {
      return { ok: false, reason: 'last-category' };
    }
    const fallback = siblings.find((c) => c.name === 'Sonstiges') || siblings[0];
    if (cat.type === 'wishlist') {
      data.wishlistItems.forEach((it) => {
        if (it.categoryId === id) it.categoryId = fallback.id;
      });
    } else {
      data.fixedCosts.forEach((it) => {
        if (it.categoryId === id) it.categoryId = fallback.id;
      });
    }
    data.categories = data.categories.filter((c) => c.id !== id);
    notify();
    return { ok: true };
  }

  // ---- Wunschliste ----
  function getWishlistItems() {
    return data.wishlistItems;
  }
  function addWishlistItem(item) {
    const now = new Date().toISOString();
    const row = {
      id: uid(),
      categoryId: item.categoryId,
      name: item.name.trim(),
      price: item.price === '' || item.price == null ? null : Number(item.price),
      priority: item.priority || 'mittel',
      note: (item.note || '').trim(),
      link: (item.link || '').trim(),
      purchased: !!item.purchased,
      createdAt: now,
      updatedAt: now,
    };
    data.wishlistItems.push(row);
    notify();
    return row;
  }
  function updateWishlistItem(id, patch) {
    const row = data.wishlistItems.find((i) => i.id === id);
    if (!row) return;
    Object.assign(row, patch, { updatedAt: new Date().toISOString() });
    notify();
  }
  function deleteWishlistItem(id) {
    data.wishlistItems = data.wishlistItems.filter((i) => i.id !== id);
    notify();
  }

  // ---- Fixkosten ----
  function getFixedCosts() {
    return data.fixedCosts;
  }
  function addFixedCost(item) {
    const now = new Date().toISOString();
    const row = {
      id: uid(),
      categoryId: item.categoryId,
      name: item.name.trim(),
      amount: Number(item.amount) || 0,
      cycle: item.cycle || 'monthly',
      note: (item.note || '').trim(),
      isLoan: !!item.isLoan,
      totalAmount: item.isLoan ? Number(item.totalAmount) || 0 : null,
      alreadyPaid: item.isLoan ? Number(item.alreadyPaid) || 0 : null,
      createdAt: now,
      updatedAt: now,
    };
    data.fixedCosts.push(row);
    notify();
    return row;
  }
  function updateFixedCost(id, patch) {
    const row = data.fixedCosts.find((i) => i.id === id);
    if (!row) return;
    Object.assign(row, patch, { updatedAt: new Date().toISOString() });
    notify();
  }
  function deleteFixedCost(id) {
    data.fixedCosts = data.fixedCosts.filter((i) => i.id !== id);
    notify();
  }

  function toMonthly(amount, cycle) {
    if (cycle === 'yearly') return amount / 12;
    if (cycle === 'quarterly') return amount / 3;
    return amount;
  }

  // ---- Vermögen (schreibgeschützter Import aus der Finanzen-App) ----
  // Liest ausschließlich; Hausplaner+ legt nie eigene Vermögenswerte an, um
  // Doppelpflege zu vermeiden. Funktioniert nur, wenn beide Apps unter derselben
  // Origin laufen (z. B. beide auf github.io desselben Accounts).
  function getExternalAssets() {
    try {
      const raw = localStorage.getItem(FINANZEN_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.assets)) return null;
      return parsed.assets;
    } catch {
      return null;
    }
  }

  // ---- Export / Import / Reset ----
  function exportData() {
    return JSON.stringify(data, null, 2);
  }
  function importData(json) {
    let parsed;
    try {
      parsed = JSON.parse(json);
    } catch {
      return { ok: false, reason: 'invalid-json' };
    }
    if (!parsed || !Array.isArray(parsed.categories) || !Array.isArray(parsed.wishlistItems) || !Array.isArray(parsed.fixedCosts)) {
      return { ok: false, reason: 'invalid-shape' };
    }
    data = normalize(parsed);
    notify();
    return { ok: true };
  }
  function resetData() {
    data = seedForMode();
    notify();
  }

  window.Store = {
    APP_VERSION,
    isDemoMode,
    setMode,
    getData,
    getSettings,
    updateSettings,
    getCategories,
    addCategory,
    updateCategory,
    deleteCategory,
    getWishlistItems,
    addWishlistItem,
    updateWishlistItem,
    deleteWishlistItem,
    getFixedCosts,
    addFixedCost,
    updateFixedCost,
    deleteFixedCost,
    toMonthly,
    exportData,
    importData,
    resetData,
    onChange,
    getExternalAssets,
  };
})();
