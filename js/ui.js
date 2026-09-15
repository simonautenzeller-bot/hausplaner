// Rendering-Schicht. Klassisches Script, erwartet window.Store (aus store.js).
(function () {
  const store = window.Store;

  const currency = (n) =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n || 0);

  function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function catById(id) {
    return store.getData().categories.find((c) => c.id === id);
  }

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'text') node.textContent = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) node.setAttribute(k, v);
    }
    for (const c of [].concat(children)) if (c) node.appendChild(c);
    return node;
  }

  // ---------- Dashboard ----------
  function renderDashboard() {
    const items = store.getWishlistItems().filter((i) => !i.purchased);
    const wishTotal = items.reduce((s, i) => s + (i.price || 0), 0);
    document.getElementById('stat-wishlist-total').textContent = currency(wishTotal);
    document.getElementById('stat-wishlist-count').textContent = `${items.length} Einträge offen`;

    // Kredite laufen als eigene Zeitleiste, getrennt von den regulären Fixkosten-Summen.
    const allFixed = store.getFixedCosts();
    const fixed = allFixed.filter((f) => !f.isLoan);
    const monthlyTotal = fixed.reduce((s, f) => s + store.toMonthly(f.amount, f.cycle), 0);
    document.getElementById('stat-fixed-monthly').textContent = currency(monthlyTotal);
    document.getElementById('stat-fixed-count').textContent = `${fixed.length} Posten`;
    document.getElementById('stat-fixed-yearly').textContent = currency(monthlyTotal * 12);

    renderLoans(allFixed.filter((f) => f.isLoan));

    const externalAssets = store.getExternalAssets();
    const assetsTotalEl = document.getElementById('stat-assets-total');
    const assetsSubEl = document.getElementById('stat-assets-sub');
    if (externalAssets === null) {
      assetsTotalEl.textContent = '–';
      assetsSubEl.textContent = 'Finanzen-App nicht verbunden';
    } else {
      const sum = externalAssets.reduce((s, a) => s + (Number(a.value) || 0), 0);
      assetsTotalEl.textContent = currency(sum);
      assetsSubEl.textContent = `${externalAssets.length} Position${externalAssets.length === 1 ? '' : 'en'} · Finanzen-App`;
    }

    const fixedByCat = document.getElementById('dashboard-fixed-breakdown');
    fixedByCat.innerHTML = '';
    const fixedCats = store.getCategories('fixed');
    const fixedRows = fixedCats
      .map((cat) => ({
        cat,
        sum: fixed.filter((f) => f.categoryId === cat.id).reduce((s, f) => s + store.toMonthly(f.amount, f.cycle), 0),
      }))
      .filter((r) => r.sum > 0);
    if (fixedRows.length === 0) {
      fixedByCat.appendChild(el('li', { class: 'empty', text: 'Noch keine Fixkosten erfasst.' }));
    } else {
      fixedRows.forEach((r) => {
        fixedByCat.appendChild(
          el('li', {}, [
            el('span', { text: `${r.cat.icon} ${r.cat.name}` }),
            el('span', { text: currency(r.sum) + ' / Monat' }),
          ])
        );
      });
    }

    const wishByCat = document.getElementById('dashboard-wishlist-breakdown');
    wishByCat.innerHTML = '';
    const wishCats = store.getCategories('wishlist');
    const wishRows = wishCats
      .map((cat) => ({
        cat,
        count: items.filter((i) => i.categoryId === cat.id).length,
        sum: items.filter((i) => i.categoryId === cat.id).reduce((s, i) => s + (i.price || 0), 0),
      }))
      .filter((r) => r.count > 0);
    if (wishRows.length === 0) {
      wishByCat.appendChild(el('li', { class: 'empty', text: 'Noch nichts auf der Wunschliste.' }));
    } else {
      wishRows.forEach((r) => {
        wishByCat.appendChild(
          el('li', {}, [
            el('span', { text: `${r.cat.icon} ${r.cat.name} (${r.count})` }),
            el('span', { text: currency(r.sum) }),
          ])
        );
      });
    }
  }

  function renderLoans(loans) {
    const wrap = document.getElementById('dashboard-loans-wrap');
    const list = document.getElementById('dashboard-loans');
    if (!wrap || !list) return;
    const active = loans.filter((l) => l.totalAmount > 0);
    list.innerHTML = '';
    wrap.hidden = active.length === 0;

    active.forEach((loan) => {
      const cat = catById(loan.categoryId);
      const remaining = Math.max(loan.totalAmount - loan.alreadyPaid, 0);
      const pct = Math.min(100, Math.round((loan.alreadyPaid / loan.totalAmount) * 100));
      const monthly = store.toMonthly(loan.amount, loan.cycle);

      let etaLabel = 'abbezahlt';
      if (remaining > 0) {
        etaLabel = 'unbekannt';
        if (monthly > 0) {
          const monthsLeft = Math.ceil(remaining / monthly);
          const eta = new Date();
          eta.setMonth(eta.getMonth() + monthsLeft);
          etaLabel = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(eta);
        }
      }

      list.appendChild(
        el('li', { class: 'loan-card' }, [
          el('div', { class: 'loan-top' }, [
            el('span', { text: `${cat ? cat.icon + ' ' : ''}${loan.name}` }),
            el('span', { text: `${pct}%` }),
          ]),
          el('div', { class: 'loan-amounts', text: `${currency(remaining)} Restschuld von ${currency(loan.totalAmount)} · ${currency(monthly)}/Monat` }),
          el('div', { class: 'loan-track', role: 'progressbar', 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': `${loan.name} zu ${pct}% abbezahlt` }, [
            el('div', { class: 'loan-fill', style: `width:${pct}%` }),
          ]),
          el('div', { class: 'loan-timeline' }, [
            el('span', { text: 'Start' }),
            el('span', { text: `Heute · ${pct}%` }),
            el('span', { text: remaining > 0 ? `Ziel: ${etaLabel}` : 'Abbezahlt 🎉' }),
          ]),
        ])
      );
    });
  }

  // ---------- Wunschliste ----------
  let wishlistFilter = 'all';

  function renderWishlistFilters() {
    const row = document.getElementById('wishlist-filter-chips');
    row.innerHTML = '';
    const cats = store.getCategories('wishlist');
    const makeChip = (id, label) => {
      const pressed = wishlistFilter === id;
      return el('button', {
        class: 'chip',
        type: 'button',
        'aria-pressed': String(pressed),
        text: label,
        onclick: () => {
          wishlistFilter = id;
          renderWishlistFilters();
          renderWishlist();
        },
      });
    };
    row.appendChild(makeChip('all', 'Alle'));
    cats.forEach((c) => row.appendChild(makeChip(c.id, `${c.icon} ${c.name}`)));
  }

  function renderWishlist() {
    const list = document.getElementById('wishlist-list');
    const empty = document.getElementById('wishlist-empty');
    const showPurchased = store.getSettings().showPurchased;
    document.getElementById('toggle-show-purchased').checked = showPurchased;

    let items = store.getWishlistItems();
    if (wishlistFilter !== 'all') items = items.filter((i) => i.categoryId === wishlistFilter);
    if (!showPurchased) items = items.filter((i) => !i.purchased);
    items = [...items].sort((a, b) => (a.purchased === b.purchased ? 0 : a.purchased ? 1 : -1));

    list.innerHTML = '';
    empty.hidden = items.length !== 0;

    items.forEach((item) => {
      const cat = catById(item.categoryId);
      const prioBadge =
        item.priority === 'hoch'
          ? el('span', { class: 'badge badge-prio-hoch', text: 'hoch' })
          : item.priority === 'niedrig'
          ? el('span', { class: 'badge', text: 'niedrig' })
          : null;

      const titleSpan = el('span', {
        class: 'item-title',
        html: item.purchased ? `<span class="purchased-strike">${escapeHtml(item.name)}</span>` : escapeHtml(item.name),
      });

      const card = el('li', { class: 'item-card' + (item.purchased ? ' purchased' : '') }, [
        el('div', { class: 'item-top' }, [
          el('label', { class: 'checkbox-row', style: 'margin:0;min-height:auto;' }, [
            el('input', {
              type: 'checkbox',
              checked: item.purchased || false,
              'aria-label': `${item.name} als gekauft markieren`,
              onchange: (e) => {
                store.updateWishlistItem(item.id, { purchased: e.target.checked });
                renderAll();
                showToast(e.target.checked ? 'Als gekauft markiert' : 'Als offen markiert');
              },
            }),
            titleSpan,
          ]),
          el('div', { class: 'item-actions' }, [
            el('button', {
              class: 'btn-icon',
              type: 'button',
              'aria-label': `${item.name} bearbeiten`,
              html: iconEdit(),
              onclick: () => window.dispatchEvent(new CustomEvent('open-wishlist-form', { detail: item })),
            }),
            el('button', {
              class: 'btn-icon',
              type: 'button',
              'aria-label': `${item.name} löschen`,
              html: iconTrash(),
              onclick: () => {
                if (confirm(`„${item.name}“ wirklich löschen?`)) {
                  store.deleteWishlistItem(item.id);
                  renderAll();
                  showToast('Eintrag gelöscht');
                }
              },
            }),
          ]),
        ]),
        el('div', { class: 'item-meta' }, [
          document.createTextNode(
            `${cat ? cat.icon + ' ' + cat.name : ''}${item.price != null ? ' · ' + currency(item.price) : ''}`
          ),
          prioBadge,
        ]),
        item.note ? el('div', { class: 'item-note', text: item.note }) : null,
        item.link ? el('div', { class: 'item-note' }, [el('a', { href: item.link, target: '_blank', rel: 'noopener noreferrer', title: item.link, text: item.link })]) : null,
      ]);
      list.appendChild(card);
    });
  }

  // ---------- Fixkosten ----------
  let fixedFilter = 'all';

  function renderFixedFilters() {
    const row = document.getElementById('fixed-filter-chips');
    row.innerHTML = '';
    const cats = store.getCategories('fixed');
    const makeChip = (id, label) => {
      const pressed = fixedFilter === id;
      return el('button', {
        class: 'chip',
        type: 'button',
        'aria-pressed': String(pressed),
        text: label,
        onclick: () => {
          fixedFilter = id;
          renderFixedFilters();
          renderFixed();
        },
      });
    };
    row.appendChild(makeChip('all', 'Alle'));
    cats.forEach((c) => row.appendChild(makeChip(c.id, `${c.icon} ${c.name}`)));
  }

  const CYCLE_LABEL = { monthly: 'monatlich', quarterly: 'vierteljährlich', yearly: 'jährlich' };

  function renderFixed() {
    const list = document.getElementById('fixed-list');
    const empty = document.getElementById('fixed-empty');
    let items = store.getFixedCosts();
    if (fixedFilter !== 'all') items = items.filter((i) => i.categoryId === fixedFilter);

    list.innerHTML = '';
    empty.hidden = items.length !== 0;

    items.forEach((item) => {
      const cat = catById(item.categoryId);
      const monthly = store.toMonthly(item.amount, item.cycle);

      let loanBlock = null;
      if (item.isLoan && item.totalAmount > 0) {
        const remaining = Math.max(item.totalAmount - item.alreadyPaid, 0);
        const pct = Math.min(100, Math.round((item.alreadyPaid / item.totalAmount) * 100));
        loanBlock = el('div', {}, [
          el('div', { class: 'item-note', text: `Restschuld: ${currency(remaining)} von ${currency(item.totalAmount)} (${pct}% bezahlt)` }),
          el('div', { class: 'progress-track', role: 'progressbar', 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': `Kredit ${item.name} zu ${pct}% abbezahlt` }, [
            el('div', { class: 'progress-fill', style: `width:${pct}%` }),
          ]),
        ]);
      }

      const card = el('li', { class: 'item-card' }, [
        el('div', { class: 'item-top' }, [
          el('span', { class: 'item-title', text: item.name }),
          el('div', { class: 'item-actions' }, [
            el('button', {
              class: 'btn-icon',
              type: 'button',
              'aria-label': `${item.name} bearbeiten`,
              html: iconEdit(),
              onclick: () => window.dispatchEvent(new CustomEvent('open-fixed-form', { detail: item })),
            }),
            el('button', {
              class: 'btn-icon',
              type: 'button',
              'aria-label': `${item.name} löschen`,
              html: iconTrash(),
              onclick: () => {
                if (confirm(`„${item.name}“ wirklich löschen?`)) {
                  store.deleteFixedCost(item.id);
                  renderAll();
                  showToast('Posten gelöscht');
                }
              },
            }),
          ]),
        ]),
        el('div', { class: 'item-meta', text: `${cat ? cat.icon + ' ' + cat.name : ''} · ${currency(item.amount)} ${CYCLE_LABEL[item.cycle]} (≈ ${currency(monthly)}/Monat)` }),
        item.note ? el('div', { class: 'item-note', text: item.note }) : null,
        loanBlock,
      ]);
      list.appendChild(card);
    });
  }

  // ---------- Vermögen (read-only aus Finanzen-App) ----------
  const OWNER_LABEL = { ich: 'Ich', partner: 'Partner' };

  function formatDateDE(s) {
    if (!s) return '';
    const [y, m, d] = s.split('-');
    return d && m && y ? `${d}.${m}.${y}` : s;
  }

  function renderAssetsView() {
    const list = document.getElementById('assets-list');
    const empty = document.getElementById('assets-empty');
    const totalCard = document.getElementById('assets-total-card');
    const totalValue = document.getElementById('assets-total-value');
    const assets = store.getExternalAssets();

    list.innerHTML = '';

    if (assets === null) {
      totalCard.hidden = true;
      empty.hidden = false;
      empty.textContent = 'Keine Finanzen-App-Daten auf diesem Gerät gefunden. Öffne einmal die Finanzen-App im selben Browser (gleiche Domain) – die Werte erscheinen dann automatisch hier.';
      return;
    }
    if (assets.length === 0) {
      totalCard.hidden = true;
      empty.hidden = false;
      empty.textContent = 'In der Finanzen-App sind noch keine Vermögenswerte eingetragen.';
      return;
    }

    empty.hidden = true;
    totalCard.hidden = false;
    const sum = assets.reduce((s, a) => s + (Number(a.value) || 0), 0);
    totalValue.textContent = currency(sum);

    assets.forEach((a) => {
      list.appendChild(
        el('li', { class: 'item-card' }, [
          el('div', { class: 'item-top' }, [
            el('span', { class: 'item-title', text: a.name || 'Ohne Namen' }),
            el('span', { class: 'item-title', text: currency(a.value) }),
          ]),
          el('div', { class: 'item-meta', text: `${OWNER_LABEL[a.owner] || a.owner || ''}${a.date ? ' · Stand ' + formatDateDE(a.date) : ''}` }),
        ])
      );
    });
  }

  // ---------- Settings: Kategorien ----------
  function renderCategoryLists() {
    renderCategoryList('wishlist', 'category-list-wishlist');
    renderCategoryList('fixed', 'category-list-fixed');
  }

  function renderCategoryList(type, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    store.getCategories(type).forEach((cat) => {
      container.appendChild(
        el('li', {}, [
          el('span', { class: 'cat-label', text: `${cat.icon} ${cat.name}` }),
          el('div', { class: 'item-actions' }, [
            el('button', {
              class: 'btn-icon',
              type: 'button',
              'aria-label': `Kategorie ${cat.name} bearbeiten`,
              html: iconEdit(),
              onclick: () => window.dispatchEvent(new CustomEvent('open-category-form', { detail: cat })),
            }),
            el('button', {
              class: 'btn-icon',
              type: 'button',
              'aria-label': `Kategorie ${cat.name} löschen`,
              html: iconTrash(),
              onclick: () => {
                if (!confirm(`Kategorie „${cat.name}“ löschen? Vorhandene Einträge werden der Kategorie „Sonstiges“ zugeordnet.`)) return;
                const res = store.deleteCategory(cat.id);
                if (!res.ok) {
                  showToast('Das darf nicht gelöscht werden: letzte verbleibende Kategorie.');
                  return;
                }
                renderAll();
                showToast('Kategorie gelöscht');
              },
            }),
          ]),
        ])
      );
    });
  }

  function renderTheme() {
    const theme = store.getSettings().theme;
    document.documentElement.dataset.theme = theme === 'system' ? '' : theme;
    document.querySelectorAll('#theme-switcher [role="radio"]').forEach((btn) => {
      btn.setAttribute('aria-checked', String(btn.dataset.theme === theme));
    });
  }

  function renderVersion() {
    document.getElementById('app-version').textContent = store.APP_VERSION;
  }

  function renderDemoState() {
    const demo = store.isDemoMode();
    const banner = document.getElementById('demo-banner');
    if (banner) banner.hidden = !demo;
    const toggleBtn = document.getElementById('btn-toggle-demo');
    if (toggleBtn) toggleBtn.textContent = demo ? 'Demo-Modus beenden' : 'Demo-Modus starten';
  }

  function renderAll() {
    renderDashboard();
    renderWishlistFilters();
    renderWishlist();
    renderFixedFilters();
    renderFixed();
    renderAssetsView();
    renderCategoryLists();
    renderTheme();
    renderDemoState();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function iconEdit() {
    return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 20h4l10.5-10.5a2 2 0 0 0-4-4L4 16v4z"/></svg>';
  }
  function iconTrash() {
    return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 7h14M9 7V5h6v2m-8 0 1 13h8l1-13"/></svg>';
  }

  window.UI = {
    currency,
    showToast,
    renderDashboard,
    renderWishlistFilters,
    renderWishlist,
    renderFixedFilters,
    renderFixed,
    renderCategoryLists,
    renderTheme,
    renderVersion,
    renderDemoState,
    renderAll,
  };
})();
