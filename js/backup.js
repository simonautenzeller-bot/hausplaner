// Wochen-Backup für lokale Web-Apps (Ordner / OneDrive / Teilen). Eine Kopie pro Repo, Doku im README von alltagplus.
(function () {
  "use strict";

  // Optional: Client-ID der Microsoft-App-Registrierung fest eintragen, dann entfällt das Einfügen in jeder App.
  var ONEDRIVE_CLIENT_ID = "";

  var INTERVAL_DAYS = 7;
  var KEEP = 12;
  var SHARED_KEY = "AppBackup.shared";
  var OD_AUTH_URL = "https://login.microsoftonline.com/consumers/oauth2/v2.0/";
  var OD_GRAPH_URL = "https://graph.microsoft.com/v1.0/me/drive/";
  var OD_SCOPE = "openid email Files.ReadWrite.AppFolder";
  var GUID_RE = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

  var CSS =
    ".ab-panel [hidden],.ab-banner[hidden],.ab-dialog [hidden]{display:none!important}" +
    ".ab-panel p{margin:0 0 10px}" +
    ".ab-help,.ab-status{font-size:.92em;color:var(--ab-muted,inherit)}" +
    ".ab-adv{margin:16px 0 4px}.ab-adv summary{cursor:pointer;font-weight:700;margin:0 0 10px}" +
    ".ab-actions{display:flex;flex-direction:column;gap:8px;margin:0 0 4px}" +
    ".ab-btn{font:inherit;cursor:pointer;padding:10px 14px;border-radius:var(--ab-radius,8px);border:1px solid var(--ab-border,#888);background:transparent;color:inherit}" +
    ".ab-btn--primary{background:var(--ab-accent,#2e7d32);color:var(--ab-accent-text,#fff);border-color:transparent}" +
    ".ab-input{font:inherit;width:100%;box-sizing:border-box;padding:10px 12px;margin:0 0 10px;border-radius:var(--ab-radius,8px);border:1px solid var(--ab-border,#888);background:var(--ab-input,transparent);color:inherit}" +
    ".ab-banner{background:var(--ab-card,#fff);color:var(--ab-text,#222);border:2px solid var(--ab-warn,#c28a00);border-radius:var(--ab-radius,10px);padding:12px 14px;margin:0 0 16px;font-size:14px;line-height:1.4}" +
    ".ab-banner--float{position:fixed;left:12px;right:12px;top:calc(env(safe-area-inset-top,0px) + 10px);max-width:560px;margin:0 auto;z-index:25;box-shadow:0 8px 24px rgba(0,0,0,.35)}" +
    ".ab-banner p{margin:0 0 10px}" +
    ".ab-banner-actions{display:flex;flex-wrap:wrap;gap:8px}" +
    ".ab-banner-actions .ab-btn,.ab-banner-actions button{width:auto;margin:0}" +
    ".ab-toast{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 84px);transform:translateX(-50%);max-width:calc(100vw - 32px);background:#222;color:#fff;padding:10px 16px;border-radius:8px;font:14px/1.3 system-ui,sans-serif;z-index:100000;opacity:0;pointer-events:none;transition:opacity .2s}" +
    ".ab-toast.ab-show{opacity:1}" +
    ".ab-dialog{border:0;border-radius:var(--ab-radius,12px);padding:20px;max-width:min(92vw,420px);background:var(--ab-card,#fff);color:var(--ab-text,#222)}" +
    ".ab-dialog::backdrop{background:rgba(0,0,0,.5)}" +
    ".ab-dialog p{margin:0 0 16px}" +
    ".ab-dialog-actions{display:flex;gap:8px;justify-content:flex-end}";

  var opts = null;
  var fileRe = null;
  var folderHandle = null;
  var fresh = false;
  var busy = false;
  var ready = false;
  var checking = false;
  var pending = false;
  var deferred = false;
  var lastManual = null;
  var panels = [];
  var banner = null;
  var toastEl = null;
  var toastTimer = null;
  var confirmEl = null;
  var fileInput = null;
  var canPickFolder = typeof window.showDirectoryPicker === "function" && !!window.indexedDB;

  function pad(n) { return n < 10 ? "0" + n : String(n); }
  function dateStamp(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function formatDate(iso) {
    var d = new Date(iso);
    return isNaN(d) ? "" : pad(d.getDate()) + "." + pad(d.getMonth() + 1) + "." + String(d.getFullYear()).slice(2);
  }
  function daysText(n) { return n === 1 ? "1 Tag" : n + " Tagen"; }
  function key(name) { return "AppBackup." + opts.appId + "." + name; }
  function readJson(k) { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch (e) { return {}; } }
  function writeJson(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* egal */ } }
  function shared() { return readJson(SHARED_KEY); }
  function odState() { return readJson(key("od")); }
  function clientId() { return ONEDRIVE_CLIENT_ID || shared().clientId || ""; }
  function odConnected() { return !!odState().connected && GUID_RE.test(clientId()); }
  function redirectUri() { return new URL("./", location.href).href; }
  function goTo(url) { location.assign(url); }
  function snapshot() {
    var data = opts.getData();
    if (data == null) return null;
    return typeof data === "string" ? data : JSON.stringify(data, null, 2);
  }
  function isActive() { return opts.getData() != null; }
  function isDue() {
    var meta = readJson(key("meta"));
    if (!meta.lastAt) return true;
    return Date.now() - new Date(meta.lastAt).getTime() >= INTERVAL_DAYS * 86400000;
  }

  function toast(msg) {
    if (opts.toast) { opts.toast(msg); return; }
    toastEl.textContent = msg;
    toastEl.classList.add("ab-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("ab-show"); }, 2600);
  }

  function confirmDialog(message, okLabel, infoOnly) {
    if (typeof confirmEl.showModal !== "function") return Promise.resolve(infoOnly ? window.alert(message) : window.confirm(message));
    return new Promise(function (resolve) {
      var ok = confirmEl.querySelector("[data-ab-ok]");
      var cancel = confirmEl.querySelector("[data-ab-cancel]");
      confirmEl.querySelector("[data-ab-msg]").textContent = message;
      ok.textContent = okLabel || "OK";
      cancel.hidden = !!infoOnly;
      var done = false;
      function finish(result) {
        if (done) return;
        done = true;
        ok.onclick = cancel.onclick = null;
        confirmEl.removeEventListener("close", onClose);
        if (confirmEl.open) confirmEl.close();
        resolve(result);
      }
      function onClose() { finish(false); }
      ok.onclick = function () { finish(true); };
      cancel.onclick = function () { finish(false); };
      confirmEl.addEventListener("close", onClose);
      confirmEl.showModal();
    });
  }

  // Der Ordner-Handle lässt sich nicht in localStorage ablegen, nur in IndexedDB.
  function idbRun(mode, fn) {
    return new Promise(function (resolve, reject) {
      var open = indexedDB.open("AppBackup." + opts.appId, 1);
      open.onupgradeneeded = function () { open.result.createObjectStore("kv"); };
      open.onerror = function () { reject(open.error); };
      open.onsuccess = function () {
        var db = open.result;
        var tx = db.transaction("kv", mode);
        var req = fn(tx.objectStore("kv"));
        tx.oncomplete = function () { db.close(); resolve(req.result); };
        tx.onerror = tx.onabort = function () { db.close(); reject(tx.error); };
      };
    });
  }

  function loadFolderHandle() {
    if (!canPickFolder) return Promise.resolve(null);
    return idbRun("readonly", function (s) { return s.get("dir"); }).then(function (h) { return h || null; }, function () { return null; });
  }

  async function folderGranted(handle, ask) {
    var o = { mode: "readwrite" };
    if ((await handle.queryPermission(o)) === "granted") return true;
    return ask && (await handle.requestPermission(o)) === "granted";
  }

  async function writeToFolder(dir, json, stamp) {
    var fileHandle = await dir.getFileHandle(opts.filePrefix + "-auto-" + stamp + ".json", { create: true });
    var writable = await fileHandle.createWritable();
    await writable.write(json);
    await writable.close();

    // Nur eigene Auto-Dateien aufräumen; manuell exportierte Backups bleiben unangetastet.
    try {
      var names = [];
      for await (var entry of dir.entries()) {
        if (entry[1].kind === "file" && fileRe.test(entry[0])) names.push(entry[0]);
      }
      names.sort();
      while (names.length > KEEP) await dir.removeEntry(names.shift());
    } catch (e) { /* Aufräumen ist optional */ }
  }

  function downloadJson(json, filename) {
    var blob = new Blob([json], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // Chrome erlaubt für Web Share keine .json-Dateien, daher zusätzlich eine .txt-Variante.
  async function shareOrDownload(json, stamp) {
    var base = opts.filePrefix + "-backup-" + stamp;
    if (!canPickFolder && navigator.share && navigator.canShare) {
      var shareable = [
        new File([json], base + ".json", { type: "application/json" }),
        new File([json], base + ".txt", { type: "text/plain" })
      ].find(function (f) { return navigator.canShare({ files: [f] }); });

      if (shareable) {
        try {
          await navigator.share({ files: [shareable], title: opts.appName + " Backup" });
          return { via: "Teilen", file: shareable.name };
        } catch (e) {
          if (e && e.name === "AbortError") return null;
        }
      }
    }
    downloadJson(json, base + ".json");
    return { via: "Download", file: base + ".json" };
  }

  // ---------- OneDrive (Microsoft Graph, Authorization-Code-Flow mit PKCE, ohne Server) ----------

  function b64url(bytes) {
    var s = "";
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  async function odLogin(silent) {
    var verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
    var challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
    var state = b64url(crypto.getRandomValues(new Uint8Array(16)));
    // localStorage statt sessionStorage: Beim Rückweg kann ein anderer Browser-Kontext (z. B. die installierte App) öffnen.
    writeJson(key("auth"), { verifier: verifier, state: state, silent: !!silent });

    var q = new URLSearchParams({
      client_id: clientId(),
      response_type: "code",
      redirect_uri: redirectUri(),
      response_mode: "query",
      scope: OD_SCOPE,
      state: state,
      code_challenge: challenge,
      code_challenge_method: "S256"
    });
    if (silent) q.set("prompt", "none");
    if (shared().hint) q.set("login_hint", shared().hint);
    goTo(OD_AUTH_URL + "authorize?" + q.toString());
  }

  async function odUpload(token, json, stamp) {
    var headers = { Authorization: "Bearer " + token };
    var res = await fetch(OD_GRAPH_URL + "special/approot:/" + opts.filePrefix + "-auto-" + stamp + ".json:/content", {
      method: "PUT",
      headers: { Authorization: headers.Authorization, "Content-Type": "application/json" },
      body: json
    });
    if (!res.ok) throw new Error("upload " + res.status);

    try {
      var list = await (await fetch(OD_GRAPH_URL + "special/approot/children?$select=id,name&$top=200", { headers: headers })).json();
      var old = (list.value || []).filter(function (f) { return fileRe.test(f.name); })
        .sort(function (a, b) { return a.name < b.name ? -1 : 1; });
      while (old.length > KEEP) {
        await fetch(OD_GRAPH_URL + "items/" + old.shift().id, { method: "DELETE", headers: headers });
      }
    } catch (e) { /* Aufräumen ist optional */ }
  }

  // Beim Start aufrufen: Kommt der Nutzer von der Microsoft-Anmeldung zurück, wird jetzt hochgeladen.
  async function odHandleCallback() {
    var p = new URLSearchParams(location.search);
    if (!p.has("code") && !p.has("error")) return;
    var auth = readJson(key("auth"));
    if (!auth.state || auth.state !== p.get("state")) return;

    try { localStorage.removeItem(key("auth")); } catch (e) { /* egal */ }
    history.replaceState(null, "", redirectUri());

    if (p.has("error")) {
      if (!auth.silent) toast("OneDrive-Anmeldung abgebrochen");
      return;
    }

    try {
      var res = await fetch(OD_AUTH_URL + "token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId(),
          scope: OD_SCOPE,
          code: p.get("code"),
          redirect_uri: redirectUri(),
          grant_type: "authorization_code",
          code_verifier: auth.verifier
        }).toString()
      });
      var tok = await res.json();
      if (!res.ok || !tok.access_token) throw new Error("token");

      var od = odState();
      od.connected = true;
      writeJson(key("od"), od);
      try {
        var claims = JSON.parse(atob(tok.id_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
        var sh = shared();
        sh.hint = claims.email || claims.preferred_username || sh.hint;
        writeJson(SHARED_KEY, sh);
      } catch (e) { /* Hinweis ist optional */ }

      var json = snapshot();
      if (json == null) { toast("Verbunden. Im Demo-Modus wird nichts hochgeladen."); }
      else if (fresh) { toast("OneDrive verbunden. Das erste Backup folgt, sobald Daten da sind."); }
      else {
        await odUpload(tok.access_token, json, dateStamp(new Date()));
        markBackup("OneDrive");
        toast("Backup in OneDrive gespeichert");
      }
    } catch (e) {
      pending = true;
      toast("OneDrive-Backup fehlgeschlagen");
    }
    renderAll();
  }

  // ---------- Ablauf ----------

  function markBackup(via, file) {
    writeJson(key("meta"), { lastAt: new Date().toISOString(), via: via, file: file || "" });
    pending = false;
    renderAll();
  }

  // interactive=false: nur still arbeiten (Ordner mit bestehender Erlaubnis), sonst "needs-tap"/"needs-login".
  async function runBackup(interactive) {
    if (busy) return "skipped";
    var json = snapshot();
    if (json == null) return "skipped";
    busy = true;
    try {
      var stamp = dateStamp(new Date());

      if (folderHandle) {
        try {
          if (await folderGranted(folderHandle, interactive)) {
            await writeToFolder(folderHandle, json, stamp);
            markBackup("Ordner „" + folderHandle.name + "“");
            return "folder";
          }
        } catch (e) {
          if (interactive) toast("Backup-Ordner nicht erreichbar");
        }
      }

      // OneDrive: Das Upload passiert erst nach der Rückkehr von der Microsoft-Anmeldung (odHandleCallback).
      if (odConnected()) {
        if (!interactive) return "needs-login";
        await odLogin(false);
        return "redirect";
      }

      if (!interactive) return "needs-tap";

      var res = await shareOrDownload(json, stamp);
      if (!res) return "cancelled";
      lastManual = res;
      markBackup(res.via, res.file);
      return "manual";
    } finally {
      busy = false;
    }
  }

  async function check() {
    if (!ready || checking) return;
    if (fresh || !isActive() || !isDue()) {
      pending = false;
      renderBanner();
      return;
    }
    checking = true;
    var result;
    try { result = await runBackup(false); } finally { checking = false; }
    if (result === "folder") {
      toast("Wochen-Backup gespeichert");
    } else if (result === "needs-login") {
      // Einmal leise versuchen (kurzer Wechsel zu Microsoft ohne Eingabe); klappt das nicht, hilft der Hinweis mit Tipp.
      var od = odState();
      var triedRecently = od.lastSilent && Date.now() - new Date(od.lastSilent).getTime() < 12 * 3600000;
      if (navigator.onLine && !triedRecently) {
        od.lastSilent = new Date().toISOString();
        writeJson(key("od"), od);
        odLogin(true);
      } else {
        pending = true;
        renderBanner();
      }
    } else if (result === "needs-tap") {
      pending = true;
      renderBanner();
    }
  }

  async function backupNow() {
    if (!isActive()) { toast("Im Demo-Modus gibt es kein Backup"); return; }
    var result = await runBackup(true);
    if (result === "folder") {
      toast("Backup im Ordner „" + folderHandle.name + "“ gespeichert");
    } else if (result === "manual" && lastManual && lastManual.via === "Download") {
      confirmDialog("Die Datei „" + lastManual.file + "“ wurde in den Download-Ordner deines Geräts geladen. " +
        "Sie liegt damit noch nicht in OneDrive: Öffne die OneDrive-App und lade sie dort über „Hochladen“ aus dem Ordner „Downloads“ hoch.", "Verstanden", true);
    } else if (result === "manual") {
      toast("Backup geteilt");
    }
  }

  function startRestore() { fileInput.click(); }

  function onRestoreFile() {
    var file = fileInput.files && fileInput.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var text = String(reader.result);
      fileInput.value = "";
      try { JSON.parse(text); } catch (e) { toast("Datei konnte nicht gelesen werden"); return; }
      confirmDialog("Backup einspielen? Die aktuellen Daten auf diesem Gerät werden ersetzt.", "Einspielen").then(function (ok) {
        if (!ok) return;
        return Promise.resolve(opts.restore(text)).then(function (success) {
          if (!success) { toast("Das sieht nicht nach einem " + opts.appName + "-Backup aus"); return; }
          fresh = false;
          toast("Backup eingespielt");
          markBackup("Wiederherstellung");
        });
      });
    };
    reader.readAsText(file);
  }

  // ---------- Oberfläche ----------

  function renderBanner() {
    if (!banner) return;
    var mode = deferred ? null : (fresh ? "fresh" : (pending ? "due" : null));
    banner.hidden = !mode;
    if (!mode) return;

    var text = banner.querySelector("[data-ab-text]");
    var action = banner.querySelector("[data-ab=banner-action]");
    var later = banner.querySelector("[data-ab=banner-later]");
    if (mode === "fresh") {
      text.textContent = "Keine gespeicherten Daten gefunden – vermutlich wurde der Browser-Speicher geleert. " +
        "Hast du ein Backup (.json)? Dann kannst du es jetzt einspielen.";
      action.textContent = "Backup einspielen";
      later.textContent = "Neu anfangen";
    } else {
      text.textContent = folderHandle
        ? "Das Wochen-Backup ist fällig. Ein Tipp genügt, damit die App in „" + folderHandle.name + "“ speichern darf."
        : odConnected()
          ? "Das Wochen-Backup ist fällig. Ein Tipp, kurz bei Microsoft bestätigen, dann liegt es in OneDrive."
          : "Das Wochen-Backup ist fällig, damit deine Daten nicht verloren gehen, wenn der Browser-Speicher mal geleert wird.";
      action.textContent = "Jetzt sichern";
      later.textContent = "Später";
    }
  }

  function renderPanel(el) {
    var active = isActive();
    var meta = readJson(key("meta"));
    var connected = odConnected();

    var status;
    if (!active) {
      status = "Im Demo-Modus werden keine Backups erstellt.";
    } else if (!meta.lastAt) {
      status = "Noch kein Backup erstellt.";
    } else {
      var age = Math.floor((Date.now() - new Date(meta.lastAt).getTime()) / 86400000);
      status = "Letztes Backup: " + formatDate(meta.lastAt) + " (" + (meta.via || "–") + ") · " +
        (age >= INTERVAL_DAYS ? "jetzt fällig" : "nächstes in " + daysText(INTERVAL_DAYS - age));
      if (meta.via === "Download") {
        status += ". Die Datei „" + (meta.file || "…") + "“ liegt im Download-Ordner deines Geräts, noch nicht in OneDrive. " +
          "In der OneDrive-App über „Hochladen“ ablegen.";
      }
    }
    el.querySelector("[data-ab-status]").textContent = status;

    var help;
    if (folderHandle) {
      help = "Beim Öffnen speichert die App einmal pro Woche automatisch eine Datei in den Ordner „" +
        folderHandle.name + "“ (die letzten " + KEEP + " bleiben erhalten).";
    } else if (canPickFolder) {
      help = "Wähle einmal einen Ordner, am besten einen eigenen Unterordner in deinem OneDrive-Ordner. " +
        "Danach speichert die App beim Öffnen einmal pro Woche automatisch dorthin, OneDrive lädt die Datei hoch. " +
        "Der Browser fragt dabei gelegentlich kurz nach der Erlaubnis.";
    } else if (connected) {
      help = "Beim Öffnen lädt die App ein fälliges Backup automatisch in dein OneDrive (siehe unten).";
    } else {
      help = "Dein Browser darf nicht selbst in Ordner schreiben. Die App erinnert dich deshalb einmal pro Woche: " +
        "tippe dann auf „Jetzt sichern“ und wähle im Teilen-Menü OneDrive (bzw. am iPhone „In Dateien sichern“ → OneDrive).";
    }
    el.querySelector("[data-ab-help]").textContent = help;

    var pick = el.querySelector("[data-ab=folder]");
    pick.hidden = !canPickFolder;
    pick.textContent = folderHandle ? "Anderen Backup-Ordner wählen" : "Backup-Ordner wählen (z. B. OneDrive)";
    el.querySelector("[data-ab=folder-clear]").hidden = !folderHandle;

    var hint = shared().hint;
    el.querySelector("[data-ab-od-status]").textContent = connected
      ? "Verbunden" + (hint ? " als " + hint : "") + ". Fällige Wochen-Backups landen in OneDrive unter „Apps“. Beim Öffnen wechselt die App dafür kurz zu Microsoft und zurück."
      : "Noch nicht verbunden. Damit lädt die App das Wochen-Backup direkt in dein privates OneDrive (Teilen-Menü nicht nötig).";
    var known = !!clientId();
    el.querySelector("[data-ab-od-setup]").hidden = connected || !!ONEDRIVE_CLIENT_ID;
    el.querySelector("[data-ab-od-help]").textContent = (known
      ? "Client-ID ist bereits bekannt (von einer anderen App). Neue App? Dann in der Microsoft-Registrierung zusätzlich diese Weiterleitungs-URI eintragen: "
      : "Einmal bei Microsoft eine App registrieren (Schritte in der README) und die Client-ID hier einfügen. Weiterleitungs-URI: ") + redirectUri();
    var input = el.querySelector("[data-ab-client]");
    if (document.activeElement !== input) input.value = clientId();
    var adv = el.querySelector("[data-ab-adv]");
    if (!adv.dataset.init) { adv.dataset.init = "1"; adv.open = connected; }
    el.querySelector("[data-ab=od-connect]").hidden = connected;
    el.querySelector("[data-ab=od-disconnect]").hidden = !connected;
  }

  function renderAll() {
    panels = panels.filter(function (p) { return p.isConnected; });
    panels.forEach(renderPanel);
    renderBanner();
  }

  function panelAction(name) {
    if (name === "now") {
      backupNow();
    } else if (name === "folder") {
      pickFolder();
    } else if (name === "folder-clear") {
      idbRun("readwrite", function (s) { return s.delete("dir"); }).catch(function () { /* egal */ }).then(function () {
        folderHandle = null;
        renderAll();
        toast("Backup-Ordner entfernt");
      });
    } else if (name === "od-connect") {
      connectOneDrive();
    } else if (name === "od-disconnect") {
      try { localStorage.removeItem(key("od")); } catch (e) { /* egal */ }
      renderAll();
      toast("OneDrive getrennt");
    }
  }

  async function pickFolder() {
    try {
      var handle = await window.showDirectoryPicker({ id: opts.appId.replace(/[^\w-]/g, "").slice(0, 32) || "backup", mode: "readwrite" });
      await idbRun("readwrite", function (s) { return s.put(handle, "dir"); });
      folderHandle = handle;
      renderAll();
      toast("Backup-Ordner gespeichert");
      if (isActive()) {
        var result = await runBackup(true);
        if (result === "folder") toast("Erstes Backup liegt im Ordner");
      }
    } catch (e) {
      if (!e || e.name !== "AbortError") toast("Ordner konnte nicht gewählt werden");
    }
  }

  function connectOneDrive() {
    if (!isActive()) { toast("Bitte erst den Demo-Modus beenden"); return; }
    var panel = panels.filter(function (p) { return p.isConnected; })[0];
    var id = ONEDRIVE_CLIENT_ID || (panel ? panel.querySelector("[data-ab-client]").value.trim() : "") || shared().clientId || "";
    if (!GUID_RE.test(id)) { toast("Das sieht nicht nach einer Client-ID aus"); return; }
    var sh = shared();
    sh.clientId = id;
    writeJson(SHARED_KEY, sh);
    odLogin(false);
  }

  function createPanel() {
    var btn = opts.btnClass || "ab-btn";
    var primary = opts.btnPrimaryClass || "ab-btn ab-btn--primary";
    var input = opts.inputClass || "ab-input";
    var el = document.createElement("div");
    el.className = "ab-panel";
    el.innerHTML =
      '<p class="ab-status" data-ab-status></p>' +
      '<p class="ab-help" data-ab-help></p>' +
      '<div class="ab-actions">' +
        '<button type="button" class="' + primary + '" data-ab="now">Jetzt sichern</button>' +
        '<button type="button" class="' + btn + '" data-ab="folder" hidden></button>' +
        '<button type="button" class="' + btn + '" data-ab="folder-clear" hidden>Backup-Ordner entfernen</button>' +
      '</div>' +
      '<details class="ab-adv" data-ab-adv><summary>Erweitert: direkt in OneDrive hochladen</summary>' +
      '<p class="ab-status" data-ab-od-status></p>' +
      '<div data-ab-od-setup>' +
        '<p class="ab-help" data-ab-od-help></p>' +
        '<input type="text" class="' + input + '" data-ab-client placeholder="Anwendungs-(Client-)ID" autocomplete="off" spellcheck="false" aria-label="Client-ID">' +
      '</div>' +
      '<div class="ab-actions">' +
        '<button type="button" class="' + primary + '" data-ab="od-connect">Mit OneDrive verbinden</button>' +
        '<button type="button" class="' + btn + '" data-ab="od-disconnect" hidden>OneDrive trennen</button>' +
      '</div>' +
      '</details>';
    el.addEventListener("click", function (e) {
      var target = e.target.closest("[data-ab]");
      if (target) panelAction(target.getAttribute("data-ab"));
    });
    panels.push(el);
    renderPanel(el);
    return el;
  }

  function buildChrome() {
    var style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    var btn = opts.btnClass || "ab-btn";
    var primary = opts.btnPrimaryClass || "ab-btn ab-btn--primary";
    banner = document.createElement("div");
    banner.className = "ab-banner" + (opts.bannerClass ? " " + opts.bannerClass : "");
    banner.setAttribute("role", "status");
    banner.hidden = true;
    banner.innerHTML =
      '<p data-ab-text></p>' +
      '<div class="ab-banner-actions">' +
        '<button type="button" class="' + primary + '" data-ab="banner-action"></button>' +
        '<button type="button" class="' + btn + '" data-ab="banner-later"></button>' +
      '</div>';
    banner.addEventListener("click", function (e) {
      var target = e.target.closest("[data-ab]");
      if (!target) return;
      var name = target.getAttribute("data-ab");
      if (name === "banner-action") { if (fresh) startRestore(); else backupNow(); }
      else if (name === "banner-later") { deferred = true; renderBanner(); }
    });
    if (opts.bannerBefore && opts.bannerBefore.parentNode) opts.bannerBefore.parentNode.insertBefore(banner, opts.bannerBefore);
    else if (opts.bannerParent) opts.bannerParent.insertBefore(banner, opts.bannerParent.firstChild);
    else document.body.insertBefore(banner, document.body.firstChild);

    toastEl = document.createElement("div");
    toastEl.className = "ab-toast";
    toastEl.setAttribute("role", "status");
    document.body.appendChild(toastEl);

    confirmEl = document.createElement("dialog");
    confirmEl.className = "ab-dialog";
    confirmEl.innerHTML =
      '<p data-ab-msg></p>' +
      '<div class="ab-dialog-actions">' +
        '<button type="button" class="' + btn + '" data-ab-cancel>Abbrechen</button>' +
        '<button type="button" class="' + primary + '" data-ab-ok>OK</button>' +
      '</div>';
    document.body.appendChild(confirmEl);

    fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "application/json,text/plain,.json,.txt";
    fileInput.hidden = true;
    fileInput.addEventListener("change", onRestoreFile);
    document.body.appendChild(fileInput);
  }

  function init(options) {
    opts = options;
    fileRe = new RegExp("^" + opts.filePrefix.replace(/[^\w]/g, "\\$&") + "-auto-\\d{4}-\\d{2}-\\d{2}\\.json$");
    fresh = !!(opts.isFresh && opts.isFresh());
    buildChrome();
    renderBanner();

    odHandleCallback()
      .catch(function () { /* Anmeldung fehlgeschlagen: der Hinweis greift */ })
      .then(loadFolderHandle)
      .then(function (handle) {
        folderHandle = handle;
        ready = true;
        renderAll();
        check();
      });

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") check();
    });
  }

  window.AppBackup = {
    init: init,
    createPanel: createPanel,
    refresh: function () { if (opts) { renderAll(); check(); } },
    markExternal: function (via) { if (opts) { fresh = false; markBackup(via); } }
  };
})();
