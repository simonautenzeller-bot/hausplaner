// Klassisches Script, erwartet window.Store (store.js) und window.UI (ui.js), in dieser Reihenfolge geladen.
(function () {
  const store = window.Store;
  const ui = window.UI;

  // ---------- Ansicht / Navigation ----------
  const VIEWS = ['dashboard', 'wishlist', 'fixed', 'assets', 'settings'];

  function switchView(view) {
    if (!VIEWS.includes(view)) view = 'dashboard';
    VIEWS.forEach((v) => {
      document.getElementById(`view-${v}`).hidden = v !== view;
    });
    document.querySelectorAll('.nav-btn').forEach((btn) => {
      const active = btn.dataset.view === view;
      if (active) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
    document.getElementById('main-content').focus?.();
    location.hash = view;
  }

  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
  window.addEventListener('hashchange', () => switchView(location.hash.slice(1)));

  // ---------- Formular-Dialog ----------
  const dialog = document.getElementById('form-dialog');
  const form = document.getElementById('entity-form');
  const fieldsContainer = document.getElementById('form-fields');
  const formTitle = document.getElementById('form-dialog-title');
  const formError = document.getElementById('form-error');
  let currentSubmitHandler = null;

  document.getElementById('btn-cancel-form').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    fieldsContainer.innerHTML = '';
    formError.hidden = true;
    form.reset();
  });

  function openDialog(title, fieldsHtml, onSubmit) {
    formTitle.textContent = title;
    fieldsContainer.innerHTML = fieldsHtml;
    formError.hidden = true;
    currentSubmitHandler = onSubmit;
    dialog.showModal();
    fieldsContainer.querySelector('input,select,textarea')?.focus();
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      currentSubmitHandler?.(new FormData(form));
    } catch (err) {
      formError.textContent = err.message || 'Bitte Eingaben prüfen.';
      formError.hidden = false;
    }
  });

  function categoryOptions(type, selectedId) {
    return store
      .getCategories(type)
      .map((c) => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${c.icon} ${c.name}</option>`)
      .join('');
  }

  // ---------- Wunschliste-Formular ----------
  function openWishlistForm(item) {
    const editing = !!item;
    const html = `
      <div class="field">
        <label for="f-name">Name *</label>
        <input type="text" id="f-name" name="name" required value="${item ? escapeAttr(item.name) : ''}" />
      </div>
      <div class="field">
        <label for="f-category">Kategorie</label>
        <select id="f-category" name="categoryId">${categoryOptions('wishlist', item?.categoryId)}</select>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="f-price">Preis (€)</label>
          <input type="number" id="f-price" name="price" min="0" step="0.01" inputmode="decimal" value="${item?.price ?? ''}" />
        </div>
        <div class="field">
          <label for="f-priority">Priorität</label>
          <select id="f-priority" name="priority">
            <option value="niedrig" ${item?.priority === 'niedrig' ? 'selected' : ''}>Niedrig</option>
            <option value="mittel" ${!item || item.priority === 'mittel' ? 'selected' : ''}>Mittel</option>
            <option value="hoch" ${item?.priority === 'hoch' ? 'selected' : ''}>Hoch</option>
          </select>
        </div>
      </div>
      <div class="field">
        <label for="f-link">Link (optional)</label>
        <input type="url" id="f-link" name="link" placeholder="https://…" value="${item ? escapeAttr(item.link || '') : ''}" />
      </div>
      <div class="field">
        <label for="f-note">Notiz</label>
        <textarea id="f-note" name="note">${item ? escapeHtml(item.note || '') : ''}</textarea>
      </div>
    `;
    openDialog(editing ? 'Eintrag bearbeiten' : 'Neuer Wunschliste-Eintrag', html, (fd) => {
      const name = fd.get('name').trim();
      if (!name) throw new Error('Bitte einen Namen eingeben.');
      const payload = {
        name,
        categoryId: fd.get('categoryId'),
        price: fd.get('price'),
        priority: fd.get('priority'),
        link: fd.get('link'),
        note: fd.get('note'),
      };
      if (editing) store.updateWishlistItem(item.id, {
        ...payload,
        price: payload.price === '' ? null : Number(payload.price),
      });
      else store.addWishlistItem(payload);
      dialog.close();
      ui.renderAll();
      ui.showToast('Gespeichert');
    });
  }

  // ---------- Fixkosten-Formular ----------
  function openFixedForm(item) {
    const editing = !!item;
    const html = `
      <div class="field">
        <label for="f-name">Name *</label>
        <input type="text" id="f-name" name="name" required value="${item ? escapeAttr(item.name) : ''}" />
      </div>
      <div class="field">
        <label for="f-category">Kategorie</label>
        <select id="f-category" name="categoryId">${categoryOptions('fixed', item?.categoryId)}</select>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="f-amount">Betrag (€) *</label>
          <input type="number" id="f-amount" name="amount" min="0" step="0.01" inputmode="decimal" required value="${item?.amount ?? ''}" />
        </div>
        <div class="field">
          <label for="f-cycle">Rhythmus</label>
          <select id="f-cycle" name="cycle">
            <option value="monthly" ${!item || item.cycle === 'monthly' ? 'selected' : ''}>monatlich</option>
            <option value="quarterly" ${item?.cycle === 'quarterly' ? 'selected' : ''}>vierteljährlich</option>
            <option value="yearly" ${item?.cycle === 'yearly' ? 'selected' : ''}>jährlich</option>
          </select>
        </div>
      </div>
      <div class="field">
        <label for="f-note">Notiz</label>
        <textarea id="f-note" name="note">${item ? escapeHtml(item.note || '') : ''}</textarea>
      </div>
      <div class="field field-checkbox">
        <input type="checkbox" id="f-isloan" name="isLoan" ${item?.isLoan ? 'checked' : ''} />
        <label for="f-isloan">Ratenzahlung / Kredit mit Fortschritt verfolgen</label>
      </div>
      <div id="loan-fields" ${item?.isLoan ? '' : 'hidden'}>
        <div class="field-row">
          <div class="field">
            <label for="f-total">Gesamtsumme (€)</label>
            <input type="number" id="f-total" name="totalAmount" min="0" step="0.01" value="${item?.totalAmount ?? ''}" />
          </div>
          <div class="field">
            <label for="f-paid">Bereits bezahlt (€)</label>
            <input type="number" id="f-paid" name="alreadyPaid" min="0" step="0.01" value="${item?.alreadyPaid ?? ''}" />
          </div>
        </div>
        <p class="field-hint">Der monatliche Betrag oben wird als Rate verwendet.</p>
      </div>
    `;
    openDialog(editing ? 'Fixkosten bearbeiten' : 'Neuer Fixkosten-Posten', html, (fd) => {
      const name = fd.get('name').trim();
      const amount = fd.get('amount');
      if (!name) throw new Error('Bitte einen Namen eingeben.');
      if (amount === '' || Number(amount) < 0) throw new Error('Bitte einen gültigen Betrag eingeben.');
      const isLoan = fd.get('isLoan') === 'on';
      const payload = {
        name,
        categoryId: fd.get('categoryId'),
        amount,
        cycle: fd.get('cycle'),
        note: fd.get('note'),
        isLoan,
        totalAmount: fd.get('totalAmount'),
        alreadyPaid: fd.get('alreadyPaid'),
      };
      if (editing) {
        store.updateFixedCost(item.id, {
          ...payload,
          amount: Number(payload.amount) || 0,
          totalAmount: isLoan ? Number(payload.totalAmount) || 0 : null,
          alreadyPaid: isLoan ? Number(payload.alreadyPaid) || 0 : null,
        });
      } else {
        store.addFixedCost(payload);
      }
      dialog.close();
      ui.renderAll();
      ui.showToast('Gespeichert');
    });
    document.getElementById('f-isloan').addEventListener('change', (e) => {
      document.getElementById('loan-fields').hidden = !e.target.checked;
    });
  }

  // ---------- Kategorie-Formular ----------
  function openCategoryForm(type, cat) {
    const editing = !!cat;
    const html = `
      <div class="field">
        <label for="f-cat-name">Name *</label>
        <input type="text" id="f-cat-name" name="name" required value="${cat ? escapeAttr(cat.name) : ''}" />
      </div>
      <div class="field">
        <label for="f-cat-icon">Icon (Emoji)</label>
        <input type="text" id="f-cat-icon" name="icon" maxlength="4" value="${cat ? escapeAttr(cat.icon) : '🏷️'}" />
      </div>
      <div class="field">
        <label for="f-cat-color">Farbe</label>
        <input type="color" id="f-cat-color" name="color" value="${cat ? cat.color : '#607d8b'}" />
      </div>
    `;
    openDialog(editing ? 'Kategorie bearbeiten' : 'Neue Kategorie', html, (fd) => {
      const name = fd.get('name').trim();
      if (!name) throw new Error('Bitte einen Namen eingeben.');
      const payload = { name, icon: fd.get('icon') || '🏷️', color: fd.get('color') };
      if (editing) store.updateCategory(cat.id, payload);
      else store.addCategory({ type, ...payload });
      dialog.close();
      ui.renderAll();
      ui.showToast('Gespeichert');
    });
  }

  // ---------- Event-Bindings ----------
  document.getElementById('btn-add-wishlist').addEventListener('click', () => openWishlistForm(null));
  document.getElementById('btn-add-fixed').addEventListener('click', () => openFixedForm(null));
  document.getElementById('btn-add-cat-wishlist').addEventListener('click', () => openCategoryForm('wishlist', null));
  document.getElementById('btn-add-cat-fixed').addEventListener('click', () => openCategoryForm('fixed', null));

  window.addEventListener('open-wishlist-form', (e) => openWishlistForm(e.detail));
  window.addEventListener('open-fixed-form', (e) => openFixedForm(e.detail));
  window.addEventListener('open-category-form', (e) => openCategoryForm(e.detail.type, e.detail));

  document.getElementById('toggle-show-purchased').addEventListener('change', (e) => {
    store.updateSettings({ showPurchased: e.target.checked });
    ui.renderWishlist();
  });

  // Theme
  document.querySelectorAll('#theme-switcher [role="radio"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      store.updateSettings({ theme: btn.dataset.theme });
      ui.renderTheme();
    });
  });

  // ---------- Demo-Modus ----------
  function setDemoMode(on) {
    store.setMode(on ? 'demo' : 'live');
    ui.renderAll();
    ui.showToast(on ? 'Demo-Modus aktiv – das sind Beispieldaten, deine echten Daten sind sicher' : 'Demo-Modus beendet – deine echten Daten sind wieder da');
  }
  document.getElementById('btn-toggle-demo').addEventListener('click', () => {
    setDemoMode(!store.isDemoMode());
  });
  document.getElementById('btn-exit-demo').addEventListener('click', () => setDemoMode(false));

  // Export
  document.getElementById('btn-export').addEventListener('click', () => {
    const json = store.exportData();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    const prefix = store.isDemoMode() ? 'hausplaner-demo' : 'hausplaner-export';
    a.href = url;
    a.download = `${prefix}-${date}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    ui.showToast('Export gestartet');
  });

  // Import
  const fileInput = document.getElementById('file-import');
  document.getElementById('btn-import').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    const text = await file.text();
    const target = store.isDemoMode() ? 'die Demo-Daten' : 'alle aktuell gespeicherten Daten auf diesem Gerät';
    if (!confirm(`Import überschreibt ${target}. Fortfahren?`)) {
      fileInput.value = '';
      return;
    }
    const res = store.importData(text);
    fileInput.value = '';
    if (!res.ok) {
      ui.showToast('Import fehlgeschlagen: ungültige Datei');
      return;
    }
    ui.renderAll();
    ui.showToast('Import erfolgreich');
  });

  // Reset
  document.getElementById('btn-reset').addEventListener('click', () => {
    const msg = store.isDemoMode()
      ? 'Demo-Daten auf den Ausgangszustand zurücksetzen?'
      : 'Wirklich ALLE Daten unwiderruflich löschen und auf Standardkategorien zurücksetzen?';
    if (!confirm(msg)) return;
    store.resetData();
    ui.renderAll();
    ui.showToast('Zurückgesetzt');
  });

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function escapeAttr(s) {
    return escapeHtml(s);
  }

  // ---------- Init ----------
  const params = new URLSearchParams(location.search);
  if (params.get('demo') === '1' || params.get('demo') === 'true') {
    store.setMode('demo');
  }
  ui.renderVersion();
  ui.renderAll();
  switchView(location.hash.slice(1) || 'dashboard');

  // Lebt die Finanzen-App in einem anderen Tab derselben Origin, hier live mitziehen.
  window.addEventListener('storage', (e) => {
    if (e.key === 'finanzen-app:v3') ui.renderAll();
  });

  if ('serviceWorker' in navigator && (location.protocol === 'http:' || location.protocol === 'https:')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
    });
  }
})();
