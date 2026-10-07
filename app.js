// ══════════════════════════════════ AUTH / LOGIN ══════════════════════════════════

const API_BASE = '/api';

let currentUser = null;

// ══════════════════════════════════ 10 MINUTE IDLE TIMER ══════════════════════════════════

const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const SESSION_HEARTBEAT_MS = 5 * 60 * 1000;

let idleTimer = null;
let idleCountdownTimer = null;
let idleDeadline = null;
let lastMouseActivity = 0;
let sessionHeartbeatTimer = null;


// ─────────────────────────────────────
// UPDATE COUNTDOWN
// ─────────────────────────────────────

function updateIdleCountdown() {

  const box = document.getElementById('idle-countdown');
  const time = document.getElementById('idle-countdown-time');

  if (!box || !time || !currentUser || !idleDeadline) {
    return;
  }

  const remaining = Math.max(
    0,
    idleDeadline - Date.now()
  );

  const totalSeconds = Math.ceil(
    remaining / 1000
  );

  const minutes = Math.floor(
    totalSeconds / 60
  );

  const seconds = totalSeconds % 60;

  time.textContent =
    String(minutes).padStart(2, '0') +
    ':' +
    String(seconds).padStart(2, '0');

  if (totalSeconds <= 120) {
    box.classList.add('warning');
  } else {
    box.classList.remove('warning');
  }

  if (totalSeconds <= 0) {
    logoutUser(true);
  }
}


// ─────────────────────────────────────
// RESET TIMER
// ─────────────────────────────────────

function resetIdleTimer() {

  if (!currentUser) {
    return;
  }

  idleDeadline =
    Date.now() + IDLE_TIMEOUT_MS;

  clearTimeout(idleTimer);

  idleTimer = setTimeout(
    () => {
      logoutUser(true);
    },
    IDLE_TIMEOUT_MS
  );

  updateIdleCountdown();
}


// ─────────────────────────────────────
// START TIMER
// ─────────────────────────────────────

function startIdleCountdown() {

  const box =
    document.getElementById('idle-countdown');

  if (box) {
    box.style.display = 'flex';
  }

  clearInterval(idleCountdownTimer);
  clearTimeout(idleTimer);

  resetIdleTimer();

  idleCountdownTimer =
    setInterval(
      updateIdleCountdown,
      1000
    );
}


// ─────────────────────────────────────
// STOP TIMER
// ─────────────────────────────────────

function stopIdleCountdown() {

  clearTimeout(idleTimer);

  clearInterval(idleCountdownTimer);

  idleTimer = null;
  idleCountdownTimer = null;
  idleDeadline = null;

  const box =
    document.getElementById('idle-countdown');

  if (box) {

    box.style.display = 'none';

    box.classList.remove('warning');
  }
}


// ─────────────────────────────────────
// USER ACTIVITY
// ─────────────────────────────────────

function setupIdleActivityTracking() {

  const events = [
    'mousedown',
    'keydown',
    'touchstart',
    'scroll'
  ];

  events.forEach(eventName => {

    document.addEventListener(
      eventName,
      () => {

        if (currentUser) {
          resetIdleTimer();
        }

      },
      {
        passive: true
      }
    );

  });


  document.addEventListener(
    'mousemove',
    () => {

      if (!currentUser) {
        return;
      }

      const now = Date.now();

      if (
        now - lastMouseActivity >
        1000
      ) {

        lastMouseActivity = now;

        resetIdleTimer();
      }

    }
  );
}


// ══════════════════════════════════ LOGIN ══════════════════════════════════

async function attemptLogin() {

  const submitBtn =
    document.getElementById(
      'login-submit-btn'
    );

  const usernameInput =
    document.getElementById(
      'login-username'
    );

  const passwordInput =
    document.getElementById(
      'login-password'
    );

  const errorBox =
    document.getElementById(
      'login-error'
    );


  if (
    !usernameInput ||
    !passwordInput ||
    !errorBox
  ) {
    return;
  }


  const username =
    usernameInput.value.trim();

  const password =
    passwordInput.value;


  errorBox.textContent = '';


  if (!username || !password) {

    errorBox.textContent =
      'Username and password are required.';

    return;
  }


  if (submitBtn) {
    submitBtn.disabled = true;
  }


  try {

    const response =
      await fetch(
        `${API_BASE}/auth`,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          credentials: 'include',

          body: JSON.stringify({
            username,
            password
          })
        }
      );


    const result =
      await response
        .json()
        .catch(() => ({}));


    if (!response.ok) {

      errorBox.textContent =
        result?.error?.message ||
        'Invalid username or password.';

      return;
    }


    currentUser = {

      username:
        result.username,

      role:
        result.role,

      displayName:
        result.displayName ||
        result.username

    };


    await enterApp();


  } catch (error) {

    console.error(
      'Login error:',
      error
    );

    errorBox.textContent =
      'Authentication service unavailable.';

  } finally {

    if (submitBtn) {
      submitBtn.disabled = false;
    }

  }
}


// ══════════════════════════════════ CHECK SESSION ══════════════════════════════════

async function checkAuthOnLoad() {

  const loginScreen =
    document.getElementById(
      'login-screen'
    );

  if (loginScreen) {
    loginScreen.classList.remove(
      'hidden'
    );
  }


  try {

    const response =
      await fetch(
        `${API_BASE}/auth`,
        {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store'
        }
      );


    if (!response.ok) {

      currentUser = null;

      return;
    }


    const result =
      await response
        .json()
        .catch(() => ({}));


    if (
      result.success &&
      result.user
    ) {

      currentUser =
        result.user;

      await enterApp();

    } else {

      currentUser = null;

    }


  } catch (error) {

    console.warn(
      'Session check failed:',
      error
    );

    currentUser = null;
  }
}


// ══════════════════════════════════ SESSION HEARTBEAT ══════════════════════════════════

function startSessionHeartbeat() {

  clearInterval(
    sessionHeartbeatTimer
  );


  sessionHeartbeatTimer =
    setInterval(
      async () => {

        if (!currentUser) {
          return;
        }


        try {

          const response =
            await fetch(
              `${API_BASE}/auth`,
              {
                method: 'GET',
                credentials: 'include',
                cache: 'no-store'
              }
            );


          if (!response.ok) {

            await logoutUser(true);

          }

        } catch (error) {

          console.warn(
            'Session heartbeat failed:',
            error
          );

        }

      },
      SESSION_HEARTBEAT_MS
    );
}


function stopSessionHeartbeat() {

  clearInterval(
    sessionHeartbeatTimer
  );

  sessionHeartbeatTimer = null;
}


// ══════════════════════════════════ LOGOUT ══════════════════════════════════

async function logoutUser(
  autoLogout = false
) {

  stopIdleCountdown();

  stopSessionHeartbeat();

  currentUser = null;


  try {

    await fetch(
      `${API_BASE}/logout`,
      {
        method: 'POST',
        credentials: 'include'
      }
    );

  } catch (error) {

    console.warn(
      'Logout request failed:',
      error
    );

  }


  // Clear application data from memory.

  cabins =
    buildDefaultCabins();

  occupants = [];

  payments = [];

  invoices = [];

  leads = [];

  quotations = [];

  virtualOffice = [];

  vacatedClients = [];

  confBookings = [];

  documents =
    defaultDocuments();

  appSettings =
    Object.assign(
      {},
      DEFAULT_SETTINGS
    );


  const loginScreen =
    document.getElementById(
      'login-screen'
    );

  const username =
    document.getElementById(
      'login-username'
    );

  const password =
    document.getElementById(
      'login-password'
    );

  const errorBox =
    document.getElementById(
      'login-error'
    );


  if (loginScreen) {

    loginScreen.classList.remove(
      'hidden'
    );

  }


  if (username) {

    username.value = '';

  }


  if (password) {

    password.value = '';

  }


  if (errorBox) {

    errorBox.textContent =
      autoLogout

        ? 'Your session expired after 10 minutes of inactivity. Please sign in again.'

        : '';

  }


  if (username) {

    username.focus();

  }
}


// ══════════════════════════════════ ENTER APP ══════════════════════════════════

async function enterApp() {

  const loginScreen =
    document.getElementById(
      'login-screen'
    );


  if (loginScreen) {

    loginScreen.classList.add(
      'hidden'
    );

  }


  const usernameLabel =
    document.getElementById(
      'sf-username'
    );


  if (usernameLabel) {

    usernameLabel.textContent =
      currentUser.displayName;

  }


  const roleBadge =
    document.getElementById(
      'sf-role-badge'
    );


  if (roleBadge) {

    const role =
      String(currentUser.role || 'staff').toLowerCase();

    const roleLabels = {
      admin: 'ADMIN',
      staff: 'STAFF',
      manager: 'MANAGER',
      managing_director: 'MANAGING DIRECTOR',
      owner: 'OWNER'
    };

    roleBadge.textContent =
      roleLabels[role] || role.replace(/[_-]+/g, ' ').toUpperCase();

    roleBadge.className =
      'role-badge ' +
      (role === 'admin' ? 'admin' : 'staff');

  }


  // Apply user permissions.

  applyRolePermissions();


  // START 10-MINUTE TIMER.

  startIdleCountdown();


  // Start server session heartbeat.

  startSessionHeartbeat();


  // Load application data.

  if (
    typeof syncAllFromSheets ===
    'function'
  ) {

    await syncAllFromSheets();

  } else if (
    typeof refreshAll ===
    'function'
  ) {

    refreshAll();

  }

}


// ══════════════════════════════════ ROLE PERMISSIONS ══════════════════════════════════

function applyRolePermissions() {
  const role = String(currentUser?.role || '').toLowerCase();
  const isAdmin = role === 'admin';
  const isOwner = role === 'owner';
  document.querySelectorAll('.admin-only-nav').forEach(element => {
    element.classList.toggle('staff-only-hide', !isAdmin && !isOwner);
  });
  document.body.classList.toggle('owner-readonly', isOwner);
  if (isOwner) applyOwnerReadOnlyUI();
  if (!isAdmin && !isOwner) {
    const restrictedPages = ['revenue', 'datasync', 'audit', 'reports', 'users'];
    const activePage = document.querySelector('.page.active');
    if (activePage && restrictedPages.includes(activePage.id.replace('page-', ''))) {
      showPage('dashboard', document.querySelector('.nav-item'));
    }
  }
}

function ownerMutationButton(button) {
  if (!button || button.closest('#main-sidebar')) return false;
  const text = String(button.textContent || '').toLowerCase().replace(/\s+/g, ' ');
  const onclick = String(button.getAttribute('onclick') || '').toLowerCase();
  return /\b(add|edit|save|delete|remove|vacat|mark|create|update|record|upload|replace|convert|toggle|import|new|lease|send test|send email|send whatsapp|settings)\b/.test(text) ||
         /\b(add|edit|save|delete|remove|vacat|mark|create|update|record|upload|replace|convert|toggle|import|lease|setpayment|setupi|setpayee)\b/.test(onclick);
}

function applyOwnerReadOnlyUI() {
  if (!document.body.classList.contains('owner-readonly')) return;
  document.querySelectorAll('button').forEach(button => {
    if (ownerMutationButton(button)) {
      button.classList.add('owner-mutation-control');
      button.setAttribute('aria-disabled', 'true');
    }
  });
  document.querySelectorAll('input, select, textarea').forEach(control => {
    if (control.closest('#login-page')) return;
    const id = String(control.id || '').toLowerCase();
    const cls = String(control.className || '').toLowerCase();
    if (!/search|filter|query/.test(id) && !/search|filter/.test(cls)) {
      control.disabled = true;
      control.setAttribute('aria-readonly', 'true');
      control.setAttribute('data-owner-disabled', 'true');
    }
  });
  const theme = document.getElementById('theme-toggle-btn');
  if (theme) { theme.classList.add('owner-mutation-control'); theme.setAttribute('aria-disabled', 'true'); }
}

if (!window.__collabor8OwnerGuardInstalled) {
  window.__collabor8OwnerGuardInstalled = true;
  document.addEventListener('click', event => {
    if (!document.body.classList.contains('owner-readonly')) return;
    const button = event.target?.closest?.('button');
    if (ownerMutationButton(button) || button?.id === 'theme-toggle-btn') {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  const ownerObserver = new MutationObserver(() => applyOwnerReadOnlyUI());
  ownerObserver.observe(document.documentElement, {childList: true, subtree: true});
}
// ══════════════════════════════════ DATA MODEL ══════════════════════════════════
const RATE_PER_SEAT = 8000; // Default reference rate (₹ + GST per seat). Individual occupant rent remains editable and is never overwritten by this default.
const PARKING_RATE = 5000;
const FLOORS = ['First Floor','Second Floor','Third Floor'];

function genRegularFloor(prefix, cprefix){
  const seats = [6,3,3,3,3,5,5,2,10,10,10,10];
  const arr = seats.map((s,i)=>({id:prefix+(i+1), seater:s}));
  for(let i=1;i<=6;i++) arr.push({id:cprefix+i, seater:1});
  return arr;
}
const FLOOR_LAYOUT = {
  'First Floor': [
    {id:'F1', seater:5},
    {id:'F2/F3', seater:7, note:'Merged conference-style cabin'},
    {id:'F4', seater:3},
    {id:'F5', seater:3},
    {id:'F6', seater:2},
    {id:'F7', seater:10},
    {id:'F8', seater:10},
    {id:'F9', seater:10},
    {id:'FC1', seater:1},{id:'FC2', seater:1},{id:'FC3', seater:1},{id:'FC4', seater:1},
    {id:'FC5', seater:1},{id:'FC6', seater:1},{id:'FC7', seater:1},{id:'FC8', seater:1},
    {id:'FC9', seater:1},{id:'FC10', seater:1},{id:'FC11', seater:1},
  ],
  'Second Floor': genRegularFloor('S','SC'),
  'Third Floor': genRegularFloor('T','TC'),
};
const SEED_OCCUPIED = [];

function buildDefaultCabins(){
  const cabins = [];
  FLOORS.forEach(floor=>{
    FLOOR_LAYOUT[floor].forEach((c,idx)=>{
      cabins.push({
        id: c.id, floor, seater: c.seater, sno: idx+1,
        occupied: SEED_OCCUPIED.includes(c.id),
        occupantId: null, occupantName: null,
        note: c.note || ''
      });
    });
  });
  return cabins;
}

// All persistent data now lives in Google Sheets only (no localStorage). These
// start as safe in-memory defaults and are overwritten by syncAllFromSheets()
// once the initial load from Sheets completes (see INIT at the bottom of this file).
let cabins = buildDefaultCabins();
let occupants = null;
let vacatedClients = [];
let virtualOffice = [];
let documents = null;

const AGREEMENT_TEMPLATE_B64 = "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";

function defaultDocuments(){
  return [{
    id:'doc-template', name:'COLLABOR8 Co-Working Space Agreement — Template.docx',
    category:'Template', mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    size: Math.round(AGREEMENT_TEMPLATE_B64.length*0.75),
    dataUrl:'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,'+AGREEMENT_TEMPLATE_B64,
    uploaded: new Date().toISOString().slice(0,10), linkedOccupantId:null, notes:'Master blank agreement — Schedule A & B to be filled per client.'
  }];
}
// Pre-Sheets-load fallbacks — overwritten by syncAllFromSheets() once the real data arrives.
if (occupants === null) occupants = [];
if (documents === null) documents = defaultDocuments();

// Small key/value app settings (theme, payment link, UPI id, payee name) — persisted as a
// single-row "settings" tab in Google Sheets instead of localStorage.
const DEFAULT_SETTINGS = { theme:'dark', paymentLink:'', upiId:'', payeeName:'COLLABOR8' };
let appSettings = Object.assign({}, DEFAULT_SETTINGS);
function saveSettings(){ syncToSheet('settings', [appSettings]); }

// ══════════════════════════════════ GOOGLE SHEETS SYNC LAYER ══════════════════════════════════
// Google Sheets is the persistent CRM metadata store. Document binaries are stored in
// Google Drive; only document metadata and Drive file ids/links are stored in Sheets.

const SHEETS_API = '/api/sheet-store';
let sheetsSyncEnabled = true; // Google Sheets is the persistent CRM data store

async function syncToSheet(tab, data, options = {}){
  try{
    const res = await fetch(SHEETS_API, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      credentials:'include',
      body: JSON.stringify({ sheet: tab, data })
    });
    let body = null;
    try { body = await res.json(); } catch {}
    if(!res.ok || body?.success === false){
      const message = body?.error?.message || ('Google Sheets sync failed (' + res.status + ').');
      throw new Error(message);
    }
    sheetsSyncEnabled = true;
    return true;
  }catch(e){
    console.error('Google Sheets sync failed for "'+tab+'":', e);
    sheetsSyncEnabled = true;
    if(options.throwOnFailure) throw e;
    return false;
  }
}

async function loadFromSheet(tab){
  try{
    const res = await fetch(SHEETS_API + '?sheet=' + encodeURIComponent(tab), { credentials:'include' });
    if(!res.ok) throw new Error('load failed: ' + res.status);
    const body = await res.json();
    return Array.isArray(body.data) ? body.data : null;
  }catch(e){
    console.warn('Google Sheets load failed for "'+tab+'".', e);
    return null;
  }
}

// Pulls every table from Sheets and replaces the in-memory copy with it. Runs once
// right after a successful login (see enterApp() in the AUTH section above), since
// sheet-store.js now requires a valid session before it will return any data. Safe
// to call again any time (e.g. wire a "Sync now" button to it).
function cabinCapacity(c){
  const n=Number(c?.seater);
  return Number.isFinite(n)&&n>0?n:0;
}
function normalizeCabinRecord(row){
  return {...row,id:String(row?.id||'').trim(),floor:String(row?.floor||'').trim(),seater:cabinCapacity(row),sno:Number(row?.sno)||0,occupied:false,occupantId:null,occupantName:null,note:String(row?.note||'')};
}
function isCabinOccupied(c){
  if(!c||!Array.isArray(occupants)) return false;
  return occupants.some(o=>Array.isArray(o.cabins)&&o.cabins.some(id=>String(id).trim()===String(c.id).trim()));
}
function allocatedSeatsForCabin(c){
  const cap=cabinCapacity(c); if(!cap||!Array.isArray(occupants)) return 0;
  const o=occupants.find(x=>Array.isArray(x.cabins)&&x.cabins.some(id=>String(id).trim()===String(c.id).trim()));
  if(!o) return 0;
  const n=Number(o.seatAllocations?.[c.id]);
  return Number.isFinite(n)&&n>0?Math.min(n,cap):cap;
}
function reconcileCabinOccupancy({persist=false}={}){
  let changed=false;
  cabins.forEach(c=>{
    const old=!!c.occupied||c.occupantId!=null||c.occupantName!=null;
    c.occupied=false;c.occupantId=null;c.occupantName=null;
    if(old) changed=true;
  });
  const assigned=new Set();
  (Array.isArray(occupants)?occupants:[]).forEach(o=>{
    const oid=String(o.id||'').trim(); if(!oid)return;
    (Array.isArray(o.cabins)?o.cabins:[]).forEach(raw=>{
      const cid=String(raw||'').trim(); if(!cid||assigned.has(cid))return;
      const c=cabins.find(x=>String(x.id)===cid); if(!c)return;
      assigned.add(cid);c.occupied=true;c.occupantId=oid;c.occupantName=String(o.name||'').trim()||null;
    });
  });
  if(persist&&changed) saveCabins();
  return changed;
}

// Sheets returns every cell as text. Older saves also wrote a null paidDate as the
// literal string "null", which made unpaid rows look Paid after a refresh.
function normalizePaymentRecord(r){
  const rec=Object.assign({},r||{});
  const blank=v=>v===null||v===undefined||['','null','undefined','nan','false'].includes(String(v).trim().toLowerCase());
  rec.paidDate=blank(rec.paidDate)?null:String(rec.paidDate).trim();
  rec.reminderDraftedAt=blank(rec.reminderDraftedAt)?null:String(rec.reminderDraftedAt).trim();
  rec.reminderSent=(rec.reminderSent===true)||['true','yes','1'].includes(String(rec.reminderSent).trim().toLowerCase());
  rec.amountDue=Number(rec.amountDue)||0;
  rec.baseAmount=blank(rec.baseAmount)&&rec.baseAmount!==0?rec.amountDue:(Number(rec.baseAmount)||0);
  if(typeof rec.amenities==='string'){
    try{ const a=JSON.parse(rec.amenities); rec.amenities=Array.isArray(a)?a:[]; }catch(e){ rec.amenities=[]; }
  }
  if(!Array.isArray(rec.amenities)) rec.amenities=[];
  rec.notes=rec.notes==null?'':String(rec.notes);
  return rec;
}

async function syncAllFromSheets(){
  const [c, o, p, inv, l, q, vo, bk, d, settingsRows, vac] = await Promise.all([
    loadFromSheet('cabins'), loadFromSheet('occupants'), loadFromSheet('payments'),
    loadFromSheet('invoices'), loadFromSheet('leads'), loadFromSheet('quotations'),
    loadFromSheet('virtual_office'), loadFromSheet('bookings'), loadFromSheet('documents'), loadFromSheet('settings'),
    loadFromSheet('vacated_clients')
  ]);
  if (c && c.length) cabins = c.map(normalizeCabinRecord);
  occupants = Array.isArray(o) ? o.map(normalizeOccupantRecord) : [];
  // Occupant records are the source of truth. Repair stale occupied flags in Sheets.
  reconcileCabinOccupancy({persist:true});
  payments = Array.isArray(p) ? p.map(normalizePaymentRecord) : [];
  invoices = Array.isArray(inv) ? inv : [];
  leads = Array.isArray(l) ? l : [];
  quotations = Array.isArray(q) ? q : [];
  virtualOffice = Array.isArray(vo) ? vo : [];
  confBookings = Array.isArray(bk) ? bk : [];
  documents = (d && d.length) ? d.map(x=>Object.assign(x,{linkedOccupantId:x.linkedOccupantId||x.occupantId||null,name:x.name||x.fileName,uploaded:x.uploaded||x.uploadedAt,category:x.category||x.documentType||'Other',docType:x.docType||x.documentType||'Other'})) : defaultDocuments();
  vacatedClients = Array.isArray(vac) ? vac.map(normalizeVacatedRecord) : [];
  appSettings = (settingsRows && settingsRows.length && settingsRows[0]) ? Object.assign({}, DEFAULT_SETTINGS, settingsRows[0]) : Object.assign({}, DEFAULT_SETTINGS);
  applyTheme(appSettings.theme || 'dark');
  if(typeof refreshAll === 'function') refreshAll();
}

function saveCabins(){ syncToSheet('cabins', cabins); }
function saveOccupants(){ syncToSheet('occupants', occupants); }
function saveVacatedClients(options = {}){ return syncToSheet('vacated_clients', vacatedClients, options); }
function saveVirtualOffice(options = {}){ return syncToSheet('virtual_office', virtualOffice, options); }
function saveDocuments(){ return true; }
// saveCabins(); saveOccupants(); saveDocuments(); // persist first-run defaults immediately

// ---- Payments ledger ----
let payments = [];
function savePayments(options = {}){ return syncToSheet('payments', payments, options); }

// ---- Invoices ----
let invoices = [];
function saveInvoices(){ syncToSheet('invoices', invoices); }

// ---- Sales CRM: leads, activities, quotations ----
const LEAD_STAGES = ['New','Contacted','Follow-up','Quotation Sent','Negotiation','Converted','Lost'];
const LEAD_SOURCES = ['Cold Call','Instagram','Facebook','Google','LinkedIn','WhatsApp','Website','Agency','Justdial','Referral','Walk-in','Other'];
let leads = [];
function saveLeads(options = {}){ return syncToSheet('leads', leads, options); }

let quotations = [];
let confBookings = [];
function saveBookings(options = {}){ return syncToSheet('bookings', confBookings, options); }
function saveQuotations(){
  syncToSheet('quotations', quotations);
}

let floorCurrent = 'First Floor';
let floorFilter = 'all';
let addFloorFilter = 'all';
let addAvailOnly = true;
let selectedAddCabinIds = new Set();
let alertTabCurrent = 'all';
let docFilterCurrent = 'All';

// ══════════════════════════════════ HELPERS ══════════════════════════════════
function today(){ return new Date().toISOString().slice(0,10); }
function daysLeft(endDate){ return Math.round((new Date(endDate)-new Date(today()))/86400000); }
function getDaysFromToday(endDate){ return daysLeft(endDate); }
function fmtDate(d){ if(!d) return '—'; return new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}); }
function fmtINR(n){ n=Number(n)||0; return '₹'+n.toLocaleString('en-IN',{maximumFractionDigits:2}); }
function formatDateDDMMYYYY(v){
  if(!v) return '';
  const m=String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d=String(v).match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  return d ? `${String(d[1]).padStart(2,'0')}/${String(d[2]).padStart(2,'0')}/${d[3]}` : '';
}
function parseDateDDMMYYYY(v){
  const m=String(v||'').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if(!m) return null;
  const day=Number(m[1]), month=Number(m[2]), year=Number(m[3]);
  const dt=new Date(year,month-1,day);
  if(dt.getFullYear()!==year || dt.getMonth()!==month-1 || dt.getDate()!==day) return null;
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}
function readAgreementDate(id){ return parseDateDDMMYYYY(document.getElementById(id)?.value||''); }
function setAgreementDate(id,value){ const el=document.getElementById(id); if(el) el.value=formatDateDDMMYYYY(value); }
function parkingRevenueFor(o){
  const explicit=Number(o?.parkingRevenue);
  if(Number.isFinite(explicit) && explicit>=0) return explicit;
  return (Number(o?.parking)||0)*PARKING_RATE;
}
function parkingDepositFor(o){ return Math.max(0,Number(o?.parkingDeposit)||0); }
function normalizeOccupantRecord(o){
  const rec=Object.assign({},o||{});
  if(typeof rec.cabins==='string'){
    try{ const parsed=JSON.parse(rec.cabins); rec.cabins=Array.isArray(parsed)?parsed:[]; }
    catch(e){ rec.cabins=rec.cabins.split(/[,;]+/).map(x=>x.trim()).filter(Boolean); }
  }
  if(!Array.isArray(rec.cabins)) rec.cabins=[];
  if(typeof rec.seatAllocations==='string'){
    try{ const parsed=JSON.parse(rec.seatAllocations); rec.seatAllocations=(parsed&&typeof parsed==='object')?parsed:{}; }
    catch(e){ rec.seatAllocations={}; }
  }
  if(!rec.seatAllocations || typeof rec.seatAllocations!=='object') rec.seatAllocations={};
  rec.parking=Math.max(0,parseInt(rec.parking,10)||0);
  rec.parkingRevenue=Number.isFinite(Number(rec.parkingRevenue)) ? Math.max(0,Number(rec.parkingRevenue)) : rec.parking*PARKING_RATE;
  rec.parkingDeposit=Math.max(0,Number(rec.parkingDeposit)||0);
  return rec;
}
function normalizeVacatedRecord(v){
  const rec=Object.assign({},v||{});
  for(const key of ['cabins','vacatedCabins']){
    if(typeof rec[key]==='string'){
      try{ const parsed=JSON.parse(rec[key]); rec[key]=Array.isArray(parsed)?parsed:[]; }
      catch(e){ rec[key]=rec[key].split(/[,;]+/).map(x=>x.trim()).filter(Boolean); }
    }
    if(rec[key] && !Array.isArray(rec[key])) rec[key]=[];
  }
  rec.parkingRevenue=Number.isFinite(Number(rec.parkingRevenue)) ? Math.max(0,Number(rec.parkingRevenue)) : (Number(rec.parking)||0)*PARKING_RATE;
  rec.parkingDeposit=Math.max(0,Number(rec.parkingDeposit)||0);
  rec.parkingDepositAtVacating=Math.max(0,Number(rec.parkingDepositAtVacating)||rec.parkingDeposit||0);
  return rec;
}
function getStatus(o){ const dl=daysLeft(o.end); if(dl<0) return 'expired'; if(dl<=30) return 'expiring'; return 'active'; }
function cabinsOf(floor){ return cabins.filter(c=>c.floor===floor); }
function totalSeats(){ return cabins.reduce((sum,c)=>sum+cabinCapacity(c),0); }
function occupiedSeats(){ return cabins.reduce((sum,c)=>sum+allocatedSeatsForCabin(c),0); }
function occupantSeatCount(o){
  return (Array.isArray(o?.cabins)?o.cabins:[]).reduce((sum,id)=>{
    const c=cabins.find(x=>String(x.id)===String(id)); if(!c)return sum;
    const cap=cabinCapacity(c),n=Number(o.seatAllocations?.[c.id]);
    return sum+(Number.isFinite(n)&&n>0?Math.min(n,cap):cap);
  },0);
}
function fmtBytes(n){ if(n>1024*1024) return (n/1024/1024).toFixed(2)+' MB'; if(n>1024) return (n/1024).toFixed(1)+' KB'; return n+' B'; }

// ══════════════════════════════════ FLOOR SUMMARY (DASHBOARD) ══════════════════════════════════
function renderFloorSummaryCards(){
  const el = document.getElementById('floor-summary-cards');
  el.innerHTML = FLOORS.map(floor=>{
    const list = cabinsOf(floor);
    const seatTotal = list.reduce((s,c) => s + (Number(c.seater) || 0), 0);
    const occSeats = list.reduce((s,c)=>s+allocatedSeatsForCabin(c),0);
    const cabinCount = list.length;
    const occCabins = list.filter(isCabinOccupied).length;
    const pct = seatTotal ? Math.round(occSeats/seatTotal*100) : 0;
    return `<div class="floor-card">
      <div class="floor-card-head"><div class="floor-card-name">${floor}</div><div class="floor-card-seats">${seatTotal} seats</div></div>
      <div style="font-size:12px;color:var(--text3);">${cabinCount} cabins · ${occCabins} occupied</div>
      <div class="progress-bar-wrap"><div class="progress-bar-track"><div class="progress-bar-fill" style="background:var(--teal);width:${pct}%"></div></div></div>
      <div class="floor-chip-row"><span class="floor-chip">${pct}% occupied</span><span class="floor-chip">${seatTotal-occSeats} vacant seats</span></div>
    </div>`;
  }).join('');
}

// ══════════════════════════════════ FLOOR PAGE ══════════════════════════════════
function renderFloorTabs(){
  const el = document.getElementById('floor-tabs');
  el.innerHTML = FLOORS.map(f=>`<div class="tab ${f===floorCurrent?'active':''}" onclick="switchFloor('${f}')">${f}</div>`).join('');
}
function switchFloor(f){ floorCurrent=f; floorFilter='all'; renderFloorPage(); }

function renderCapacitySummary(){
  const list = cabinsOf(floorCurrent);
  const groups = {};
  let individualCount = 0, individualSeats=0, cabinCount=0;
  list.forEach(c=>{
    if(c.seater===1){ individualCount++; individualSeats+=1; }
    else { cabinCount++; groups[c.seater] = (groups[c.seater]||0)+1; }
  });
  const seatTotal = list.reduce((s,c) => s + (Number(c.seater) || 0), 0);
  const sizes = Object.keys(groups).map(Number).sort((a,b)=>b-a);
  let chips = sizes.map(sz=>`<span class="floor-chip">${sz}-seater × ${groups[sz]} cabin${groups[sz]>1?'s':''}</span>`).join('');
  chips += `<span class="floor-chip">Individual × ${individualCount}</span>`;
  chips += `<span class="floor-chip" style="border-color:var(--gold);color:var(--gold);">Total cabins: ${cabinCount+individualCount}</span>`;
  chips += `<span class="floor-chip" style="border-color:var(--gold);color:var(--gold);">Total seats: ${seatTotal}</span>`;
  document.getElementById('capacity-summary').innerHTML = chips;
  document.getElementById('floor-total-label').textContent = floorCurrent + ' · ' + seatTotal + ' seats';
}

function renderFloorFilters(){
  const list = cabinsOf(floorCurrent);
  const occ = list.filter(isCabinOccupied).length;
  const vac = list.length-occ;
  document.getElementById('floor-filters').innerHTML = `
    <button class="filter-btn ${floorFilter==='all'?'active':''}" onclick="setFloorFilter('all')">All (${list.length})</button>
    <button class="filter-btn ${floorFilter==='occupied'?'active':''}" onclick="setFloorFilter('occupied')">Occupied (${occ})</button>
    <button class="filter-btn ${floorFilter==='vacant'?'active':''}" onclick="setFloorFilter('vacant')">Vacant (${vac})</button>`;
}
function setFloorFilter(f){ floorFilter=f; renderFloorPage(); }

function renderFloorGrid(){
  const q = (document.getElementById('floor-search')?.value||'').toLowerCase();
  const grid = document.getElementById('floor-ws-grid');
  let list = cabinsOf(floorCurrent);
  if(floorFilter==='occupied') list = list.filter(isCabinOccupied);
  if(floorFilter==='vacant') list = list.filter(c=>!isCabinOccupied(c));
  if(q) list = list.filter(c=> c.id.toLowerCase().includes(q) || (c.occupantName||'').toLowerCase().includes(q));
  grid.innerHTML = '';
  list.forEach(c=>{
    const cell = document.createElement('div');
    cell.className = 'ws-cell ' + (isCabinOccupied(c)?'occupied':'vacant');
    cell.innerHTML = `<div>${c.id}</div><div class="cell-seater">${c.seater}-seat</div>`;
    cell.addEventListener('mouseenter', e=>showCabinTooltip(e,c));
    cell.addEventListener('mouseleave', ()=>document.getElementById('tooltip').style.display='none');
    cell.addEventListener('click', ()=>openCabinModal(c.id));
    grid.appendChild(cell);
  });
}
function showCabinTooltip(e,c){
  const tt = document.getElementById('tooltip');
  document.getElementById('tt-id').textContent = c.id + ' · ' + c.floor;
  document.getElementById('tt-name').textContent = isCabinOccupied(c) ? (c.occupantName||'Occupied') : 'Vacant';
  document.getElementById('tt-company').textContent = c.seater + '-seater cabin';
  document.getElementById('tt-exp').textContent = '';
  document.getElementById('tt-rent').textContent = isCabinOccupied(c) ? '' : ('Base: ₹'+(cabinCapacity(c)*RATE_PER_SEAT).toLocaleString('en-IN')+' / month + GST');
  tt.style.display='block';
  tt.style.left = Math.min(e.clientX+12, window.innerWidth-210)+'px';
  tt.style.top = (e.clientY-20)+'px';
}

// ══════════════════════════════════ SEATING DETAILS (SETTINGS) ══════════════════════════════════
// The seating table lives in Settings. Rows are read-only until "Edit" is pressed.
let settingsFloor = 'First Floor';
let settingsEditingCabin = null;

function canEditSeating(){ return currentUser && currentUser.role !== 'owner'; }

function renderSeatingSettings(){
  const el = document.getElementById('seating-settings-card'); if(!el) return;
  const canEdit = canEditSeating();
  const list = cabinsOf(settingsFloor);
  const tabs = FLOORS.map(f=>`<div class="tab ${f===settingsFloor?'active':''}" data-floor="${esc(f)}" onclick="switchSettingsFloor(this.dataset.floor)">${esc(f)}</div>`).join('');
  const rows = list.map((c,i)=>{
    const editing = settingsEditingCabin === c.id;
    const occ = isCabinOccupied(c);
    const linked = (occupants||[]).find(o=>Array.isArray(o.cabins)&&o.cabins.some(id=>String(id)===String(c.id)));
    const idCell = editing
      ? `<input class="table-input" id="sc-edit-id" value="${esc(c.id)}" style="max-width:110px;"/>`
      : esc(c.id);
    const seatCell = editing
      ? `<input class="table-input" id="sc-edit-seater" type="number" min="1" value="${Number(c.seater)||1}" style="max-width:80px;"/>`
      : (Number(c.seater)||0);
    const actions = !canEdit ? '<span style="color:var(--text3);font-size:12px;">Read-only</span>'
      : editing
        ? `<div class="row-actions"><button class="btn btn-sm btn-primary" data-id="${esc(c.id)}" onclick="saveSettingsCabin(this.dataset.id)">Save</button><button class="btn btn-sm" onclick="cancelSettingsCabinEdit()">Cancel</button><button class="btn btn-sm btn-danger" data-id="${esc(c.id)}" onclick="deleteCabin(this.dataset.id)">Delete</button></div>`
        : `<button class="btn btn-sm" data-id="${esc(c.id)}" onclick="editSettingsCabin(this.dataset.id)" ${settingsEditingCabin?'disabled':''}>✎ Edit</button>`;
    return `<tr>
      <td>${i+1}</td>
      <td>${idCell}</td>
      <td>${seatCell}</td>
      <td><span class="status-pill ${occ?'status-paid':'status-due'}">${occ?'Occupied':'Vacant'}</span></td>
      <td style="font-size:12px;color:var(--text3);">${esc(linked?.name||c.occupantName||'—')}</td>
      <td>${actions}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text3);">No cabins on this floor.</td></tr>';
  const seatTotal = list.reduce((s,c)=>s+(Number(c.seater)||0),0);
  el.innerHTML = `<div class="card-title">Seating Details <span class="card-title-icon" style="color:var(--text3);font-size:11px;">${list.length} cabins · ${seatTotal} seats · press Edit to change a row</span></div>
    <div class="tab-bar">${tabs}</div>
    <div style="overflow:auto"><table class="data-table"><thead><tr><th>S.No</th><th>Cabin Number</th><th>Seater</th><th>Status</th><th>Occupant</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function switchSettingsFloor(f){ settingsFloor=f; settingsEditingCabin=null; renderSeatingSettings(); }
function editSettingsCabin(id){ if(!canEditSeating()) return; settingsEditingCabin=id; renderSeatingSettings(); const i=document.getElementById('sc-edit-seater'); if(i) i.focus(); }
function cancelSettingsCabinEdit(){ settingsEditingCabin=null; renderSeatingSettings(); }
function saveSettingsCabin(oldId){
  if(!canEditSeating()) return;
  const c = cabins.find(x=>x.id===oldId); if(!c) return;
  const newId = (document.getElementById('sc-edit-id')?.value||'').trim();
  const seater = parseInt(document.getElementById('sc-edit-seater')?.value,10);
  if(!newId){ alert('Cabin number is required.'); return; }
  if(!Number.isFinite(seater) || seater<1){ alert('Seater must be a number of 1 or more.'); return; }
  if(newId!==oldId && cabins.some(x=>x.id===newId)){ alert('Cabin ID already exists.'); return; }
  if(newId!==oldId){
    c.id = newId;
    (occupants||[]).forEach(o=>{
      if(Array.isArray(o.cabins)) o.cabins = o.cabins.map(id=>String(id)===oldId?newId:id);
      if(o.seatAllocations && Object.prototype.hasOwnProperty.call(o.seatAllocations,oldId)){ o.seatAllocations[newId]=o.seatAllocations[oldId]; delete o.seatAllocations[oldId]; }
    });
    saveOccupants();
  }
  c.seater = seater;
  saveCabins();
  settingsEditingCabin = null;
  refreshAll();
  renderSeatingSettings();
}

function toggleCabinOccupied(id){
  const c=cabins.find(x=>x.id===id); if(!c)return;
  const linked=(Array.isArray(occupants)?occupants:[]).find(o=>Array.isArray(o.cabins)&&o.cabins.some(cid=>String(cid)===String(id)));
  if(linked){ openVacatedModal(linked.id); return; }
  c.occupied=false; c.occupantId=null; c.occupantName=null;
  saveCabins(); refreshAll();
}
function deleteCabin(id){
  if(!confirm('Delete cabin '+id+'? This cannot be undone.')) return;
  const linked=(Array.isArray(occupants)?occupants:[]).filter(o=>Array.isArray(o.cabins)&&o.cabins.some(cid=>String(cid)===String(id)));
  if(linked.length){alert('This cabin is assigned to '+linked.map(o=>o.name||o.id).join(', ')+'. Vacate the occupant first.');return;}
  cabins=cabins.filter(c=>c.id!==id);saveCabins();settingsEditingCabin=null;refreshAll();renderSeatingSettings();
}
function openAddCabin(){
  const id = prompt('New Cabin ID (e.g. F13, S13, T13):');
  if(!id) return;
  const trimmed = id.trim();
  if(!trimmed) return;
  if(cabins.some(c=>c.id===trimmed)){ alert('Cabin ID already exists.'); return; }
  const seaterStr = prompt('Seater capacity (number of seats):','1');
  const seater = parseInt(seaterStr)||1;
  cabins.push({id:trimmed, floor:floorCurrent, seater, sno:cabinsOf(floorCurrent).length+1, occupied:false, occupantId:null, occupantName:null, note:''});
  saveCabins(); refreshAll();
}

function openCabinModal(id){
  const c = cabins.find(c=>c.id===id);
  if(!c) return;
  document.getElementById('cm-title').textContent = c.id + ' — ' + c.floor;
  document.getElementById('cm-body').innerHTML = `
    <div>Capacity: <strong style="color:var(--text)">${c.seater} seat${c.seater>1?'s':''}</strong></div>
    <div>Status: <strong style="color:${isCabinOccupied(c)?'var(--teal)':'var(--text3)'}">${isCabinOccupied(c)?'Occupied':'Vacant'}</strong></div>
    ${isCabinOccupied(c)?`<div>Occupant: <strong style="color:var(--text)">${c.occupantName||'—'}</strong></div>`:''}
    ${c.note?`<div style="color:var(--text3);font-size:12px;">${c.note}</div>`:''}
    <div>Base rate: <strong style="color:var(--gold)">₹${(c.seater*RATE_PER_SEAT).toLocaleString('en-IN')}</strong> / month + GST</div>`;
  document.getElementById('cm-actions').innerHTML = isCabinOccupied(c)
    ? `<button class="btn" onclick="closeCabinModal()">Close</button><button class="btn btn-danger" onclick="toggleCabinOccupied('${c.id}');closeCabinModal();">Mark Vacant</button>`
    : `<button class="btn" onclick="closeCabinModal()">Close</button><button class="btn btn-primary" onclick="closeCabinModal(); showPage('add',null); setAddFloorFilter('${c.floor}'); document.getElementById('a-cabin-search').value='${c.id}'; renderAddCabinChoices();">Lease this cabin</button>`;
  document.getElementById('cabinModal').classList.add('open');
}
function closeCabinModal(){ document.getElementById('cabinModal').classList.remove('open'); }

function renderFloorPage(){
  renderFloorTabs(); renderCapacitySummary(); renderFloorFilters(); renderFloorGrid();
}

// ══════════════════════════════════ DASHBOARD QUICK VIEW (ALL FLOORS) ══════════════════════════════════
function renderDashGrid(){
  const container = document.getElementById('dashboard-floor-quick-views');
  if(!container) return;

  container.innerHTML = FLOORS.map(floor=>{
    const list = cabinsOf(floor);
    const seatTotal = list.reduce((s,c) => s + (Number(c.seater) || 0), 0);
    const occSeats = list.reduce((s,c)=>s+allocatedSeatsForCabin(c),0);
    const vacantSeats = Math.max(0,seatTotal-occSeats);
    const vacantCabins = list.filter(c=>!isCabinOccupied(c)).length;
    const pct = seatTotal ? Math.round(occSeats/seatTotal*100) : 0;

    const cells = list.map(c=>`<div class="ws-cell ${isCabinOccupied(c)?'occupied':'vacant'} dash-floor-cell" data-floor="${esc(floor)}" data-cabin="${esc(c.id)}">
      <div>${esc(c.id)}</div><div class="cell-seater">${c.seater}-seat</div>
    </div>`).join('');

    return `<div class="dash-floor-quick">
      <div class="dash-floor-quick-head">
        <div class="floor-card-name">${esc(floor)}</div>
        <div class="floor-card-seats">${seatTotal} seats</div>
      </div>
      <div class="cabin-select-summary dash-floor-summary">
        <div class="summary-chip">Occupied: <b style="color:var(--teal)">${occSeats}</b></div>
        <div class="summary-chip">Vacant: <b style="color:var(--coral)">${vacantSeats}</b></div>
        <div class="summary-chip">${pct}%</div>
        <div class="summary-chip">Vacant cabins: <b>${vacantCabins}</b></div>
      </div>
      <div class="progress-bar-wrap"><div class="progress-bar-track"><div class="progress-bar-fill" style="background:var(--teal);width:${pct}%"></div></div></div>
      <div class="ws-grid dash-floor-grid">${cells}</div>
      <button class="btn btn-sm dash-floor-more" type="button" data-floor="${esc(floor)}">Show ${esc(floor)} →</button>
    </div>`;
  }).join('');

  container.querySelectorAll('.dash-floor-cell').forEach(cell=>{
    const floor = cell.dataset.floor;
    const cabin = cabins.find(c=>c.floor===floor && c.id===cell.dataset.cabin);
    if(!cabin) return;
    cell.addEventListener('mouseenter', e=>showCabinTooltip(e,cabin));
    cell.addEventListener('mouseleave', ()=>{ const t=document.getElementById('tooltip'); if(t) t.style.display='none'; });
    cell.addEventListener('click', ()=>{ showPage('floors', null); switchFloor(floor); });
  });
  container.querySelectorAll('.dash-floor-more').forEach(btn=>{
    btn.addEventListener('click', ()=>{ showPage('floors', null); switchFloor(btn.dataset.floor); });
  });
}

// ══════════════════════════════════ CHARTS ══════════════════════════════════
let occChartInst=null, revChartInst=null, revBreakInst=null;
function cssVar(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

function dashboardRevenueForMonth(monthStr){
  const monthStart = parseLocalDate(monthStr+'-01');
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth()+1, 0);

  // The payment ledger is the primary source for monthly occupant revenue.
  // Because vacated occupants are moved out of the active occupants list,
  // historical payment rows must be included independently of current occupancy.
  const paymentRevenue = payments.reduce((sum,p)=>{
    return String(p.month||'')===monthStr ? sum + Number(p.amountDue||0) : sum;
  },0);
  const fallbackRevenue = occupants.reduce((sum,o)=>{
    if(!o.start) return sum;
    const start = parseLocalDate(o.start);
    const end = o.end ? parseLocalDate(o.end) : null;
    if(start > monthEnd || (end && end < monthStart)) return sum;
    const payment = payments.find(p=>p.occupantId===o.id && p.month===monthStr);
    return sum + (payment ? 0 : paymentBaseAmount(o));
  },0);
  const occupantRevenue = paymentRevenue + fallbackRevenue;

  // Virtual-office agreements store annual billing, so the dashboard allocates
  // the existing yearly amount evenly across active agreement months.
  const virtualOfficeRevenue = virtualOffice.reduce((sum,v)=>{
    if(!v.start) return sum;
    const start = parseLocalDate(v.start);
    const end = v.end ? parseLocalDate(v.end) : null;
    if(start > monthEnd || (end && end < monthStart)) return sum;
    return sum + virtualOfficeYearlyTotal(v)/12;
  },0);

  // Usage & Booking revenue is included only for paid, non-cancelled bookings.
  const bookingRevenue = confBookings.reduce((sum,b)=>{
    if(!b.date || String(b.paymentStatus||'').toLowerCase()!=='paid' || String(b.status||'').toUpperCase()==='CANCELLED') return sum;
    return String(b.date).slice(0,7)===monthStr ? sum + Number(b.totalAmount ?? b.amount ?? 0) : sum;
  },0);

  return Math.round((occupantRevenue + virtualOfficeRevenue + bookingRevenue)*100)/100;
}

function dashboardRevenueSeries(){
  const end = new Date();
  return Array.from({length:6},(_,i)=>{
    const d = new Date(end.getFullYear(), end.getMonth()-5+i, 1);
    const key = localMonthKey(d);
    return { key, label:d.toLocaleDateString('en-IN',{month:'short'}), value:dashboardRevenueForMonth(key) };
  });
}

function renderCharts(){
  if (typeof Chart === 'undefined') return; // Chart.js CDN not reachable — rest of the dashboard still works
  const gridColor = cssVar('--border');
  const tickColor = cssVar('--text3');
  const teal = cssVar('--teal'), violet = cssVar('--violet');
  const vacantColor = cssVar('--bg3'), vacantBorder = cssVar('--border2');
  const occ = occupiedSeats();
  const vacant = Math.max(0, totalSeats()-occ);
  const ctx1 = document.getElementById('occChart');
  if(ctx1){
    if(occChartInst) occChartInst.destroy();
    occChartInst = new Chart(ctx1, { type:'doughnut', data:{ labels:['Occupied','Vacant'], datasets:[{ data:[occ,vacant], backgroundColor:[teal,vacantColor], borderColor:[teal,vacantBorder], borderWidth:1, hoverOffset:6 }]},
      options:{ responsive:true, maintainAspectRatio:false, cutout:'68%', plugins:{ legend:{display:false}, tooltip:{callbacks:{label:ctx=>ctx.label+': '+ctx.raw+' seats'}} } } });
    const leg = document.getElementById('occ-legend');
    if(leg){ leg.innerHTML = [['Occupied '+occ,teal],['Vacant '+vacant,vacantColor]].map(([l,c])=>`<span style="display:flex;align-items:center;gap:4px;color:var(--text3);font-size:11px;"><span style="width:8px;height:8px;border-radius:50%;background:${c};border:1px solid var(--border2);display:inline-block;"></span>${l}</span>`).join(''); }
  }
  const ctx2 = document.getElementById('revChart');
  if(ctx2){
    if(revChartInst) revChartInst.destroy();
    const series = dashboardRevenueSeries();
    revChartInst = new Chart(ctx2, { type:'bar', data:{ labels:series.map(x=>x.label), datasets:[{ label:'Revenue (₹)', data:series.map(x=>x.value), backgroundColor:violet+'88', borderColor:violet, borderWidth:1, borderRadius:4 }]},
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>'Revenue: ₹'+Number(ctx.raw||0).toLocaleString('en-IN',{maximumFractionDigits:2})}}}, scales:{ y:{grid:{color:gridColor},ticks:{color:tickColor,callback:v=>'₹'+Math.round(v).toLocaleString('en-IN')}}, x:{grid:{display:false},ticks:{color:tickColor}} } } });
  }
  const ctx3 = document.getElementById('revBreakChart');
  if(ctx3){
    if(revBreakInst) revBreakInst.destroy();
    const active = occupants.filter(o=>getStatus(o)==='active');
    const names = active.map(o=>o.comp||o.name).slice(0,8);
    const vals = active.map(o=>o.rent||0).slice(0,8);
    revBreakInst = new Chart(ctx3, { type:'bar', data:{ labels:names.length?names:['No data'], datasets:[{ label:'Monthly Rent', data:vals.length?vals:[0], backgroundColor:teal+'8c', borderColor:teal, borderWidth:1, borderRadius:4 }]},
      options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ x:{grid:{color:gridColor},ticks:{color:tickColor,callback:v=>'₹'+Math.round(v).toLocaleString('en-IN')}}, y:{grid:{display:false},ticks:{color:tickColor,font:{size:11}}} } } });
  }
}

// ══════════════════════════════════ METRICS ══════════════════════════════════
function updateMetrics(){
  const occ = occupiedSeats();
  const total = totalSeats();
  const vacant = Math.max(0,total-occ);
  const expiring = occupants.filter(o=>getStatus(o)==='expiring').length;
  const activeOccupants = occupants.filter(o=>getStatus(o)!=='expired');
  const revenue = activeOccupants.reduce((s,o)=>s+(Number(o.rent)||0),0);
  const parking = activeOccupants.reduce((s,o)=>s+parkingRevenueFor(o),0);
  const totalDeposit = activeOccupants.reduce((s,o)=>s+(Number(o.deposit)||0),0);
  const totalParkingDeposit = activeOccupants.reduce((s,o)=>s+parkingDepositFor(o),0);
  const totalAdvance = activeOccupants.reduce((s,o)=>s+(Number(o.advance)||0),0);
  document.getElementById('m-total').textContent = total;
  document.getElementById('m-occupied').textContent = occ;
  document.getElementById('m-vacant').textContent = vacant;
  document.getElementById('m-revenue').textContent = fmtINR(revenue);
  document.getElementById('m-expiring').textContent = expiring;
  document.getElementById('m-deposit').textContent = fmtINR(totalDeposit);
  const parkingMetric = document.getElementById('m-parking');
  if(parkingMetric) parkingMetric.textContent = fmtINR(parking);
  document.getElementById('m-advance').textContent = fmtINR(totalAdvance);
  document.getElementById('m-client-funds').textContent = fmtINR(totalDeposit+totalParkingDeposit+totalAdvance);
  document.getElementById('occ-bar').style.width = (total? Math.round(occ/total*100):0)+'%';
  const alertCount = occupants.filter(o=>getStatus(o)==='expired'||getStatus(o)==='expiring').length;
  document.getElementById('top-alert-badge').textContent = alertCount+' Alerts';
  document.getElementById('alert-count-nav').textContent = alertCount;
  document.getElementById('doc-count-nav').textContent = documents.length;
  document.getElementById('rv-monthly').textContent = fmtINR(revenue);
  document.getElementById('rv-annual').textContent = fmtINR(revenue*12);
  document.getElementById('rv-parking').textContent = fmtINR(parking);
  document.getElementById('rv-potential').textContent = fmtINR(total*RATE_PER_SEAT);
  document.getElementById('rv-potential-sub').textContent = total+' seats × ₹'+RATE_PER_SEAT.toLocaleString('en-IN');
  document.getElementById('sf-total').textContent = total+' total seats';
}

// ══════════════════════════════════ ALERTS ══════════════════════════════════
function buildAlerts(){
  const alerts = [];
  occupants.forEach(o=>{
    const dl = daysLeft(o.end);
    if(dl<0) alerts.push({type:'urgent', title:o.name+' — Lease EXPIRED', sub:o.comp+' | Cabin(s): '+o.cabins.join(', ')+' | Expired '+Math.abs(dl)+' days ago'});
    else if(dl<=7) alerts.push({type:'urgent', title:o.name+' — Expiring in '+dl+' day(s)!', sub:o.comp+' | Cabin(s): '+o.cabins.join(', ')+' | End: '+fmtDate(o.end)});
    else if(dl<=30) alerts.push({type:'warning', title:o.name+' — Expiring in '+dl+' days', sub:o.comp+' | Cabin(s): '+o.cabins.join(', ')+' | End: '+fmtDate(o.end)});
    else if(dl<=90) alerts.push({type:'info', title:'Notice-period reminder: '+o.name, sub:o.comp+' | 3-month notice window approaching | '+dl+' days remaining'});
  });
  ensurePaymentsGenerated();
  payments.forEach(p=>{
    const st = paymentStatus(p);
    if(st==='paid') return;
    const o = occupants.find(o=>o.id===p.occupantId);
    if(!o) return;
    if(st==='overdue') alerts.push({type:'urgent', title:'Payment overdue: '+o.name, sub:o.comp+' | '+p.month+' | ₹'+p.amountDue.toLocaleString('en-IN')+' + GST | Due '+fmtDate(p.dueDate)});
    else alerts.push({type:'info', title:'Payment due: '+o.name, sub:o.comp+' | '+p.month+' | ₹'+p.amountDue.toLocaleString('en-IN')+' + GST | Due '+fmtDate(p.dueDate)});
  });
  leads.filter(l=>l.nextFollowUp && l.stage!=='Converted' && l.stage!=='Lost').forEach(l=>{
    const dl = daysLeft(l.nextFollowUp);
    if(dl<0) alerts.push({type:'warning', title:'Follow-up overdue: '+l.name, sub:(l.company||l.source)+' | Was due '+fmtDate(l.nextFollowUp)});
    else if(dl===0) alerts.push({type:'info', title:'Follow-up due today: '+l.name, sub:(l.company||l.source)+' | '+l.stage});
  });
  return alerts;
}
function renderAlerts(tab){
  const alerts = buildAlerts();
  const container = document.getElementById('alerts-container');
  const dashList = document.getElementById('dash-alerts-list');
  const filtered = tab==='all'?alerts:alerts.filter(a=>a.type===tab);
  const html = filtered.length ? filtered.map(a=>`<div class="alert-item ${a.type}"><span class="alert-icon">${a.type==='urgent'?'🔴':a.type==='warning'?'🟡':'🔵'}</span><div class="alert-text"><strong>${esc(a.title)}</strong><span>${esc(a.sub)}</span></div></div>`).join('') : '<div class="empty-state">No alerts in this category.</div>';
  if(container) container.innerHTML = html;
  if(dashList){
    const top = alerts.slice(0,5);
    dashList.innerHTML = top.length ? top.map(a=>`<div class="alert-item ${a.type}" style="padding:8px 10px;margin-bottom:6px;"><span class="alert-icon" style="font-size:12px;">${a.type==='urgent'?'🔴':a.type==='warning'?'🟡':'🔵'}</span><div class="alert-text" style="font-size:12px;"><strong style="font-size:12px;">${esc(a.title)}</strong><span style="font-size:11px;">${esc(a.sub)}</span></div></div>`).join('') : '<div style="padding:20px;text-align:center;color:var(--text3);font-size:13px;">No alerts</div>';
  }
}
function alertTab(tab, el){ alertTabCurrent=tab; document.querySelectorAll('.tab-bar .tab').forEach(t=>t.classList.remove('active')); if(el) el.classList.add('active'); renderAlerts(tab); }

// ══════════════════════════════════ OCCUPANTS ══════════════════════════════════
function docCountFor(occId){ return documents.filter(d=>d.linkedOccupantId===occId).length; }
function renderOccupantsTable(){
  const q = (document.getElementById('occ-search')?.value||'').toLowerCase();
  const filtered = occupants.filter(o=> (o.name||'').toLowerCase().includes(q) || (o.comp||'').toLowerCase().includes(q) || (o.cabins||[]).join(',').toLowerCase().includes(q));
  const body = document.getElementById('occ-body'), empty=document.getElementById('occ-empty');
  const active=occupants.filter(o=>getStatus(o)!=='expired');
  document.getElementById('occ-summary-active').textContent=active.length;
  document.getElementById('occ-summary-seats').textContent=active.reduce((s,o)=>s+occupantSeatCount(o),0);
  document.getElementById('occ-summary-rent').textContent=fmtINR(active.reduce((s,o)=>s+(o.rent||0),0));
  document.getElementById('occ-summary-deposit').textContent=fmtINR(active.reduce((s,o)=>s+(Number(o.deposit)||0),0));
  const parkingDepositSummary=document.getElementById('occ-summary-parking-deposit');
  if(parkingDepositSummary) parkingDepositSummary.textContent=fmtINR(active.reduce((s,o)=>s+parkingDepositFor(o),0));
  document.getElementById('occ-summary-advance').textContent=fmtINR(active.reduce((s,o)=>s+(Number(o.advance)||0),0));
  document.getElementById('occ-summary-expiring').textContent=occupants.filter(o=>{const d=daysLeft(o.end);return d>=0&&d<=30}).length;
  if(!filtered.length){body.innerHTML='';empty.style.display='block';return;} empty.style.display='none';
  const pill=o=>{const st=getStatus(o),dl=daysLeft(o.end);if(st==='expired')return '<span class="status-pill status-expired">Expired</span>';if(st==='expiring')return '<span class="status-pill status-expiring">Expiring '+dl+'d</span>';return '<span class="status-pill status-active">Active</span>';};
  body.innerHTML=filtered.map(o=>{
    const seats=occupantSeatCount(o); const capacity=(o.cabins||[]).reduce((s,id)=>{const c=cabins.find(x=>x.id===id);return s+(c?c.seater:0)},0);
    return `<tr><td><div class="occ-main">${esc((o.cabins||[]).join(', '))}</div><span class="occ-sub">${seats} of ${capacity} seats allocated</span></td><td><div class="occ-main">${esc(o.name)}</div><span class="occ-sub">${esc(o.email||'No email')}</span></td><td>${esc(o.comp||'—')}</td><td style="font-size:11.5px;color:var(--text3)">${esc(o.phone||'—')}</td><td><span class="occ-seats-pill">● ${seats}</span></td><td><span class="occ-rent">${fmtINR(o.rent||0)}</span><span class="occ-sub">+ ${o.parking||0} parking · ${fmtINR(parkingRevenueFor(o))}</span></td><td><span class="occ-rent">${fmtINR(o.deposit||0)}</span><span class="occ-sub">Security deposit</span><span class="occ-sub">Parking deposit ${fmtINR(parkingDepositFor(o))}</span></td><td><span class="occ-rent">${fmtINR(o.advance||0)}</span><span class="occ-sub">Seat advance</span></td><td><span class="occ-sub" style="margin:0">Start</span>${fmtDate(o.start)}<span class="occ-sub">End ${fmtDate(o.end)}</span></td><td>${pill(o)}</td><td style="font-size:11px">${docCountFor(o.id)} file(s)</td><td><div class="row-actions"><button class="btn btn-sm" onclick="openEditOccModal('${o.id}')">Edit</button><button class="btn btn-sm btn-danger" onclick="openVacatedModal('${o.id}')">Vacant</button><button class="btn btn-sm btn-danger" onclick="deleteOccupant('${o.id}')">Remove</button></div></td></tr>`;
  }).join('');
}
function renderSeatAllocationEditor(containerId, cabinIds, allocations){
  const el=document.getElementById(containerId); if(!el)return;
  el.innerHTML=(cabinIds||[]).map(cid=>{const c=cabins.find(x=>x.id===cid); if(!c)return ''; const val=Math.min(Number(allocations&&allocations[cid])||c.seater,c.seater); return `<div class="seat-allocation-row"><div><div class="seat-allocation-name">${esc(c.id)}</div><div class="seat-allocation-cap">${esc(c.floor)} · capacity ${c.seater} seat${c.seater>1?'s':''}</div></div><input class="form-input" type="number" min="0" max="${c.seater}" value="${val}" data-seat-cabin="${esc(c.id)}" oninput="onSeatAllocationChange()"/><div class="seat-capacity-display" style="font-size:10.5px;color:var(--text3)">occupied / ${c.seater}</div></div>`}).join('');
}
function collectSeatAllocations(containerId){const out={};document.querySelectorAll('#'+containerId+' [data-seat-cabin]').forEach(i=>{const c=i.dataset.seatCabin;const cabin=cabins.find(x=>x.id===c);out[c]=Math.max(0,Math.min(parseInt(i.value)||0,cabin?cabin.seater:0));});return out;}
function onSeatAllocationChange(){ const ids=selectedAddCabins(); let total=0; document.querySelectorAll('#a-seat-allocation [data-seat-cabin]').forEach(i=>total+=parseInt(i.value)||0); document.getElementById('a-sum-seats').textContent=total; }
function deleteOccupant(id){
  if(!confirm('Remove this occupant and free their cabin(s)? This cannot be undone.')) return;
  const o=occupants.find(x=>x.id===id); if(o)(o.cabins||[]).forEach(cid=>{const c=cabins.find(x=>x.id===cid);if(c){c.occupied=false;c.occupantId=null;c.occupantName=null;}});
  occupants=occupants.filter(x=>x.id!==id);saveCabins();saveOccupants();refreshAll();
}
function syncEditSeatAllocationFields(){ const ids=(document.getElementById('eo-ws').value||'').split(',').map(s=>s.trim()).filter(Boolean); renderSeatAllocationEditor('eo-seat-allocation',ids,collectSeatAllocations('eo-seat-allocation')); }
function openEditOccModal(id){
  const o=occupants.find(x=>x.id===id);if(!o)return;
  document.getElementById('eo-id').value=o.id;document.getElementById('eo-ws').value=(o.cabins||[]).join(', ');document.getElementById('eo-name').value=o.name;document.getElementById('eo-company').value=o.comp||'';document.getElementById('eo-email').value=o.email||'';document.getElementById('eo-phone').value=o.phone||'';setAgreementDate('eo-start',o.start);setAgreementDate('eo-end',o.end);document.getElementById('eo-rent').value=o.rent||0;document.getElementById('eo-parking').value=o.parking||0;document.getElementById('eo-parking-revenue').value=parkingRevenueFor(o);document.getElementById('eo-parking-deposit').value=parkingDepositFor(o);document.getElementById('eo-deposit').value=o.deposit||0;document.getElementById('eo-advance').value=o.advance||0;renderSeatAllocationEditor('eo-seat-allocation',o.cabins,o.seatAllocations||{});renderOccDocs(o.id);document.getElementById('editOccModal').classList.add('open');
}
function closeEditOccModal(){document.getElementById('editOccModal').classList.remove('open');}
function saveEditOccupant(){
  const id=document.getElementById('eo-id').value,o=occupants.find(x=>x.id===id);if(!o)return;
  const newIds=document.getElementById('eo-ws').value.split(',').map(s=>s.trim()).filter(Boolean);if(!newIds.length){alert('At least one cabin ID is required.');return;}
  const missing=newIds.filter(cid=>!cabins.some(c=>c.id===cid));if(missing.length){alert('Unknown cabin ID(s): '+missing.join(', '));return;}
  const taken=newIds.filter(cid=>{const c=cabins.find(x=>x.id===cid);return c.occupied&&c.occupantId!==o.id});if(taken.length){alert('Already occupied by another occupant: '+taken.join(', '));return;}
  o.cabins.filter(cid=>!newIds.includes(cid)).forEach(cid=>{const c=cabins.find(x=>x.id===cid);if(c){c.occupied=false;c.occupantId=null;c.occupantName=null;}});
  const name=document.getElementById('eo-name').value.trim()||o.name;newIds.forEach(cid=>{const c=cabins.find(x=>x.id===cid);c.occupied=true;c.occupantId=o.id;c.occupantName=name;});
  const start=readAgreementDate('eo-start'),end=readAgreementDate('eo-end');
  if(!start){alert('Agreement start date must be in DD/MM/YYYY format.');return;}
  if(!end){alert('Agreement end date must be in DD/MM/YYYY format.');return;}
  if(end<start){alert('Agreement end date cannot be before the start date.');return;}
  const allocations=collectSeatAllocations('eo-seat-allocation');
  for(const cid of newIds){const c=cabins.find(x=>x.id===cid);if((allocations[cid]??c.seater)>c.seater){alert('Occupied seats cannot exceed cabin capacity for '+cid);return;}if((allocations[cid]??0)<0){alert('Occupied seats cannot be negative.');return;}}
  o.cabins=newIds;o.seatAllocations=allocations;o.name=name;o.comp=document.getElementById('eo-company').value.trim();o.email=document.getElementById('eo-email').value.trim();o.phone=document.getElementById('eo-phone').value.trim();o.start=start;o.end=end;o.rent=parseFloat(document.getElementById('eo-rent').value)||0;o.parking=parseInt(document.getElementById('eo-parking').value)||0;o.parkingRevenue=Math.max(0,parseFloat(document.getElementById('eo-parking-revenue').value)||0);o.parkingDeposit=Math.max(0,parseFloat(document.getElementById('eo-parking-deposit').value)||0);o.deposit=parseFloat(document.getElementById('eo-deposit').value)||0;o.advance=parseFloat(document.getElementById('eo-advance').value)||0;
  saveOccupants();saveCabins();closeEditOccModal();refreshAll();
}

// ══════════════════════════════════ VACATED CLIENTS ══════════════════════════════════
function calculateVacatedSettlement(){
  const deposit=Number(document.getElementById('vac-deposit')?.value)||0;
  const parkingDeposit=Number(document.getElementById('vac-parking-deposit')?.value)||0;
  const advance=Number(document.getElementById('vac-advance')?.value)||0;
  const damage=Math.max(0,Number(document.getElementById('vac-damage')?.value)||0);
  const unpaid=Math.max(0,Number(document.getElementById('vac-unpaid-rent')?.value)||0);
  const funds=deposit+parkingDeposit+advance;
  const deductions=Math.min(funds,damage+unpaid);
  const refund=Math.max(0,funds-deductions);
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=fmtINR(v);};
  set('vac-total-funds',funds);set('vac-total-deductions',deductions);set('vac-refund-value',refund);
}
function openVacatedModal(id){
  const o=occupants.find(x=>x.id===id);
  if(!o){alert('The selected occupant could not be found. Refresh and try again.');return;}
  const occupiedCabins=(o.cabins||[]).filter(cid=>{const c=cabins.find(x=>x.id===cid);return c && c.occupantId===o.id;});
  if(!occupiedCabins.length){alert('The selected lease is no longer linked to the selected cabin(s). Please refresh before vacating.');return;}
  document.getElementById('vac-id').value=o.id;
  document.getElementById('vac-name').value=o.name||'';
  document.getElementById('vac-company').value=o.comp||'';
  document.getElementById('vac-cabins').value=occupiedCabins.join(', ');
  document.getElementById('vac-date').value=today();
  document.getElementById('vac-deposit').value=Number(o.deposit)||0;
  document.getElementById('vac-parking-deposit').value=parkingDepositFor(o);
  document.getElementById('vac-advance').value=Number(o.advance)||0;
  document.getElementById('vac-damage').value=0;
  document.getElementById('vac-unpaid-rent').value=0;
  document.getElementById('vac-refund-date').value=today();
  document.getElementById('vac-notes').value='';
  calculateVacatedSettlement();
  document.getElementById('vacatedModal').classList.add('open');
}
function closeVacatedModal(){document.getElementById('vacatedModal').classList.remove('open');}
async function confirmVacateClient(){
  const id=document.getElementById('vac-id').value;
  const o=occupants.find(x=>x.id===id);
  if(!o){alert('Occupant record not found. No changes were made.');return;}
  const cabinsToVacate=(o.cabins||[]).filter(cid=>{const c=cabins.find(x=>x.id===cid);return c && c.occupantId===o.id;});
  if(!cabinsToVacate.length){alert('No matching occupied cabin/seat was found for this lease. No changes were made.');return;}
  const vacDate=document.getElementById('vac-date').value;
  const refundDate=document.getElementById('vac-refund-date').value;
  if(!vacDate){alert('Date of Vacating is required.');return;}
  if(!refundDate){alert('Date of Refund / Settlement is required.');return;}
  const deposit=Math.max(0,Number(document.getElementById('vac-deposit').value)||0);
  const parkingDeposit=Math.max(0,Number(document.getElementById('vac-parking-deposit').value)||0);
  const advance=Math.max(0,Number(document.getElementById('vac-advance').value)||0);
  const damage=Math.max(0,Number(document.getElementById('vac-damage').value)||0);
  const unpaidRent=Math.max(0,Number(document.getElementById('vac-unpaid-rent').value)||0);
  const totalFunds=deposit+parkingDeposit+advance;
  const totalDeductions=Math.min(totalFunds,damage+unpaidRent);
  const finalRefund=Math.max(0,totalFunds-totalDeductions);
  const record=Object.assign({},o,{
    vacatedAt:vacDate,
    settlementDate:refundDate,
    vacatedCabins:cabinsToVacate,
    vacatedStatus:'Vacated',
    securityDepositAtVacating:deposit,
    parkingDepositAtVacating:parkingDeposit,
    advanceAtVacating:advance,
    depositSettlement:document.getElementById('vac-deposit-action').value,
    parkingDepositSettlement:document.getElementById('vac-parking-deposit-action').value,
    advanceSettlement:document.getElementById('vac-advance-action').value,
    damageDeduction:damage,
    unpaidRentDeduction:unpaidRent,
    totalClientFunds:totalFunds,
    totalDeductions:totalDeductions,
    finalRefund:finalRefund,
    vacatingNotes:(document.getElementById('vac-notes').value||'').trim(),
    vacatedRecordId:'VAC-'+Date.now()
  });
  if(!confirm('Confirm vacancy for '+o.name+' in '+cabinsToVacate.join(', ')+'? Historical lease and payment records will be retained.')) return;
  const nextOccupants=occupants.filter(x=>x.id!==o.id);
  const nextCabins=cabins.map(c=>cabinsToVacate.includes(c.id)?Object.assign({},c,{occupied:false,occupantId:null,occupantName:null}):c);
  const historyOk=await syncToSheet('vacated_clients',[...vacatedClients,record]);
  if(!historyOk){alert('Vacated history could not be saved to Google Sheets. The active lease was not changed.');return;}
  const [occupantsOk,cabinsOk]=await Promise.all([syncToSheet('occupants',nextOccupants),syncToSheet('cabins',nextCabins)]);
  if(!occupantsOk || !cabinsOk){alert('Vacancy history was saved, but the active occupancy update could not be completed. Please do not retry blindly; refresh and verify the occupant/cabin state.');return;}
  vacatedClients.push(record);
  occupants=nextOccupants;
  cabins=nextCabins;
  closeVacatedModal();refreshAll();
  alert('Vacancy saved. The historical lease and payment records remain available in Vacated Clients.');
}
async function saveVacatedClientEdit(){
  const id=document.getElementById('vce-id').value;
  const ix=vacatedClients.findIndex(v=>String(v.vacatedRecordId||v.id)===String(id));
  if(ix<0){alert('Vacated client record not found.');return;}
  const previous={...vacatedClients[ix]};
  const deposit=Math.max(0,Number(document.getElementById('vce-deposit').value)||0);
  const parkingDeposit=Math.max(0,Number(document.getElementById('vce-parking-deposit').value)||0);
  const advance=Math.max(0,Number(document.getElementById('vce-advance').value)||0);
  const damage=Math.max(0,Number(document.getElementById('vce-damage').value)||0);
  const unpaid=Math.max(0,Number(document.getElementById('vce-unpaid-rent').value)||0);
  const totalFunds=deposit+parkingDeposit+advance;
  const totalDeductions=Math.min(totalFunds,damage+unpaid);
  const finalRefund=Math.max(0,totalFunds-totalDeductions);
  vacatedClients[ix]=Object.assign({},vacatedClients[ix],{
    name:document.getElementById('vce-name').value.trim(),
    comp:document.getElementById('vce-company').value.trim(),
    vacatedCabins:document.getElementById('vce-cabins').value.split(',').map(x=>x.trim()).filter(Boolean),
    start:document.getElementById('vce-start').value,
    end:document.getElementById('vce-end').value,
    vacatedAt:document.getElementById('vce-date').value,
    settlementDate:document.getElementById('vce-refund-date').value,
    securityDepositAtVacating:deposit,
    parkingDepositAtVacating:parkingDeposit,
    advanceAtVacating:advance,
    depositSettlement:document.getElementById('vce-deposit-action').value,
    parkingDepositSettlement:document.getElementById('vce-parking-deposit-action').value,
    advanceSettlement:document.getElementById('vce-advance-action').value,
    damageDeduction:damage,unpaidRentDeduction:unpaid,
    totalClientFunds:totalFunds,totalDeductions,finalRefund,
    vacatingNotes:document.getElementById('vce-notes').value.trim()
  });
  try{
    await saveVacatedClients({throwOnFailure:true});
    closeVacatedEditModal();renderVacatedClients();
    alert('Vacated client updated successfully.');
  }catch(e){
    vacatedClients[ix]=previous;
    alert(e.message||'Unable to update the vacated client.');
  }
}
function openVacatedEditModal(id){
  const v=vacatedClients.find(x=>String(x.vacatedRecordId||x.id)===String(id));
  if(!v){alert('Vacated client record not found.');return;}
  document.getElementById('vce-id').value=v.vacatedRecordId||v.id;
  document.getElementById('vce-name').value=v.name||'';
  document.getElementById('vce-company').value=v.comp||'';
  document.getElementById('vce-cabins').value=(v.vacatedCabins||v.cabins||[]).join(', ');
  document.getElementById('vce-start').value=v.start||'';
  document.getElementById('vce-end').value=v.end||'';
  document.getElementById('vce-date').value=v.vacatedAt||'';
  document.getElementById('vce-refund-date').value=v.settlementDate||'';
  document.getElementById('vce-deposit').value=Number(v.securityDepositAtVacating??v.deposit)||0;
  document.getElementById('vce-parking-deposit').value=Number(v.parkingDepositAtVacating??v.parkingDeposit)||0;
  document.getElementById('vce-advance').value=Number(v.advanceAtVacating??v.advance)||0;
  document.getElementById('vce-deposit-action').value=v.depositSettlement||'Refund';
  document.getElementById('vce-parking-deposit-action').value=v.parkingDepositSettlement||'Refund';
  document.getElementById('vce-advance-action').value=v.advanceSettlement||'Refund';
  document.getElementById('vce-damage').value=Number(v.damageDeduction)||0;
  document.getElementById('vce-unpaid-rent').value=Number(v.unpaidRentDeduction)||0;
  document.getElementById('vce-notes').value=v.vacatingNotes||'';
  document.getElementById('vacatedEditModal').classList.add('open');
}
function closeVacatedEditModal(){document.getElementById('vacatedEditModal').classList.remove('open');}
function renderVacatedClients(){
  const q=(document.getElementById('vac-search')?.value||'').toLowerCase();
  const rows=vacatedClients.filter(v=>String(v.name||'').toLowerCase().includes(q)||String(v.comp||'').toLowerCase().includes(q)||String((v.vacatedCabins||v.cabins||[]).join(',')).toLowerCase().includes(q));
  const body=document.getElementById('vac-body'),empty=document.getElementById('vac-empty');if(!body)return;
  const funds=rows.reduce((s,v)=>s+(Number(v.totalClientFunds)||0),0);
  const ded=rows.reduce((s,v)=>s+(Number(v.totalDeductions)||0),0);
  const refund=rows.reduce((s,v)=>s+(Number(v.finalRefund)||0),0);
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=typeof v==='number'?fmtINR(v):String(v);};
  set('vac-count',rows.length);set('vac-funds',funds);set('vac-deductions',ded);set('vac-refunded',refund);
  if(!rows.length){body.innerHTML='';if(empty)empty.style.display='block';return;} if(empty)empty.style.display='none';
  body.innerHTML=[...rows].sort((a,b)=>String(b.vacatedAt||'').localeCompare(String(a.vacatedAt||''))).map(v=>`<tr><td><div class="occ-main">${esc(v.name||'—')}</div><span class="occ-sub">${esc(v.comp||'—')}</span></td><td>${esc((v.vacatedCabins||v.cabins||[]).join(', '))}</td><td>${fmtDate(v.start)}<span class="occ-sub">End ${fmtDate(v.end)}</span></td><td>${fmtDate(v.vacatedAt)}</td><td class="num-col">${fmtINR(v.securityDepositAtVacating||v.deposit||0)}<span class="occ-sub">Security</span></td><td class="num-col">${fmtINR(v.parkingDepositAtVacating||v.parkingDeposit||0)}</td><td class="num-col">${fmtINR(v.advanceAtVacating||v.advance||0)}</td><td class="num-col">${fmtINR(v.damageDeduction||0)}</td><td class="num-col">${fmtINR(v.unpaidRentDeduction||0)}</td><td class="num-col">${fmtINR(v.totalClientFunds||0)}</td><td class="num-col">${fmtINR(v.totalDeductions||0)}</td><td class="num-col"><strong>${fmtINR(v.finalRefund||0)}</strong></td><td><button class="btn btn-sm" onclick="openVacatedEditModal('${esc(v.vacatedRecordId||v.id||'')}')">Edit</button></td></tr>`).join('');
}

// ══════════════════════════════════ VIRTUAL OFFICE ══════════════════════════════════
function amenityLinesToText(items){return (items||[]).map(x=>x.name+' | '+(x.amount||0)).join('\n');}
function renderVoAgreementDates(){
  const startEl=document.getElementById('vo-start'), endEl=document.getElementById('vo-end');
  const label=document.getElementById('vo-start-ddmmyyyy');
  const start=startEl?.value||'';
  if(label) label.textContent=start?formatDateDDMMYYYY(start):'DD/MM/YYYY';
  if(!start||!endEl)return;
  // Virtual Office uses the CRM's existing 11-month agreement convention.
  const dt=new Date(start+'T00:00:00');
  if(Number.isNaN(dt.getTime()))return;
  const calculated=addMonthsPreserveDay(dt,11);
  endEl.value=localDateKey(calculated);
}
function parseAmenityText(text){return (text||'').split('\n').map(x=>x.trim()).filter(Boolean).map(x=>{const a=x.split('|');return {name:(a[0]||'').trim(),amount:parseFloat((a[1]||'0').replace(/,/g,''))||0};});}
function virtualOfficeYearlyTotal(v){return (v.rent||0)+(v.amenities||[]).reduce((s,a)=>s+(a.amount||0),0)+((v.parking||0)*PARKING_RATE*12);}
function openVirtualOfficeModal(id) {
  try {
    const modal = document.getElementById('virtualOfficeModal');

    if (!modal) {
      console.error('Virtual Office modal not found');
      alert('Virtual Office window could not be opened. Please refresh the page.');
      return;
    }

    const v = id ? virtualOffice.find(x => x.id === id) : null;

    const setValue = (elementId, value) => {
      const el = document.getElementById(elementId);
      if (el) el.value = value ?? '';
    };

    const title = document.getElementById('vo-modal-title');
    if (title) {
      title.textContent = v
        ? 'Edit Virtual Office Client'
        : 'New Virtual Office Client';
    }

    setValue('vo-id', v ? v.id : '');
    setValue('vo-name', v ? v.name : '');
    setValue('vo-company', v ? v.company : '');
    setValue('vo-email', v ? v.email : '');
    setValue('vo-phone', v ? v.phone : '');
    setValue('vo-address', v ? v.address : '');
    setValue('vo-gstin', v ? v.gstin : '');
    setValue('vo-start', v ? v.start : '');
    setValue('vo-end', v ? v.end : '');
    setValue('vo-rent', v ? v.rent : '');
    setValue('vo-deposit', v ? v.deposit : '');
    setValue('vo-advance', v ? v.advance : '');
    setValue('vo-parking', v ? v.parking : 0);
    setValue('vo-parking-date', v ? v.parkingDate : '');
    setValue(
      'vo-amenities',
      v ? amenityLinesToText(v.amenities || []) : ''
    );

    modal.classList.add('open');

    if (typeof renderVoAgreementDates === 'function') {
      renderVoAgreementDates();
    }

    console.log('Virtual Office modal opened successfully');

  } catch (error) {
    console.error('openVirtualOfficeModal error:', error);
    alert('Unable to open Virtual Office. Please refresh the page and try again.');
  }
}function closeVirtualOfficeModal(){document.getElementById('virtualOfficeModal').classList.remove('open');}
// NOTE: this used to be named saveVirtualOffice(), same as the sheet-sync function below.
// That name collision meant this definition (declared later) silently replaced the sync
// function, and the saveVirtualOffice() call at the end of this function just called itself
// forever instead of persisting to Google Sheets -- which is why Virtual Office data never saved.
async function saveVirtualOfficeClient(){
  const id=document.getElementById('vo-id').value||'vo-'+Date.now(),name=document.getElementById('vo-name').value.trim(),start=document.getElementById('vo-start').value,end=document.getElementById('vo-end').value;
  if(!name){alert('Contact name is required.');return;}if(!start){alert('Agreement start date is required.');return;}if(end&&end<start){alert('Agreement end date cannot be before start date.');return;}
  const data={id,name,company:document.getElementById('vo-company').value.trim(),email:document.getElementById('vo-email').value.trim(),phone:document.getElementById('vo-phone').value.trim(),address:document.getElementById('vo-address').value.trim(),gstin:document.getElementById('vo-gstin').value.trim(),start,end,rent:parseFloat(document.getElementById('vo-rent').value)||0,deposit:parseFloat(document.getElementById('vo-deposit').value)||0,advance:parseFloat(document.getElementById('vo-advance').value)||0,parking:parseInt(document.getElementById('vo-parking').value)||0,parkingDate:document.getElementById('vo-parking-date').value||'',amenities:parseAmenityText(document.getElementById('vo-amenities').value)};
  const ix=virtualOffice.findIndex(x=>x.id===id),previous=ix>=0?{...virtualOffice[ix]}:null;
  if(ix>=0)virtualOffice[ix]=Object.assign({},virtualOffice[ix],data);else virtualOffice.push(data);
  try{
    await saveVirtualOffice({throwOnFailure:true});
    closeVirtualOfficeModal();refreshAll();
    alert(ix>=0?'Virtual Office client updated successfully.':'Virtual Office client saved successfully.');
  }catch(e){
    if(ix>=0)virtualOffice[ix]=previous;else virtualOffice=virtualOffice.filter(x=>x.id!==id);
    alert(e.message||'Unable to save Virtual Office client. Please try again.');
  }
}
function deleteVirtualOffice(id){if(!confirm('Remove this virtual-office client?'))return;virtualOffice=virtualOffice.filter(x=>x.id!==id);saveVirtualOffice();refreshAll();}
function renderVirtualOffice(){
  const q=(document.getElementById('vo-search')?.value||'').toLowerCase(),list=virtualOffice.filter(v=>(v.name||'').toLowerCase().includes(q)||(v.company||'').toLowerCase().includes(q));
  const active=virtualOffice.filter(v=>!v.end||getDaysFromToday(v.end)>=0);document.getElementById('vo-summary-active').textContent=active.length;document.getElementById('vo-summary-rent').textContent=fmtINR(active.reduce((s,v)=>s+virtualOfficeYearlyTotal(v),0));document.getElementById('vo-summary-expiring').textContent=virtualOffice.filter(v=>v.end&&getDaysFromToday(v.end)>=0&&getDaysFromToday(v.end)<=30).length;document.getElementById('vo-summary-total').textContent=virtualOffice.length;
  const grid=document.getElementById('virtual-office-grid'),empty=document.getElementById('virtual-office-empty');if(!list.length){grid.innerHTML='';empty.style.display='block';return;}empty.style.display='none';
  grid.innerHTML=list.map(v=>{const status=v.end&&getDaysFromToday(v.end)<0?'<span class="status-pill status-expired">Expired</span>':v.end&&getDaysFromToday(v.end)<=30?'<span class="status-pill status-expiring">Renewal soon</span>':'<span class="status-pill status-active">Active</span>';const parkingLine=(v.parking||0)>0?`${v.parking} slot(s)${v.parkingDate?' from '+fmtDate(v.parkingDate):''}`:'None';return `<div class="virtual-card"><div class="virtual-card-head"><div><div class="virtual-card-name">${esc(v.name)}</div><div class="virtual-card-company">${esc(v.company||'Virtual Office Client')}</div></div><span class="virtual-badge">VIRTUAL OFFICE</span></div><div style="margin-bottom:10px">${status}</div><div class="virtual-meta"><div class="virtual-meta-item"><div class="virtual-meta-label">Agreement</div><div class="virtual-meta-value">${fmtDate(v.start)} → ${fmtDate(v.end)}</div></div><div class="virtual-meta-item"><div class="virtual-meta-label">Yearly Billing</div><div class="virtual-meta-value" style="color:var(--gold)">${fmtINR(virtualOfficeYearlyTotal(v))}</div></div><div class="virtual-meta-item"><div class="virtual-meta-label">Deposit / Advance</div><div class="virtual-meta-value">${fmtINR(v.deposit||0)} / ${fmtINR(v.advance||0)}</div></div><div class="virtual-meta-item"><div class="virtual-meta-label">Contact</div><div class="virtual-meta-value">${esc(v.phone||v.email||'—')}</div></div><div class="virtual-meta-item"><div class="virtual-meta-label">Amenities</div><div class="virtual-meta-value">${(v.amenities||[]).length} item(s)</div></div><div class="virtual-meta-item"><div class="virtual-meta-label">Car Parking</div><div class="virtual-meta-value">${parkingLine}</div></div></div><div class="row-actions" style="margin-top:12px"><button class="btn btn-sm" onclick="openVirtualOfficeModal('${v.id}')">Edit</button><button class="btn btn-sm" onclick="createInvoiceForVirtualOffice('${v.id}')">Create Invoice</button><button class="btn btn-sm btn-danger" onclick="deleteVirtualOffice('${v.id}')">Remove</button></div></div>`}).join('');
}
function createInvoiceForVirtualOffice(id){const v=virtualOffice.find(x=>x.id===id);if(!v)return;openInvoiceModal(null);document.getElementById('inv-buyer-name').value=v.company||v.name;document.getElementById('inv-buyer-addr').value=v.address||'';document.getElementById('inv-buyer-gst').value=v.gstin||'';document.getElementById('inv-buyer-contact').value=v.name;document.getElementById('inv-buyer-phone').value=v.phone||'';document.getElementById('inv-agreement').value='AGREEMENT DATED '+fmtDateDDMMYY(v.start);document.getElementById('inv-items-body').innerHTML='';addInvoiceItemRow({desc:'Virtual Office Yearly Fee',hsn:'997212',gstRate:18,qty:1,rate:v.rent||0,per:'Year',amount:v.rent||0});(v.amenities||[]).forEach(a=>addInvoiceItemRow({desc:a.name,hsn:'997212',gstRate:18,qty:1,rate:a.amount,per:'Year',amount:a.amount}));if((v.parking||0)>0)addInvoiceItemRow({desc:'Car Parking'+(v.parkingDate?' (from '+fmtDateDDMMYY(v.parkingDate)+')':''),hsn:'',gstRate:18,qty:v.parking,rate:PARKING_RATE*12,per:'Year',amount:v.parking*PARKING_RATE*12});renumberInvoiceRows();recalcInvoiceTotals();}


// ══════════════════════════════════ USAGE & BOOKINGS ══════════════════════════════════
const BOOKING_TYPES=['Day Pass','Conference Room Usage','Event Hall Usage'];
const BOOKING_STATUSES=['BOOKED','CONFIRMED','COMPLETED','CANCELLED','NO-SHOW'];
function bookingStatusLabel(s){const x=String(s||'BOOKED').toUpperCase();return x;}
function normalizeBookingStatus(s){const x=String(s||'BOOKED').toUpperCase();return x==='UPCOMING'?'BOOKED':x==='ONGOING'?'CONFIRMED':x;}
function openUsageModal(id){
 const b=id?confBookings.find(x=>x.id===id):null;
 document.getElementById('usage-modal-title').textContent=b?'Edit Booking':'New Booking';
 document.getElementById('ub-id').value=b?b.id:'';
 document.getElementById('ub-type').value=b?.type||'Day Pass';
 document.getElementById('ub-status').value=b?normalizeBookingStatus(b.status):'BOOKED';
 document.getElementById('ub-customer').value=b?.customer||'';document.getElementById('ub-contact').value=b?.contact||'';
 document.getElementById('ub-mobile').value=b?.phone||'';document.getElementById('ub-email').value=b?.email||'';
 document.getElementById('ub-date').value=b?.date||b?.startDate||today();document.getElementById('ub-start-date').value=b?.startDate||b?.date||today();document.getElementById('ub-end-date').value=b?.endDate||b?.startDate||b?.date||today();document.getElementById('ub-people').value=b?.people||1;
 document.getElementById('ub-start').value=b?.startTime||'';document.getElementById('ub-end').value=b?.endTime||'';document.getElementById('ub-space').value=b?.space||'';
 document.getElementById('ub-amount').value=b?.amount||0;document.getElementById('ub-paystatus').value=b?.paymentStatus||'Pending';
 document.getElementById('ub-paymethod').value=b?.paymentMethod||'UPI';document.getElementById('ub-notes').value=b?.notes||'';
 document.getElementById('ub-delete-btn').style.display=b?'inline-block':'none';onUsageTypeChange();document.getElementById('usageModal').classList.add('open');
}
function closeUsageModal(){document.getElementById('usageModal').classList.remove('open');}
function onUsageTypeChange(){
 const type=document.getElementById('ub-type')?.value||'Day Pass';
 const time=document.getElementById('ub-time-group'),space=document.getElementById('ub-space-group');
 if(time)time.style.display='';if(space)space.style.display='';
 const label=document.getElementById('ub-space-label');if(label)label.textContent=type==='Day Pass'?'Space / Pass Type':type==='Conference Room Usage'?'Conference Room':'Event Hall';
 document.getElementById('ub-paymethod-group').style.display=(document.getElementById('ub-paystatus').value==='Paid')?'block':'none';
}
document.addEventListener('change',e=>{if(e.target?.id==='ub-paystatus')onUsageTypeChange();});
async function saveUsageRecord(){
 const statusEl=document.getElementById('ub-save-status');
 if(statusEl){statusEl.textContent='';statusEl.className='save-status';}
 const id=document.getElementById('ub-id').value||'BOOK-'+Date.now();
 const customer=document.getElementById('ub-customer').value.trim();
 const date=document.getElementById('ub-date').value;
 if(!customer){alert('Customer / Company name is required.');return;}
 if(!date){alert('Booking date is required.');return;}
 const start=document.getElementById('ub-start').value,end=document.getElementById('ub-end').value;
 if(start&&end&&end<=start){alert('End time must be after start time.');return;}
 const amount=Math.max(0,parseFloat(document.getElementById('ub-amount').value)||0);
 const data={id,bookingId:id,customer,company:customer,startDate,endDate,contact:document.getElementById('ub-contact').value.trim(),phone:document.getElementById('ub-mobile').value.trim(),email:document.getElementById('ub-email').value.trim(),type:document.getElementById('ub-type').value,date,startTime:start,endTime:end,people:Math.max(1,parseInt(document.getElementById('ub-people').value)||1),space:document.getElementById('ub-space').value.trim(),amount,gstRate:18,gstAmount:Math.round(amount*18)/100,totalAmount:Math.round(amount*1.18*100)/100,paymentStatus:document.getElementById('ub-paystatus').value,paymentMethod:document.getElementById('ub-paymethod').value,status:normalizeBookingStatus(document.getElementById('ub-status').value),notes:document.getElementById('ub-notes').value.trim(),updatedAt:new Date().toISOString()};
 const ix=confBookings.findIndex(x=>x.id===id);
 const previous=ix>=0 ? {...confBookings[ix]} : null;
 if(ix>=0) confBookings[ix]=Object.assign({},confBookings[ix],data);
 else {data.createdAt=new Date().toISOString();confBookings.push(data);}
 try{
   await saveBookings({throwOnFailure:true});
   closeUsageModal();
   refreshAll();
   alert(ix>=0?'Booking updated successfully.':'Booking saved successfully.');
 }catch(e){
   if(ix>=0) confBookings[ix]=previous; else confBookings=confBookings.filter(x=>x.id!==id);
   if(statusEl){statusEl.textContent=e.message||'Unable to save booking.';statusEl.className='save-status error';}
   alert(e.message||'Unable to save booking. Please try again.');
 }
}
function deleteUsageRecord(id){if(!id)return;if(!confirm('Delete this booking?'))return;confBookings=confBookings.filter(x=>x.id!==id);saveBookings();refreshAll();}
function renderUsagePage(){
 const q=(document.getElementById('usage-search')?.value||'').toLowerCase(),tf=document.getElementById('usage-type-filter')?.value||'all';
 const todayKey=today();let list=confBookings.slice();if(q)list=list.filter(b=>[b.customer,b.company,b.contact,b.phone,b.email,b.space].some(v=>String(v||'').toLowerCase().includes(q)));if(tf!=='all')list=list.filter(b=>b.type===tf);
 const upcoming=list.filter(b=>b.date>todayKey&&b.status!=='CANCELLED'&&b.status!=='COMPLETED'&&b.status!=='NO-SHOW').length,todayCount=list.filter(b=>b.date===todayKey&&b.status!=='CANCELLED'&&b.status!=='NO-SHOW').length,completed=list.filter(b=>b.status==='COMPLETED').length,pending=list.filter(b=>b.paymentStatus!=='Paid'&&b.status!=='CANCELLED').length,revenue=list.filter(b=>b.status!=='CANCELLED').reduce((s,b)=>s+Number(b.totalAmount??b.amount??0),0);
 document.getElementById('ub-sum-today').textContent=todayCount;document.getElementById('ub-sum-upcoming').textContent=upcoming;document.getElementById('ub-sum-completed').textContent=completed;document.getElementById('ub-sum-pending').textContent=pending;document.getElementById('ub-sum-revenue').textContent=fmtINR(revenue);
 const body=document.getElementById('usage-body'),empty=document.getElementById('usage-empty');if(!list.length){body.innerHTML='';empty.style.display='block';return;}empty.style.display='none';
 body.innerHTML=[...list].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(b=>`<tr><td>${fmtDate(b.startDate||b.date)}${b.endDate&&b.endDate!==(b.startDate||b.date)?`<div class="occ-sub">to ${fmtDate(b.endDate)}</div>`:''}</td><td>${esc(b.type||'—')}</td><td><div class="occ-main">${esc(b.customer||'—')}</div><span class="occ-sub">${esc(b.contact||b.phone||'')}</span></td><td>${esc(b.space||'—')}</td><td>${esc((b.startTime||'')+(b.endTime?' – '+b.endTime:''))||'—'}</td><td>${b.people||1}</td><td>${fmtINR(b.totalAmount??b.amount??0)}</td><td>${esc(b.paymentStatus||'Pending')}</td><td>${esc(bookingStatusLabel(b.status))}</td><td><div class="row-actions"><button class="btn btn-sm" onclick="openUsageModal('${b.id}')">Edit</button></div></td></tr>`).join('');
}

// ══════════════════════════════════ PAYMENT EDITING ══════════════════════════════════
function paymentAmenityText(p){return (p.amenities||[]).map(a=>a.name+' | '+Number(a.amount||0)).join('\n');}
function renderPeTotal(){
 const base=Math.max(0,parseFloat(document.getElementById('pe-amount')?.value)||0);
 const rows=[...document.querySelectorAll('#pe-amenities-rows .pe-amenity-row')];
 const amenities=rows.reduce((sum,row)=>sum+(Math.max(0,parseFloat(row.querySelector('.pe-amenity-amount')?.value)||0)),0);
 const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=fmtINR(value);};
 set('pe-total-base',base);set('pe-total-amenities',amenities);set('pe-total-all',base+amenities);
}
function addPeAmenityRow(item={name:'',amount:0}){
 const container=document.getElementById('pe-amenities-rows');if(!container)return;
 const row=document.createElement('div');row.className='pe-amenity-row';
 row.innerHTML=`<input class="form-input pe-amenity-name" placeholder="Amenity" value="${esc(item.name||'')}"><input class="form-input pe-amenity-amount" type="number" min="0" step="0.01" placeholder="0" value="${Number(item.amount||0)}"><button type="button" class="btn btn-sm" aria-label="Remove amenity">✕</button>`;
 row.querySelector('.pe-amenity-amount').addEventListener('input',renderPeTotal);
 row.querySelector('button').addEventListener('click',()=>{row.remove();renderPeTotal();});
 container.appendChild(row);renderPeTotal();
}
function openPaymentEditModal(id){
 const p=payments.find(x=>x.id===id);if(!p)return;
 const o=occupants.find(x=>x.id===p.occupantId)||vacatedClients.find(x=>x.id===p.occupantId);
 document.getElementById('pe-id').value=id;
 document.getElementById('pe-context').innerHTML=`<strong>${esc(o?o.name:'Unknown')}</strong><div class="section-note">${esc(o?.comp||'')} · ${esc(formatMonthLabel(p.month))}</div>`;
 document.getElementById('pe-amount').value=p.baseAmount ?? p.amountDue ?? 0;
 document.getElementById('pe-date').value=p.dueDate||today();
 document.getElementById('pe-notes').value=p.notes||'';
 const container=document.getElementById('pe-amenities-rows');if(container)container.innerHTML='';
 (Array.isArray(p.amenities)?p.amenities:[]).forEach(addPeAmenityRow);
 renderPeTotal();
 document.getElementById('paymentEditModal').classList.add('open');
}
function closePaymentEditModal(){document.getElementById('paymentEditModal').classList.remove('open');}
async function savePaymentEdit(){
 const id=document.getElementById('pe-id').value,p=payments.find(x=>x.id===id);if(!p)return;
 const statusEl=document.getElementById('pe-save-status');
 if(statusEl){statusEl.textContent='';statusEl.className='save-status';}
 const amount=parseFloat(document.getElementById('pe-amount').value);
 const dueDate=document.getElementById('pe-date').value;
 if(!Number.isFinite(amount)||amount<0){alert('Enter a valid payment amount.');return;}
 if(!dueDate){alert('Due date is required.');return;}
 const amenities=[...document.querySelectorAll('#pe-amenities-rows .pe-amenity-row')].map(row=>({name:row.querySelector('.pe-amenity-name')?.value.trim()||'',amount:Math.max(0,parseFloat(row.querySelector('.pe-amenity-amount')?.value)||0)})).filter(a=>a.name);
 const previous={...p,amenities:Array.isArray(p.amenities)?p.amenities.map(a=>({...a})):[]};
 p.baseAmount=amount;p.amountDue=amount+amenities.reduce((s,a)=>s+Number(a.amount||0),0);p.dueDate=dueDate;p.amenities=amenities;p.notes=document.getElementById('pe-notes').value.trim();p.editedAt=new Date().toISOString();
 try{
   await savePayments({throwOnFailure:true});
   closePaymentEditModal();
   refreshAll();
   alert('Payment updated successfully.');
 }catch(e){
   Object.assign(p,previous);
   if(statusEl){statusEl.textContent=e.message||'Unable to save payment.';statusEl.className='save-status error';}
   alert(e.message||'Unable to save payment. Please try again.');
 }
}

// ══════════════════════════════════ MAIL DRAFT HELPERS ══════════════════════════════════
function mailtoLink(to, subject, body){
  return 'mailto:'+encodeURIComponent(to||'')+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
}

// ══════════════════════════════════ EMAIL PREVIEW MODAL ══════════════════════════════════
let epState = { to:'', onSend:null };
function showEmailPreview(to, subject, body, opts){
  opts = opts || {};
  epState = { to: to||'', onSend: opts.onSend||null };
  document.getElementById('ep-title').textContent = opts.title || 'Preview Email';
  document.getElementById('ep-to').value = to || '(no email on file)';
  document.getElementById('ep-subject').value = subject || '';
  document.getElementById('ep-body').value = body || '';
  document.getElementById('ep-copy-note').textContent = '';
  document.getElementById('emailPreviewModal').classList.add('open');
}
function closeEmailPreview(){ document.getElementById('emailPreviewModal').classList.remove('open'); }
function copyEmailPreviewText(){
  const text = document.getElementById('ep-subject').value + '\n\n' + document.getElementById('ep-body').value;
  const note = document.getElementById('ep-copy-note');
  const done = ()=>{ note.textContent = '✓ Copied to clipboard'; setTimeout(()=>{ if(note.textContent==='✓ Copied to clipboard') note.textContent=''; }, 2500); };
  if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(text).then(done).catch(()=>{ note.textContent='Could not copy — select and copy manually.'; }); }
  else { note.textContent='Copy not supported in this browser — select and copy manually.'; }
}
function sendEmailPreview(){
  const subject = document.getElementById('ep-subject').value;
  const body = document.getElementById('ep-body').value;
  if(!epState.to){ if(!confirm('No email address is on file for this recipient. Open a blank draft anyway?')) return; }
  window.open(mailtoLink(epState.to, subject, body), '_blank');
  if(typeof epState.onSend === 'function') epState.onSend();
  closeEmailPreview();
}
function copyText(text){
  if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(text).then(()=>alert('Copied to clipboard.')).catch(()=>alert('Could not copy — please select and copy manually.')); }
  else alert('Clipboard not available in this browser.');
}

// ══════════════════════════════════ PAYMENTS LEDGER ══════════════════════════════════
function monthKey(d){ return d.toISOString().slice(0,7); }
function parseLocalDate(v){ return new Date(v+'T00:00:00'); }
function localDateKey(d){ const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0'); return y+'-'+m+'-'+day; }
function localMonthKey(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
function formatMonthLabel(v){return parseLocalDate(v+'-01').toLocaleDateString('en-IN',{month:'short',year:'numeric'});}
function addMonthsPreserveDay(date, months){const d=new Date(date);const day=d.getDate();const out=new Date(d.getFullYear(),d.getMonth()+months,1);const max=new Date(out.getFullYear(),out.getMonth()+1,0).getDate();out.setDate(Math.min(day,max));return out;}
function paymentBaseAmount(o){return (Number(o.rent)||0)+parkingRevenueFor(o);}
function ensurePaymentsGenerated(){
  const now = parseLocalDate(today());
  let paymentsChanged = false;

  occupants.forEach(o => {
    if(!o.start) return;

    const start = parseLocalDate(o.start);
    const end = o.end ? parseLocalDate(o.end) : null;

    // First payment is due on the 5th of the month after the lease starts.
    let cursor = new Date(
      start.getFullYear(),
      start.getMonth() + 1,
      5
    );

    let guard = 0;

    while(
      cursor <= now &&
      (!end || cursor <= end) &&
      guard++ < 120
    ){
      const mk = localMonthKey(cursor);

      const exists = payments.find(
        p => p.occupantId === o.id && p.month === mk
      );

      if(!exists){
        payments.push({
          id: 'pay-' + o.id + '-' + mk,
          occupantId: o.id,
          month: mk,
          amountDue: paymentBaseAmount(o),
          baseAmount: paymentBaseAmount(o),
          amenities: [],
          dueDate: localDateKey(cursor),
          paidDate: null,
          reminderSent: false,
          reminderDraftedAt: null,
          notes: ''
        });
        paymentsChanged = true;
      }

      // Every following payment is due on the 5th.
      cursor = new Date(
        cursor.getFullYear(),
        cursor.getMonth() + 1,
        5
      );
    }
  });

  if(paymentsChanged) savePayments();
}

function paymentStatus(p){
  // Google Sheets returns cells as strings. Legacy rows may contain literal
  // "null", "undefined", "false", or an empty paidDate for unpaid payments.
  const rawPaidDate = p?.paidDate;
  const hasPaidDate = rawPaidDate !== null &&
    rawPaidDate !== undefined &&
    !['','null','undefined','false','nan'].includes(String(rawPaidDate).trim().toLowerCase());
  if(hasPaidDate) return 'paid';

  const grace = new Date(p.dueDate);
  grace.setDate(grace.getDate()+5);
  return new Date(today()) > grace ? 'overdue' : 'due';
}
let payTabCurrent = 'all';
function payTab(tab, el){ payTabCurrent=tab; document.querySelectorAll('#page-payments .tab-bar .tab').forEach(t=>t.classList.remove('active')); if(el) el.classList.add('active'); renderPaymentsPage(); }
function renderPaymentsPage(){
  ensurePaymentsGenerated();
  initPaymentLinkField();
  const q = (document.getElementById('pay-search')?.value||'').toLowerCase();
  let list = payments.map(p=>({...p, occ:occupants.find(o=>o.id===p.occupantId) || vacatedClients.find(o=>o.id===p.occupantId)})).filter(p=>p.occ);
  if(q) list = list.filter(p=> p.occ.name.toLowerCase().includes(q) || (p.occ.comp||'').toLowerCase().includes(q));
  list.sort((a,b)=> b.dueDate.localeCompare(a.dueDate));
  const withStatus = list.map(p=>({...p, status:paymentStatus(p)}));
  if(payTabCurrent!=='all') { list = withStatus.filter(p=>p.status===payTabCurrent); } else { list = withStatus; }

  // "Paid This Month" is the total amount paid for the current payment month.
  // Always coerce the amount to a number because Google Sheets returns values as text.
  const currentMonth = localMonthKey(new Date());
  const paidThisMonth = withStatus.filter(p=>p.status==='paid' && p.month===currentMonth);
  const due = withStatus.filter(p=>p.status==='due');
  const overdue = withStatus.filter(p=>p.status==='overdue');
  const paidAll = withStatus.filter(p=>p.status==='paid');
  const paidThisMonthTotal = paidThisMonth.reduce((sum,p)=>sum+(Number(p.amountDue)||0),0);
  document.getElementById('pm-paid').textContent = fmtINR(paidThisMonthTotal);
  document.getElementById('pm-paid-sub').textContent = paidThisMonth.length+' invoice(s)';
  document.getElementById('pm-due').textContent = fmtINR(due.reduce((s,p)=>s+p.amountDue,0));
  document.getElementById('pm-due-sub').textContent = due.length+' invoice(s)';
  document.getElementById('pm-overdue').textContent = fmtINR(overdue.reduce((s,p)=>s+p.amountDue,0));
  document.getElementById('pm-overdue-sub').textContent = overdue.length+' invoice(s)';
  const rate = withStatus.length ? Math.round(paidAll.length/withStatus.length*100) : 0;
  document.getElementById('pm-rate').textContent = rate+'%';
  document.getElementById('due-count-nav').textContent = due.length+overdue.length;
  renderOutstandingReport(withStatus);

  const body = document.getElementById('payments-body');
  const empty = document.getElementById('payments-empty');
  if(!list.length){ body.innerHTML=''; empty.style.display='block'; return; }
  empty.style.display='none';
  const pillCls = {paid:'status-paid', due:'status-due', overdue:'status-overdue'};
  const pillTxt = {paid:'Paid', due:'Due', overdue:'Overdue'};
  body.innerHTML = list.map(p=>`
    <tr>
      <td>${esc(p.occ.name)}<br><small style="color:var(--text3)">${esc(p.occ.comp||'')}</small></td>
      <td style="font-size:12px;">${esc(p.occ.cabins.join(', '))}</td>
      <td>${esc(p.month)}</td>
      <td>₹${p.amountDue.toLocaleString('en-IN')}</td>
      <td style="font-size:12px;color:var(--text3)">${fmtDate(p.dueDate)}</td>
      <td><span class="status-pill ${pillCls[p.status]}">${pillTxt[p.status]}</span></td>
      <td style="font-size:11px;color:var(--text3);">${p.reminderDraftedAt ? 'Drafted '+fmtDate(p.reminderDraftedAt) : '—'}</td>
      <td><div class="row-actions">
        <button class="btn btn-sm" onclick="openPaymentEditModal('${p.id}')">✎ Edit</button>${p.status!=='paid' ? `<button class="btn btn-sm" onclick="markPaymentPaid('${p.id}')">Mark Paid</button>` : ''}
        ${p.status!=='paid' ? `<button class="btn btn-sm" onclick="draftPaymentReminder('${p.id}')">✉ Draft Reminder</button>` : ''}
      </div></td>
    </tr>`).join('');
}
function renderOutstandingReport(withStatus){
  const outstanding = withStatus.filter(p=>p.status!=='paid');
  const byOcc = {};
  outstanding.forEach(p=>{
    if(!byOcc[p.occ.id]) byOcc[p.occ.id] = { occ:p.occ, items:[], total:0, hasOverdue:false };
    byOcc[p.occ.id].items.push(p);
    byOcc[p.occ.id].total += p.amountDue;
    if(p.status==='overdue') byOcc[p.occ.id].hasOverdue = true;
  });
  let rows = Object.values(byOcc);
  rows.forEach(r=>{ r.items.sort((a,b)=>a.dueDate.localeCompare(b.dueDate)); r.oldestDue = r.items[0].dueDate; });
  rows.sort((a,b)=> (b.hasOverdue - a.hasOverdue) || (b.total - a.total));

  const summary = document.getElementById('outstanding-summary');
  const grandTotal = rows.reduce((s,r)=>s+r.total,0);
  summary.textContent = rows.length ? `${rows.length} occupant(s) with outstanding dues · Total outstanding: ${fmtINR(grandTotal)}` : '';

  const tbody = document.getElementById('outstanding-body');
  const empty = document.getElementById('outstanding-empty');
  if(!rows.length){ tbody.innerHTML=''; empty.style.display='block'; return; }
  empty.style.display='none';
  tbody.innerHTML = rows.map(r=>`
    <tr>
      <td>${esc(r.occ.name)}<br><small style="color:var(--text3)">${esc(r.occ.comp||'')}</small></td>
      <td style="font-size:12px;">${esc(r.occ.cabins.join(', '))}</td>
      <td style="font-size:11.5px;color:var(--text3);">${esc(r.occ.phone||'—')}${r.occ.email?'<br>'+esc(r.occ.email):''}</td>
      <td style="font-size:12px;">${esc(r.items.map(p=>p.month).join(', '))}</td>
      <td style="font-weight:600;color:${r.hasOverdue?'var(--coral)':'var(--amber)'}">₹${r.total.toLocaleString('en-IN')}</td>
      <td style="font-size:12px;color:var(--text3)">${fmtDate(r.oldestDue)}</td>
      <td><span class="status-pill ${r.hasOverdue?'status-overdue':'status-due'}">${r.hasOverdue?'Overdue':'Due'}</span></td>
      <td><button class="btn btn-sm" onclick="draftBulkPaymentReminder('${r.occ.id}')">✉ Preview &amp; Send</button></td>
    </tr>`).join('');
}
function exportOutstandingCSV(){
  ensurePaymentsGenerated();
  const rows = payments
    .map(p=>({...p, occ:occupants.find(o=>o.id===p.occupantId), status:paymentStatus(p)}))
    .filter(p=>p.occ && p.status!=='paid')
    .sort((a,b)=> (b.status==='overdue') - (a.status==='overdue') || a.dueDate.localeCompare(b.dueDate));
  if(!rows.length){ alert('No outstanding payments to export.'); return; }
  const csvEsc = v => `"${String(v==null?'':v).replace(/"/g,'""')}"`;
  const header = ['Occupant','Company','Cabin(s)','Phone','Email','Month','Amount Due (INR)','Due Date','Status','Days Overdue','Payment Link'];
  const lines = [header.map(csvEsc).join(',')];
  let total = 0;
  rows.forEach(p=>{
    const dl = daysLeft(p.dueDate);
    const daysOverdue = p.status==='overdue' ? Math.abs(dl) : 0;
    const link = buildPaymentLink(p.occ, p.amountDue, 'Rent '+p.month+' - '+p.occ.name);
    total += p.amountDue;
    lines.push([
      p.occ.name, p.occ.comp||'', p.occ.cabins.join('; '), p.occ.phone||'', p.occ.email||'',
      p.month, p.amountDue, p.dueDate, p.status==='overdue'?'Overdue':'Due', daysOverdue, link
    ].map(csvEsc).join(','));
  });
  lines.push(['','','','','','','','','','',''].map(csvEsc).join(','));
  lines.push(['TOTAL','','','','','',total,'','','',''].map(csvEsc).join(','));
  const blob = new Blob([lines.join('\n')], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'pending-payments-'+today()+'.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ══════════════════════════════════ REVENUE REPORT (detailed) ══════════════════════════════════
function exportRevenueReport(){
  if(typeof XLSX === 'undefined'){ alert('Excel library failed to load (no internet access?). Please check your connection and retry.'); return; }
  ensurePaymentsGenerated();
  const active = occupants.filter(o=>getStatus(o)!=='expired');
  const totalRent = active.reduce((s,o)=>s+(o.rent||0),0);
  const totalParkingUnits = active.reduce((s,o)=>s+(o.parking||0),0);
  const totalParkingRevenue = active.reduce((sum,o)=>sum+parkingRevenueFor(o),0);
  const totalSeats = cabins.reduce((s,c)=>s+(c.seater||0),0) || 213;
  const potentialFull = totalSeats*RATE_PER_SEAT;

  // Sheet 1: Summary
  const summaryRows = [
    { metric:'Report Generated', value: new Date().toLocaleString('en-IN') },
    { metric:'Current Monthly Revenue (rent only, excl. GST)', value: totalRent },
    { metric:'Parking Revenue (monthly, excl. GST)', value: totalParkingRevenue },
    { metric:'Total Monthly Revenue (rent + parking, excl. GST)', value: totalRent + totalParkingRevenue },
    { metric:'Annual Projected Revenue (at current occupancy)', value: (totalRent + totalParkingRevenue)*12 },
    { metric:'Potential Revenue at Full Occupancy (reference rate)', value: potentialFull },
    { metric:'Active Tenants', value: active.length },
    { metric:'Total Seats', value: totalSeats },
    { metric:'Occupied Cars (Parking)', value: totalParkingUnits }
  ];

  // Sheet 2: Revenue by Tenant
  const byTenantRows = active.map(o=>{
    const parkingCost = parkingRevenueFor(o);
    const total = (o.rent||0)+parkingCost;
    const pct = totalRent ? Math.round((o.rent||0)/totalRent*100) : 0;
    return {
      occupant:o.name, company:o.comp||'', cabins:(o.cabins||[]).join(', '),
      monthlyRent:o.rent||0, parkingUnits:o.parking||0, parkingRevenue:parkingCost,
      totalMonthly:total, shareOfRentPct:pct+'%', leaseStart:o.start||'', leaseEnd:o.end||'',
      escalationPct:(o.escalation||10)+'%', securityDeposit:o.deposit||0, advanceFee:o.advance||0
    };
  });
  byTenantRows.push({ occupant:'TOTAL', company:'', cabins:'', monthlyRent:totalRent, parkingUnits:totalParkingUnits, parkingRevenue:totalParkingRevenue, totalMonthly:totalRent+totalParkingRevenue, shareOfRentPct:'100%', leaseStart:'', leaseEnd:'', escalationPct:'', securityDeposit:'', advanceFee:'' });

  // Sheet 3: Payment Schedule (this month, all active)
  const scheduleRows = active.map(o=>{
    const parkingCost = parkingRevenueFor(o);
    return {
      occupant:o.name, company:o.comp||'', cabins:(o.cabins||[]).join(', '),
      monthlyRent:o.rent||0, parking:parkingCost, total:(o.rent||0)+parkingCost,
      dueDate:'1st of month', reminderSent: o.reminder_sent ? 'Yes' : 'No',
      phone:o.phone||'', email:o.email||''
    };
  });

  // Sheet 4: All Payments Ledger (every generated payment record, any status)
  const ledgerRows = payments.map(p=>{
    const occ = occupants.find(o=>o.id===p.occupantId);
    return {
      occupant: occ ? occ.name : p.occupantId, company: occ ? (occ.comp||'') : '',
      month:p.month, amountDue:p.amountDue, dueDate:p.dueDate,
      status: paymentStatus(p), paidDate:p.paidDate||'', reminderSent: p.reminderSent ? 'Yes':'No'
    };
  });

  // Sheet 5: Tariff Reference
  const tariffRows = [
    { term:'Monthly Fee (reference rate)', detail:'₹8,000 + GST per seat / month — individual occupant rent is editable' },
    { term:'Escalation', detail:'10% after 11 months, at renewal' },
    { term:'Security Deposit', detail:"3 months' fee (refundable, no interest)" },
    { term:'Advance Fee', detail:"1 month's fee (adjustable on exit)" },
    { term:'Lock-in Period', detail:'11 months from agreement date' },
    { term:'Notice Period', detail:'3 months before completion of lock-in' },
    { term:'Car Parking', detail:'₹5,000 + GST / car / month (first-come-first-served)' },
    { term:'Bike Parking', detail:'Free, first-come-first-served' },
    { term:'Conference Room', detail:'3 hrs/month free for 5-seater cabins & above' },
    { term:'Working Hours', detail:'Mon–Sat 9:00 AM–7:00 PM · 2nd Sat & Sun holiday' }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Summary');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(byTenantRows), 'Revenue by Tenant');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(scheduleRows), 'Payment Schedule');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ledgerRows), 'All Payments Ledger');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tariffRows), 'Tariff Reference');
  XLSX.writeFile(wb, 'collabor8-revenue-report-'+today()+'.xlsx');
}

// ══════════════════════════════════ EXCEL WORKBOOK SYNC ══════════════════════════════════
// ══════════════════════════════════ EXCEL IMPORT ══════════════════════════════════

function xBool(v){
  return v===true || v==='TRUE' || v==='true' || v===1 || v==='1';
}

function xStr(v){
  return v==null ? '' : String(v).trim();
}

function upsertById(arr, row, idPrefix){
  if(!row.id){
    row.id = idPrefix+'-'+Date.now()+'-'+Math.round(Math.random()*1000);
    return {arr:[...arr,row], added:true};
  }

  const idx = arr.findIndex(x=>x.id===row.id);

  if(idx===-1){
    return {arr:[...arr,row], added:true};
  }

  const merged = [...arr];
  merged[idx] = {...merged[idx], ...row};

  return {arr:merged, added:false};
}

/*
 * Convert dates commonly found in tax-invoice Excel files
 * into YYYY-MM-DD, which Collabor8 uses internally.
 */
function parseImportedInvoiceDate(value){

  if(value == null || value === '') {
    return today();
  }

  // Excel serial date
  if(typeof value === 'number' && typeof XLSX !== 'undefined'){
    try{
      const d = XLSX.SSF.parse_date_code(value);

      if(d && d.y && d.m && d.d){
        return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
      }
    }catch(e){}
  }

  const s = String(value).trim();

  // DD.MM.YYYY
  let m = s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);

  if(m){
    return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
  }

  // YYYY-MM-DD
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

  if(m){
    return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
  }

  const d = new Date(s);

  if(!isNaN(d.getTime())){
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  return today();
}

/*
 * Return the first useful value found after a label.
 */
function invoiceValueAfterLabel(rows, label){

  const target = String(label).toLowerCase();

  for(let r=0; r<rows.length; r++){

    const row = rows[r] || [];

    for(let c=0; c<row.length; c++){

      const cell = xStr(row[c]).toLowerCase();

      if(cell.includes(target)){

        // Look to the right on the same row
        for(let j=c+1; j<row.length; j++){
          const value = xStr(row[j]);

          if(value && !value.toLowerCase().includes(target)){
            return value;
          }
        }

        // Then look at the next two rows
        for(let rr=r+1; rr<=Math.min(r+2, rows.length-1); rr++){

          const next = rows[rr] || [];

          for(const value of next){
            const v = xStr(value);

            if(v && !v.toLowerCase().includes(target)){
              return v;
            }
          }
        }
      }
    }
  }

  return '';
}

/*
 * Parse a formatted COLLABOR8 / Tally-style Tax Invoice.
 *
 * Expected structure is similar to:
 *
 * TAX INVOICE
 * Invoice No.
 * Dated
 * Buyer (Bill to)
 * S.No | Description | HSN/SAC | GST Rate | Quantity | Rate | Per | Amount
 */
function parseTaxInvoiceSheet(ws){

  const rows = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: '',
    raw: true
  });

  if(!rows.length){
    throw new Error('Invoice sheet is empty.');
  }

  /*
   * Find the invoice item header.
   */
  let headerRow = -1;

  for(let i=0; i<rows.length; i++){

    const row = rows[i] || [];

    const text = row
      .map(xStr)
      .join(' ')
      .toLowerCase();

    if(
      text.includes('s.no') &&
      text.includes('description') &&
      text.includes('hsn/sac') &&
      text.includes('gst rate') &&
      text.includes('amount')
    ){
      headerRow = i;
      break;
    }
  }

  if(headerRow === -1){
    throw new Error(
      'This Excel file does not look like a Collabor8 tax invoice.'
    );
  }

  /*
   * Invoice number.
   */
  let invoiceNo = invoiceValueAfterLabel(rows, 'Invoice No.');

  if(!invoiceNo){
    invoiceNo = invoiceValueAfterLabel(rows, 'Invoice No');
  }

  /*
   * Invoice date.
   */
  let invoiceDate = invoiceValueAfterLabel(rows, 'Dated');

  /*
   * Agreement/reference.
   */
  let agreementRef = '';

  for(let i=0; i<rows.length; i++){

    const row = rows[i] || [];

    const text = row
      .map(xStr)
      .join(' ')
      .toLowerCase();

    if(text.includes('reference no. & date')){

      // Usually the reference is on the following row.
      const next = rows[i+1] || [];

      agreementRef = next
        .map(xStr)
        .find(v => /agreement/i.test(v)) || '';

      if(!agreementRef){
        agreementRef = next
          .map(xStr)
          .find(v => v) || '';
      }

      break;
    }
  }

  /*
   * Find Buyer (Bill to) block.
   */
  let buyerStart = -1;

  for(let i=0; i<rows.length; i++){

    const text = (rows[i] || [])
      .map(xStr)
      .join(' ')
      .toLowerCase();

    if(text.includes("buyer (bill to)")){
      buyerStart = i;
      break;
    }
  }

  let buyerName = '';
  let buyerAddr = '';
  let buyerGst = '';
  let buyerState = '';
  let buyerContact = '';
  let buyerPhone = '';

  if(buyerStart !== -1){

    const buyerLines = [];

    for(
      let i=buyerStart+1;
      i<Math.min(headerRow, buyerStart+15);
      i++
    ){

      const value = xStr((rows[i] || [])[0]);

      if(value){
        buyerLines.push(value);
      }
    }

    /*
     * GSTIN
     */
    const gstLine = buyerLines.find(
      x => /GSTIN\/UIN/i.test(x)
    );

    if(gstLine){
      const match = gstLine.match(/:\s*(.+)$/);
      buyerGst = match ? match[1].trim() : '';
    }

    /*
     * State
     */
    const stateLine = buyerLines.find(
      x => /^State Name/i.test(x)
    );

    if(stateLine){
      const match = stateLine.match(/:\s*(.+)$/);
      buyerState = match ? match[1].trim() : '';
    }

    /*
     * Contact person
     */
    const contactLine = buyerLines.find(
      x => /^Contact Person/i.test(x)
    );

    if(contactLine){
      const match = contactLine.match(/:\s*(.+)$/);
      buyerContact = match ? match[1].trim() : '';
    }

    /*
     * Phone
     */
    const phoneLine = buyerLines.find(
      x => /^Contact\s*:/i.test(x)
    );

    if(phoneLine){
      const match = phoneLine.match(/:\s*(.+)$/);
      buyerPhone = match ? match[1].trim() : '';
    }

    /*
     * Remove metadata lines to find name/address.
     */
    const plainBuyerLines = buyerLines.filter(
      x =>
        !/^GSTIN\/UIN/i.test(x) &&
        !/^State Name/i.test(x) &&
        !/^Contact Person/i.test(x) &&
        !/^Contact\s*:/i.test(x)
    );

    /*
     * The address is normally the line containing
     * a road/number/pincode.
     */
    let addressIndex = plainBuyerLines.findIndex(
      x =>
        /\d{5,6}/.test(x) ||
        /road|street|nagar|chennai|tower|floor/i.test(x)
    );

    if(addressIndex === -1 && plainBuyerLines.length > 1){
      addressIndex = plainBuyerLines.length - 1;
    }

    if(addressIndex >= 0){

      buyerName = plainBuyerLines
        .slice(0,addressIndex)
        .join(' ')
        .trim();

      buyerAddr = plainBuyerLines
        .slice(addressIndex)
        .join(' ')
        .trim();

    }else{

      buyerName = plainBuyerLines.join(' ').trim();
    }
  }

  /*
   * Find dispatched-through / destination.
   */
  let dispatchedThrough = '';
  let destination = '';

  for(let i=0; i<rows.length; i++){

    const row = rows[i] || [];

    const text = row
      .map(xStr)
      .join(' ')
      .toLowerCase();

    if(text.includes('dispatched through')){

      const dIndex = row.findIndex(
        x => /dispatched through/i.test(xStr(x))
      );

      const destIndex = row.findIndex(
        x => /destination/i.test(xStr(x))
      );

      if(dIndex >= 0){

        for(let c=dIndex+1; c<row.length; c++){

          const value = xStr(row[c]);

          if(value){
            dispatchedThrough = value;
            break;
          }
        }
      }

      if(destIndex >= 0){

        for(let c=destIndex+1; c<row.length; c++){

          const value = xStr(row[c]);

          if(value){
            destination = value;
            break;
          }
        }
      }

      break;
    }
  }

  /*
   * Parse invoice line items.
   */
  const items = [];

  let currentItem = null;

  for(let i=headerRow+1; i<rows.length; i++){

    const row = rows[i] || [];

    const first = xStr(row[0]);
    const desc = xStr(row[1]);

    const fullText = row
      .map(xStr)
      .join(' ')
      .toLowerCase();

    /*
     * Stop when tax totals begin.
     */
    if(
      fullText.includes('cgst') ||
      fullText.includes('sgst') ||
      fullText.includes('amount chargeable') ||
      fullText.includes('hsn/sac')
    ){
      if(
        fullText.includes('cgst') ||
        fullText.includes('sgst')
      ){
        break;
      }

      continue;
    }

    /*
     * New numbered invoice item.
     */
    if(/^\d+$/.test(first)){

      const rawGst = parseFloat(row[3]) || 0;

      const gstRate =
        rawGst > 0 && rawGst <= 1
          ? rawGst * 100
          : rawGst;

      const item = {
        desc: desc,
        hsn: xStr(row[2]),
        gstRate: gstRate || 18,
        qty: xStr(row[4]),
        rate: Number(row[5]) || 0,
        per: xStr(row[6]) || 'Nos',
        amount: Number(row[7]) || 0
      };

      items.push(item);
      currentItem = item;

      continue;
    }

    /*
     * Continuation text belongs to the previous item.
     */
    if(desc && currentItem){

      currentItem.desc =
        `${currentItem.desc} ${desc}`.trim();
    }
  }

  if(!items.length){
    throw new Error(
      'No invoice line items were found.'
    );
  }

  /*
   * Read CGST / SGST percentage.
   */
  let cgstPct = 0;
  let sgstPct = 0;

  for(let i=headerRow+1; i<rows.length; i++){

    const row = rows[i] || [];

    const text = row
      .map(xStr)
      .join(' ')
      .toLowerCase();

    if(text.includes('cgst')){

      for(const value of row){

        const n = Number(value);

        if(n > 0 && n <= 100){
          cgstPct = n;
          break;
        }
      }
    }

    if(text.includes('sgst')){

      for(const value of row){

        const n = Number(value);

        if(n > 0 && n <= 100){
          sgstPct = n;
          break;
        }
      }
    }
  }

  /*
   * If the invoice has item GST but no explicit
   * CGST/SGST percentages, default to half of the
   * common GST rate.
   */
  if(!cgstPct && !sgstPct){

    const firstRate =
      Number(items[0]?.gstRate) || 0;

    if(firstRate){
      cgstPct = firstRate / 2;
      sgstPct = firstRate / 2;
    }
  }

  /*
   * Create Collabor8 invoice object.
   */
  return {
    id: 'inv-' + Date.now() + '-' + Math.round(Math.random()*10000),

    invoiceNo:
      invoiceNo || nextInvoiceNo(parseImportedInvoiceDate(invoiceDate)),

    date:
      parseImportedInvoiceDate(invoiceDate),

    occupantId: null,

    buyer: {
      name: buyerName || 'Imported Customer',
      addr: buyerAddr,
      gstin: buyerGst,
      state: buyerState,
      contactPerson: buyerContact,
      contactPhone: buyerPhone
    },

    agreementRef,

    paymentTerm:
      invoiceValueAfterLabel(
        rows,
        'Mode/Term of Payment'
      ),

    otherRef:
      invoiceValueAfterLabel(
        rows,
        'Other References'
      ),

    dispatchedThrough,
    destination,

    items,

    cgstPct,
    sgstPct,

    notes: '',

    status: 'Draft',
    paymentStatus: 'Pending',

    createdAt: today(),
    sentAt: null,
    receivedAt: null,
    periodMonth: null
  };
}

/*
 * Add/update invoice using Invoice Number.
 */
function upsertImportedInvoice(inv){

  const existingIndex = invoices.findIndex(
    x =>
      String(x.invoiceNo || '').trim().toLowerCase() ===
      String(inv.invoiceNo || '').trim().toLowerCase()
  );

  if(existingIndex === -1){

    invoices.push(inv);

    return {
      added: true,
      updated: false
    };
  }

  /*
   * Preserve the existing Collabor8 ID and status.
   */
  const existing = invoices[existingIndex];

  invoices[existingIndex] = {
    ...existing,
    ...inv,
    id: existing.id,
    status: existing.status || inv.status || 'Draft',
    paymentStatus:
      existing.paymentStatus || inv.paymentStatus || 'Pending',
    updatedAt: today()
  };

  return {
    added: false,
    updated: true
  };
}

function importWorkbookFile(){

  if(typeof XLSX === 'undefined'){

    alert(
      'Excel library failed to load (no internet access?). Please check your connection and retry.'
    );

    return;
  }

  const fileInput =
    document.getElementById('import-xlsx-file');

  const file =
    fileInput.files && fileInput.files[0];

  const resultEl =
    document.getElementById('import-result');

  if(!file){

    resultEl.style.color = 'var(--coral)';
    resultEl.textContent =
      'Choose a .xlsx file first.';

    return;
  }

  if(
    !confirm(
      'Import will update matching records and add new records from this workbook. Continue?'
    )
  ){
    return;
  }

  const reader = new FileReader();

  reader.onload = function(e){

    try{

      const wb = XLSX.read(
        new Uint8Array(e.target.result),
        {
          type: 'array',
          cellDates: true
        }
      );

      let counts = {
        occupants: 0,
        cabins: 0,
        payments: 0,
        leads: 0,
        invoices: 0
      };

      /*
       * Existing Collabor8 workbook import
       */
      if(wb.SheetNames.includes('Occupants')){

        const rows =
          XLSX.utils.sheet_to_json(
            wb.Sheets['Occupants']
          );

        rows.forEach(r=>{

          const rec = {
            id: xStr(r.id),
            name: xStr(r.name),
            comp: xStr(r.company),
            email: xStr(r.email),
            phone: xStr(r.phone),

            cabins:
              xStr(r.cabins)
                .split(';')
                .map(s=>s.trim())
                .filter(Boolean),

            seatAllocations:
              (()=>{

                try{
                  return JSON.parse(
                    xStr(r.seatAllocationsJson) || '{}'
                  );
                }catch(e){
                  return {};
                }

              })(),

            start: xStr(r.start),
            end: xStr(r.end),

            rent: Number(r.rent) || 0,
            deposit: Number(r.deposit) || 0,
            advance: Number(r.advance) || 0,
            parking: Number(r.parking) || 0,
            parkingRevenue: Number(r.parkingRevenue) || ((Number(r.parking) || 0) * PARKING_RATE),
            parkingDeposit: Number(r.parkingDeposit) || 0,
            escalation: Number(r.escalation) || 10,

            upiId: xStr(r.upiId),

            reminder_sent:
              xBool(r.reminderSent)
          };

          const res =
            upsertById(
              occupants,
              rec,
              'occ'
            );

          occupants = res.arr;

          counts.occupants++;
        });

        saveOccupants();
      }

      if(wb.SheetNames.includes('Cabins')){

        const rows =
          XLSX.utils.sheet_to_json(
            wb.Sheets['Cabins']
          );

        rows.forEach(r=>{

          const rec = {
            id: xStr(r.id),
            floor: xStr(r.floor),
            seater: Number(r.seater) || 1,
            sno: Number(r.sno) || 0,

            occupied:
              xBool(r.occupied),

            occupantId:
              r.occupantId
                ? xStr(r.occupantId)
                : null,

            occupantName:
              r.occupantName
                ? xStr(r.occupantName)
                : null,

            note: xStr(r.note)
          };

          const res =
            upsertById(
              cabins,
              rec,
              'cabin'
            );

          cabins = res.arr;

          counts.cabins++;
        });

        saveCabins();
      }

      if(wb.SheetNames.includes('Payments')){

        const rows =
          XLSX.utils.sheet_to_json(
            wb.Sheets['Payments']
          );

        rows.forEach(r=>{

          const rec = {
            id: xStr(r.id),
            occupantId: xStr(r.occupantId),
            month: xStr(r.month),
            amountDue: Number(r.amountDue) || 0,
            dueDate: xStr(r.dueDate),

            paidDate:
              r.paidDate
                ? xStr(r.paidDate)
                : null,

            reminderSent:
              xBool(r.reminderSent),

            reminderDraftedAt:
              r.reminderDraftedAt
                ? xStr(r.reminderDraftedAt)
                : null
          };

          const res =
            upsertById(
              payments,
              rec,
              'pay'
            );

          payments = res.arr;

          counts.payments++;
        });

        savePayments();
      }

      if(wb.SheetNames.includes('Leads')){

        const rows =
          XLSX.utils.sheet_to_json(
            wb.Sheets['Leads']
          );

        rows.forEach(r=>{

          let activities = [];

          try{
            activities =
              JSON.parse(
                r.activitiesJson || '[]'
              );
          }catch(err){
            activities = [];
          }

          const rec = {
            id: xStr(r.id),
            name: xStr(r.name),
            company: xStr(r.company),
            phone: xStr(r.phone),
            email: xStr(r.email),
            source: xStr(r.source),
            agencyName: xStr(r.agencyName),

            stage:
              xStr(r.stage) || 'New',

            seats:
              Number(r.seats) || 1,

            notes: xStr(r.notes),

            created:
              xStr(r.created) || today(),

            nextFollowUp:
              xStr(r.nextFollowUp),

            activities
          };

          const res =
            upsertById(
              leads,
              rec,
              'lead'
            );

          leads = res.arr;

          counts.leads++;
        });

        saveLeads();
      }

      /*
       * NEW:
       * Import formatted tax invoice.
       *
       * Your uploaded invoice uses Sheet1.
       * We detect it by looking for:
       *
       * S.No
       * Description of Goods and Services
       * HSN/SAC
       * GST Rate
       * Amount
       */
      for(const sheetName of wb.SheetNames){

        const ws = wb.Sheets[sheetName];

        const previewRows =
          XLSX.utils.sheet_to_json(
            ws,
            {
              header: 1,
              defval: '',
              raw: true
            }
          );

        const looksLikeTaxInvoice =
          previewRows.some(row => {

            const text =
              (row || [])
                .map(xStr)
                .join(' ')
                .toLowerCase();

            return (
              text.includes('s.no') &&
              text.includes('description') &&
              text.includes('hsn/sac') &&
              text.includes('gst rate') &&
              text.includes('amount')
            );
          });

        if(!looksLikeTaxInvoice){
          continue;
        }

        /*
         * Avoid importing the same sheet twice.
         */
        try{

          const invoice =
            parseTaxInvoiceSheet(ws);

          const result =
            upsertImportedInvoice(invoice);

          counts.invoices++;

          console.log(
            result.updated
              ? `Updated invoice ${invoice.invoiceNo}`
              : `Imported invoice ${invoice.invoiceNo}`
          );

        }catch(invoiceError){

          console.error(
            'Tax invoice import error:',
            invoiceError
          );

          throw new Error(
            `Tax invoice import failed: ${invoiceError.message}`
          );
        }
      }

      /*
       * Persist imported invoices.
       */
      if(counts.invoices > 0){
        saveInvoices();
      }

      /*
       * Success message.
       */
      resultEl.style.color =
        'var(--teal)';

      resultEl.textContent =
        `✓ Imported: ${counts.occupants} occupant row(s), ` +
        `${counts.cabins} cabin row(s), ` +
        `${counts.payments} payment row(s), ` +
        `${counts.leads} lead row(s), ` +
        `${counts.invoices} invoice(s).`;

      fileInput.value = '';

      refreshAll();

    }catch(err){

      console.error(
        'Excel import failed:',
        err
      );

      resultEl.style.color =
        'var(--coral)';

      resultEl.textContent =
        'Import failed: ' +
        (err?.message ||
          'Check the Excel format and try again.');
    }
  };

  reader.readAsArrayBuffer(file);
}
// ══════════════════════════════════ INVOICES ══════════════════════════════════
function esc(s){ return (s==null?'':String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function sanitizeFilename(s){ return String(s||'').replace(/[\/\\?%*:|"<>]/g,'-').trim().slice(0,80); }
function fmtDateDDMMYY(d){ if(!d) return ''; const dt=new Date(d); if(isNaN(dt)) return ''; return String(dt.getDate()).padStart(2,'0')+'.'+String(dt.getMonth()+1).padStart(2,'0')+'.'+String(dt.getFullYear()).slice(-2); }
function fmtDateDDMMYYYY(d){ if(!d) return ''; const dt=new Date(d); if(isNaN(dt)) return ''; return String(dt.getDate()).padStart(2,'0')+'.'+String(dt.getMonth()+1).padStart(2,'0')+'.'+dt.getFullYear(); }
function fyLabel(dateStr){
  const d = new Date(dateStr||today());
  const y = d.getFullYear();
  const startY = d.getMonth()>=3 ? y : y-1; // FY starts April
  return String(startY).slice(-2)+'-'+String(startY+1).slice(-2);
}
function nextInvoiceNo(dateStr){
  const fy = fyLabel(dateStr);
  const seq = invoices.filter(i=>i.invoiceNo && i.invoiceNo.indexOf('/'+fy+'/')!==-1).length + 1;
  return 'CO/'+fy+'/'+String(seq).padStart(3,'0');
}
function numberToWordsIndian(num){
  num = Math.round(Math.abs(num||0));
  if(num===0) return 'Zero';
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  function two(n){ if(n<20) return ones[n]; return tens[Math.floor(n/10)] + (n%10? ' '+ones[n%10] : ''); }
  function three(n){ if(n>=100) return ones[Math.floor(n/100)]+' Hundred'+(n%100? ' '+two(n%100) : ''); return two(n); }
  let parts = [];
  const crore = Math.floor(num/10000000); num%=10000000;
  const lakh = Math.floor(num/100000); num%=100000;
  const thousand = Math.floor(num/1000); num%=1000;
  const hundred = num;
  if(crore) parts.push(three(crore)+' Crore');
  if(lakh) parts.push(three(lakh)+' Lakh');
  if(thousand) parts.push(three(thousand)+' Thousand');
  if(hundred) parts.push(three(hundred));
  return parts.join(' ');
}
function invoiceTotal(inv){
  const subtotal = (inv.items||[]).reduce((s,it)=>s+(Number(it.amount)||0),0);
  return subtotal + subtotal*(inv.cgstPct||0)/100 + subtotal*(inv.sgstPct||0)/100;
}

// ---- Line item editor ----
function addInvoiceItemRow(item){
  item = item || {desc:'',hsn:'',gstRate:18,qty:'',rate:0,per:'Nos',amount:0};
  const tbody = document.getElementById('inv-items-body');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td class="row-sno">${tbody.children.length+1}</td>
    <td><input class="form-input" style="font-size:12px;padding:5px 8px;" data-f="desc" value="${esc(item.desc)}"/></td>
    <td><input class="form-input" style="font-size:12px;padding:5px 8px;" data-f="hsn" value="${esc(item.hsn)}"/></td>
    <td><input class="form-input" style="font-size:12px;padding:5px 8px;" data-f="gstRate" type="number" value="${item.gstRate}"/></td>
    <td><input class="form-input" style="font-size:12px;padding:5px 8px;" data-f="qty" value="${esc(item.qty)}" oninput="autoFillAmount(this)"/></td>
    <td><input class="form-input" style="font-size:12px;padding:5px 8px;" data-f="rate" type="number" value="${item.rate}" oninput="autoFillAmount(this)"/></td>
    <td><input class="form-input" style="font-size:12px;padding:5px 8px;" data-f="per" value="${esc(item.per)}"/></td>
    <td><input class="form-input" style="font-size:12px;padding:5px 8px;" data-f="amount" type="number" value="${item.amount}" oninput="recalcInvoiceTotals()"/></td>
    <td><span style="cursor:pointer;color:var(--coral);" onclick="this.closest('tr').remove(); renumberInvoiceRows(); recalcInvoiceTotals();">✕</span></td>`;
  tbody.appendChild(tr);
}
function renumberInvoiceRows(){
  document.querySelectorAll('#inv-items-body tr').forEach((tr,i)=>{ const c=tr.querySelector('.row-sno'); if(c) c.textContent = i+1; });
}
function autoFillAmount(el){
  const tr = el.closest('tr');
  const qtyVal = tr.querySelector('[data-f="qty"]').value.trim();
  if(/^\d+(\.\d+)?$/.test(qtyVal)){
    const rate = parseFloat(tr.querySelector('[data-f="rate"]').value)||0;
    tr.querySelector('[data-f="amount"]').value = (parseFloat(qtyVal)*rate) || 0;
  }
  recalcInvoiceTotals();
}
function recalcInvoiceTotals(){
  const rows = document.querySelectorAll('#inv-items-body tr');
  let subtotal = 0;
  rows.forEach(r=>{ const amt = parseFloat(r.querySelector('[data-f="amount"]').value)||0; subtotal += amt; });
  const cgstPct = parseFloat(document.getElementById('inv-cgst-pct').value)||0;
  const sgstPct = parseFloat(document.getElementById('inv-sgst-pct').value)||0;
  const cgst = subtotal*cgstPct/100, sgst = subtotal*sgstPct/100, total = subtotal+cgst+sgst;
  document.getElementById('inv-calc-subtotal').textContent = '₹'+subtotal.toLocaleString('en-IN');
  document.getElementById('inv-calc-cgst').textContent = '₹'+cgst.toLocaleString('en-IN',{maximumFractionDigits:2});
  document.getElementById('inv-calc-sgst').textContent = '₹'+sgst.toLocaleString('en-IN',{maximumFractionDigits:2});
  document.getElementById('inv-calc-total').textContent = '₹'+total.toLocaleString('en-IN',{maximumFractionDigits:2});
  ['subtotal','cgst','sgst','total'].forEach(k=>{const el=document.getElementById('inv-calc-'+k+'-top');if(el){const v=k==='subtotal'?subtotal:k==='cgst'?cgst:k==='sgst'?sgst:total;el.textContent='₹'+v.toLocaleString('en-IN',{maximumFractionDigits:2});}});
  return {subtotal,cgst,sgst,total};
}

// ---- Modal: create / edit ----
function populateOccupantSelectForInvoice(){
  const sel = document.getElementById('inv-occupant');
  const cur = sel.value;
  sel.innerHTML = '<option value="">— Custom / non-occupant customer —</option>' +
    occupants.map(o=>`<option value="${o.id}">${esc(o.name)}${o.comp?' — '+esc(o.comp):''}</option>`).join('');
  sel.value = cur;
}
function fillInvoiceFromOccupant(){
  const id = document.getElementById('inv-occupant').value;
  if(!id) return;
  const o = occupants.find(o=>o.id===id);
  if(!o) return;
  document.getElementById('inv-buyer-name').value = o.comp || o.name;
  document.getElementById('inv-buyer-addr').value = (o.comp && o.comp!==o.name) ? ('Attn: '+o.name) : '';
  document.getElementById('inv-buyer-state').value = 'Tamil Nadu';
  document.getElementById('inv-buyer-contact').value = o.name;
  document.getElementById('inv-buyer-phone').value = o.phone||'';
  document.getElementById('inv-agreement').value = 'AGREEMENT DATED '+fmtDateDDMMYY(o.start);
  document.getElementById('inv-payment-term').value = 'Advance';
  document.getElementById('inv-items-body').innerHTML = '';
  const seatCount = (o.cabins||[]).reduce((s,cid)=>{ const c=cabins.find(c=>c.id===cid); return s+(c?c.seater:0); },0);
  const monthLabel = new Date().toLocaleDateString('en-IN',{month:'long',year:'numeric'}).toUpperCase();
  const effRate = seatCount ? Math.round((o.rent||0)/seatCount) : RATE_PER_SEAT;
  addInvoiceItemRow({desc:'1 Month Advance Fee For Work Stations (for the month of '+monthLabel+')', hsn:'997212', gstRate:18, qty:seatCount+' SEATS', rate:effRate, per:'Nos', amount:o.rent});
  if(o.parking>0) { const parkingAmount=parkingRevenueFor(o); addInvoiceItemRow({desc:'Car Parking', hsn:'', gstRate:18, qty:o.parking, rate:parkingAmount/o.parking, per:'No', amount:parkingAmount}); }
  renumberInvoiceRows();
  recalcInvoiceTotals();
}
function openInvoiceModal(id){
  populateOccupantSelectForInvoice();
  document.getElementById('inv-items-body').innerHTML = '';
  if(id){
    const inv = invoices.find(i=>i.id===id);
    if(!inv) return;
    document.getElementById('inv-modal-title').textContent = 'Edit Invoice — '+inv.invoiceNo;
    document.getElementById('inv-id').value = inv.id;
    document.getElementById('inv-no').value = inv.invoiceNo;
    document.getElementById('inv-date').value = inv.date;
    document.getElementById('inv-occupant').value = inv.occupantId || '';
    document.getElementById('inv-buyer-name').value = inv.buyer.name;
    document.getElementById('inv-buyer-addr').value = inv.buyer.addr;
    document.getElementById('inv-buyer-gst').value = inv.buyer.gstin;
    document.getElementById('inv-buyer-state').value = inv.buyer.state;
    document.getElementById('inv-buyer-contact').value = inv.buyer.contactPerson;
    document.getElementById('inv-buyer-phone').value = inv.buyer.contactPhone;
    document.getElementById('inv-agreement').value = inv.agreementRef;
    document.getElementById('inv-payment-term').value = inv.paymentTerm;
    document.getElementById('inv-other-ref').value = inv.otherRef;
    document.getElementById('inv-dispatch').value = inv.dispatchedThrough;
    document.getElementById('inv-destination').value = inv.destination;
    document.getElementById('inv-cgst-pct').value = inv.cgstPct;
    document.getElementById('inv-sgst-pct').value = inv.sgstPct;
    document.getElementById('inv-notes').value = inv.notes||'';
    (inv.items||[]).forEach(it=>addInvoiceItemRow(it));
  } else {
    document.getElementById('inv-modal-title').textContent = 'New Invoice';
    document.getElementById('inv-id').value = '';
    document.getElementById('inv-no').value = nextInvoiceNo(today());
    document.getElementById('inv-date').value = today();
    document.getElementById('inv-occupant').value = '';
    ['inv-buyer-name','inv-buyer-addr','inv-buyer-gst','inv-buyer-contact','inv-buyer-phone','inv-agreement','inv-payment-term','inv-other-ref','inv-dispatch','inv-destination','inv-notes'].forEach(fid=>{ const el=document.getElementById(fid); if(el) el.value=''; });
    document.getElementById('inv-buyer-state').value = 'Tamil Nadu';
    document.getElementById('inv-cgst-pct').value = 9;
    document.getElementById('inv-sgst-pct').value = 9;
    addInvoiceItemRow();
  }
  renumberInvoiceRows();
  recalcInvoiceTotals();
  document.getElementById('invoiceModal').classList.add('open');
}
function closeInvoiceModal(){ document.getElementById('invoiceModal').classList.remove('open'); }
function collectInvoiceFormData(){
  const items = Array.from(document.querySelectorAll('#inv-items-body tr')).map(r=>({
    desc: r.querySelector('[data-f="desc"]').value,
    hsn: r.querySelector('[data-f="hsn"]').value,
    gstRate: parseFloat(r.querySelector('[data-f="gstRate"]').value)||0,
    qty: r.querySelector('[data-f="qty"]').value,
    rate: parseFloat(r.querySelector('[data-f="rate"]').value)||0,
    per: r.querySelector('[data-f="per"]').value,
    amount: parseFloat(r.querySelector('[data-f="amount"]').value)||0
  }));
  return {
    invoiceNo: document.getElementById('inv-no').value.trim(),
    date: document.getElementById('inv-date').value || today(),
    occupantId: document.getElementById('inv-occupant').value || null,
    buyer: {
      name: document.getElementById('inv-buyer-name').value.trim(),
      addr: document.getElementById('inv-buyer-addr').value.trim(),
      gstin: document.getElementById('inv-buyer-gst').value.trim(),
      state: document.getElementById('inv-buyer-state').value.trim(),
      contactPerson: document.getElementById('inv-buyer-contact').value.trim(),
      contactPhone: document.getElementById('inv-buyer-phone').value.trim()
    },
    agreementRef: document.getElementById('inv-agreement').value.trim(),
    paymentTerm: document.getElementById('inv-payment-term').value.trim(),
    otherRef: document.getElementById('inv-other-ref').value.trim(),
    dispatchedThrough: document.getElementById('inv-dispatch').value.trim(),
    destination: document.getElementById('inv-destination').value.trim(),
    items,
    cgstPct: parseFloat(document.getElementById('inv-cgst-pct').value)||0,
    sgstPct: parseFloat(document.getElementById('inv-sgst-pct').value)||0,
    notes: document.getElementById('inv-notes').value.trim()
  };
}
function saveInvoice(forceStatus, thenPreview){
  const data = collectInvoiceFormData();
  if(!data.buyer.name){ alert('Buyer name is required.'); return; }
  if(!data.invoiceNo){ alert('Invoice number is required.'); return; }
  const id = document.getElementById('inv-id').value;
  let savedId = id;
  if(id){
    const inv = invoices.find(i=>i.id===id);
    Object.assign(inv, data);
    if(forceStatus) inv.status = forceStatus;
    inv.updatedAt = today();
  } else {
    const inv = Object.assign({ id:'inv-'+Date.now(), status: forceStatus || 'Draft', paymentStatus:'Pending', createdAt: today(), sentAt:null, receivedAt:null, periodMonth:null }, data);
    invoices.push(inv);
    savedId = inv.id;
  }
  saveInvoices();
  closeInvoiceModal();
  refreshAll();
  if(thenPreview) openInvoicePreview(savedId);
}

// ---- List / status ----
let invTabCurrent = 'all';
function invTab(tab, el){
  invTabCurrent = tab;
  document.querySelectorAll('#page-invoices .tab-bar .tab').forEach(t=>t.classList.remove('active'));
  if(el) el.classList.add('active');
  renderInvoicesPage();
}
function renderInvoicesPage(){
  const q = (document.getElementById('inv-search')?.value||'').toLowerCase();
  let list = invoices.filter(inv => !q || inv.invoiceNo.toLowerCase().includes(q) || inv.buyer.name.toLowerCase().includes(q));
  if(invTabCurrent==='draft') list = list.filter(i=>i.status==='Draft');
  if(invTabCurrent==='sent') list = list.filter(i=>i.status==='Sent');
  if(invTabCurrent==='pending') list = list.filter(i=>i.paymentStatus==='Pending');
  if(invTabCurrent==='received') list = list.filter(i=>i.paymentStatus==='Received');
  list = [...list].sort((a,b)=> (b.date||'').localeCompare(a.date||''));

  const totalAmt = invoices.reduce((s,i)=>s+invoiceTotal(i),0);
  const pending = invoices.filter(i=>i.paymentStatus==='Pending');
  const received = invoices.filter(i=>i.paymentStatus==='Received');
  const drafts = invoices.filter(i=>i.status==='Draft');
  const s1=document.getElementById('inv-total'); if(s1) s1.textContent = fmtINR(totalAmt);
  const s2=document.getElementById('inv-total-sub'); if(s2) s2.textContent = invoices.length+' invoice(s)';
  const s3=document.getElementById('inv-pending'); if(s3) s3.textContent = fmtINR(pending.reduce((s,i)=>s+invoiceTotal(i),0));
  const s4=document.getElementById('inv-pending-sub'); if(s4) s4.textContent = pending.length+' invoice(s)';
  const s5=document.getElementById('inv-received'); if(s5) s5.textContent = fmtINR(received.reduce((s,i)=>s+invoiceTotal(i),0));
  const s6=document.getElementById('inv-received-sub'); if(s6) s6.textContent = received.length+' invoice(s)';
  const s7=document.getElementById('inv-drafts'); if(s7) s7.textContent = drafts.length;

  const tbody = document.getElementById('invoices-body');
  const empty = document.getElementById('invoices-empty');
  if(!tbody) return;
  if(!list.length){ tbody.innerHTML=''; if(empty) empty.style.display='block'; return; }
  if(empty) empty.style.display='none';
  tbody.innerHTML = list.map(inv=>{
    const total = invoiceTotal(inv);
    return `<tr>
      <td style="font-weight:600;">${esc(inv.invoiceNo)}</td>
      <td>${fmtDate(inv.date)}</td>
      <td>${esc(inv.buyer.name)}${inv.occupantId?'<br><small style="color:var(--text3)">linked occupant</small>':''}</td>
      <td style="font-size:11.5px;color:var(--text3);">${esc(inv.agreementRef)||'—'}</td>
      <td style="font-weight:600;">₹${total.toLocaleString('en-IN')}</td>
      <td><select class="form-input" style="font-size:11px;padding:4px 6px;" onchange="setInvoiceStatus('${inv.id}',this.value)">
        <option ${inv.status==='Draft'?'selected':''}>Draft</option>
        <option ${inv.status==='Sent'?'selected':''}>Sent</option>
      </select></td>
      <td><select class="form-input" style="font-size:11px;padding:4px 6px;" onchange="setInvoicePaymentStatus('${inv.id}',this.value)">
        <option ${inv.paymentStatus==='Pending'?'selected':''}>Pending</option>
        <option ${inv.paymentStatus==='Received'?'selected':''}>Received</option>
      </select></td>
      <td style="white-space:nowrap;">
        <button class="btn btn-sm" onclick="openInvoicePreview('${inv.id}')" title="Preview">👁</button>
        <button class="btn btn-sm" onclick="openInvoiceModal('${inv.id}')" title="Edit">✎</button>
        <button class="btn btn-sm" onclick="deleteInvoice('${inv.id}')" title="Delete">🗑</button>
      </td>
    </tr>`;
  }).join('');
}
function setInvoiceStatus(id, val){
  const inv = invoices.find(i=>i.id===id); if(!inv) return;
  inv.status = val; if(val==='Sent' && !inv.sentAt) inv.sentAt = today();
  saveInvoices(); renderInvoicesPage(); updateInvoiceNavBadge();
}
function setInvoicePaymentStatus(id, val){
  const inv = invoices.find(i=>i.id===id); if(!inv) return;
  inv.paymentStatus = val; if(val==='Received') inv.receivedAt = today();
  saveInvoices(); renderInvoicesPage(); updateInvoiceNavBadge();
}
function deleteInvoice(id){
  if(!confirm('Delete this invoice permanently? This cannot be undone.')) return;
  invoices = invoices.filter(i=>i.id!==id);
  saveInvoices(); renderInvoicesPage(); updateInvoiceNavBadge();
}
function updateInvoiceNavBadge(){
  const el = document.getElementById('invoice-pending-nav');
  if(el) el.textContent = invoices.filter(i=>i.paymentStatus==='Pending').length;
}

// ---- Auto-generate ----
function eligibleOccupantsForMonth(monthStr){
  const monthStart=parseLocalDate(monthStr+'-01'), monthEnd=new Date(monthStart.getFullYear(),monthStart.getMonth()+1,0);
  return occupants.filter(o=>{ if(getStatus(o)==='expired') return false; const start=o.start?parseLocalDate(o.start):null,end=o.end?parseLocalDate(o.end):null; if(start&&start>monthEnd)return false; if(end&&end<monthStart)return false; return !invoices.some(i=>i.occupantId===o.id&&i.periodMonth===monthStr); });
}
function updateAutoGenPreview(){
  const monthStr = document.getElementById('autogen-month').value;
  const el = document.getElementById('autogen-preview');
  if(!monthStr){ el.textContent=''; return; }
  const list = eligibleOccupantsForMonth(monthStr);
  el.textContent = list.length
    ? list.length+' occupant(s) will get a new draft invoice: '+list.map(o=>o.name).join(', ')
    : 'No eligible occupants — either everyone active already has an invoice for this month, or there are no active occupants.';
}
function openAutoGenModal(){
  document.getElementById('autogen-month').value = new Date().toISOString().slice(0,7);
  updateAutoGenPreview();
  document.getElementById('autoGenModal').classList.add('open');
}
function closeAutoGenModal(){ document.getElementById('autoGenModal').classList.remove('open'); }
function runAutoGenInvoices(){
  const monthStr = document.getElementById('autogen-month').value;
  if(!monthStr){ alert('Pick a month.'); return; }
  const list = eligibleOccupantsForMonth(monthStr);
  if(!list.length){ alert('No eligible occupants for this month.'); return; }
  const monthLabel = new Date(monthStr+'-01').toLocaleDateString('en-IN',{month:'long',year:'numeric'}).toUpperCase();
  list.forEach(o=>{
    const seatCount = (o.cabins||[]).reduce((s,cid)=>{ const c=cabins.find(c=>c.id===cid); return s+(c?c.seater:0); },0);
    const effRate = seatCount ? Math.round((o.rent||0)/seatCount) : RATE_PER_SEAT;
    const items = [{desc:'1 Month Advance Fee For Work Stations (for the month of '+monthLabel+')', hsn:'997212', gstRate:18, qty:seatCount+' SEATS', rate:effRate, per:'Nos', amount:o.rent}];
    if(o.parking>0) { const parkingAmount=parkingRevenueFor(o); items.push({desc:'Car Parking', hsn:'', gstRate:18, qty:o.parking, rate:parkingAmount/o.parking, per:'No', amount:parkingAmount}); }
    invoices.push({
      id:'inv-'+Date.now()+'-'+Math.round(Math.random()*1000),
      invoiceNo: nextInvoiceNo(today()),
      date: (o.start&&o.start.slice(0,7)===monthStr)?o.start:today(),
      periodMonth: monthStr,
      occupantId: o.id,
      buyer: { name:o.comp||o.name, addr: (o.comp&&o.comp!==o.name)? ('Attn: '+o.name):'', gstin:'', state:'Tamil Nadu', contactPerson:o.name, contactPhone:o.phone||'' },
      agreementRef: 'AGREEMENT DATED '+fmtDateDDMMYY(o.start),
      paymentTerm:'Advance', otherRef:'', dispatchedThrough:'', destination:'',
      items, cgstPct:9, sgstPct:9, notes:'',
      status:'Draft', paymentStatus:'Pending', createdAt:today(), sentAt:null, receivedAt:null
    });
  });
  saveInvoices();
  closeAutoGenModal();
  refreshAll();
  alert(list.length+' draft invoice(s) created for '+monthLabel+'.');
}

// ---- Preview / Print / PDF / Excel / Email ----
let currentPreviewInvoiceId = null;
function buildInvoiceDocHTML(inv){
  const subtotal = (inv.items||[]).reduce((s,it)=>s+(Number(it.amount)||0),0);
  const cgst = subtotal*(inv.cgstPct||0)/100;
  const sgst = subtotal*(inv.sgstPct||0)/100;
  const total = subtotal+cgst+sgst;
  const itemRows = (inv.items||[]).map((it,i)=>`
    <tr>
      <td class="inv-center">${i+1}</td>
      <td>${esc(it.desc)}</td>
      <td class="inv-center">${esc(it.hsn)}</td>
      <td class="inv-center">${it.gstRate}%</td>
      <td class="inv-center">${esc(it.qty)}</td>
      <td class="inv-right">${it.rate?Number(it.rate).toLocaleString('en-IN'):''}</td>
      <td class="inv-center">${esc(it.per)}</td>
      <td class="inv-right">${(Number(it.amount)||0).toLocaleString('en-IN')}</td>
    </tr>`).join('');
  const byHsn = {};
  (inv.items||[]).forEach(it=>{ const key=it.hsn||'—'; byHsn[key]=(byHsn[key]||0)+(Number(it.amount)||0); });
  const hsnRows = Object.entries(byHsn).map(([hsn,amt])=>{
    const c = amt*(inv.cgstPct||0)/100, s = amt*(inv.sgstPct||0)/100;
    return `<tr><td class="inv-center">${esc(hsn)}</td><td class="inv-right">${amt.toLocaleString('en-IN')}</td><td class="inv-center">${inv.cgstPct}%</td><td class="inv-right">${c.toLocaleString('en-IN',{maximumFractionDigits:2})}</td><td class="inv-center">${inv.sgstPct}%</td><td class="inv-right">${s.toLocaleString('en-IN',{maximumFractionDigits:2})}</td><td class="inv-right">${(c+s).toLocaleString('en-IN',{maximumFractionDigits:2})}</td></tr>`;
  }).join('');
  return `
  <div class="inv-doc">
    <div class="inv-title">TAX INVOICE</div>
    <table>
      <tr>
        <td style="width:55%;" rowspan="3">
          <strong style="font-size:13px;">COLLABOR8</strong><br/>
          Kop Tower, No.9&amp;10, Chakkrapani Street, Guindy,<br/>
          Chennai, Tamil Nadu - India<br/>
          GSTIN/UIN: 33AAVFC6304J1ZY<br/>
          State Name: Tamil Nadu, Code: 33
        </td>
        <td class="inv-label">Invoice No.</td><td>${esc(inv.invoiceNo)}</td>
      </tr>
      <tr><td class="inv-label">Dated</td><td>${fmtDateDDMMYYYY(inv.date)}</td></tr>
      <tr><td class="inv-label">Mode/Term of Payment</td><td>${esc(inv.paymentTerm)}</td></tr>
    </table>
    <table>
      <tr>
        <td style="width:55%;">
          <div class="inv-label">Buyer (Bill to)</div>
          <strong>${esc(inv.buyer.name)}</strong><br/>
          ${esc(inv.buyer.addr).replace(/\n/g,'<br/>')}${inv.buyer.addr?'<br/>':''}
          ${inv.buyer.gstin? 'GSTIN/UIN: '+esc(inv.buyer.gstin)+'<br/>' : ''}
          State Name: ${esc(inv.buyer.state)}<br/>
          ${inv.buyer.contactPerson? 'Contact Person: '+esc(inv.buyer.contactPerson)+'<br/>':''}
          ${inv.buyer.contactPhone? 'Contact: '+esc(inv.buyer.contactPhone):''}
        </td>
        <td>
          <div class="inv-label">Reference No. &amp; Date</div>${esc(inv.agreementRef)}<br/><br/>
          <div class="inv-label">Other References</div>${esc(inv.otherRef)}<br/><br/>
          <div class="inv-label">Dispatched Through</div>${esc(inv.dispatchedThrough)}<br/>
          <div class="inv-label">Destination</div>${esc(inv.destination)}
        </td>
      </tr>
    </table>
    <table>
      <thead><tr>
        <th class="inv-center" style="width:30px;">S.No</th><th>Description of Goods and Services</th>
        <th style="width:60px;">HSN/SAC</th><th style="width:50px;">GST</th><th style="width:70px;">Quantity</th>
        <th style="width:70px;">Rate</th><th style="width:40px;">Per</th><th style="width:80px;">Amount</th>
      </tr></thead>
      <tbody>${itemRows}
        <tr><td colspan="7" class="inv-right"><strong>Subtotal</strong></td><td class="inv-right"><strong>${subtotal.toLocaleString('en-IN')}</strong></td></tr>
        <tr><td colspan="7" class="inv-right">CGST ${inv.cgstPct}% Output</td><td class="inv-right">${cgst.toLocaleString('en-IN',{maximumFractionDigits:2})}</td></tr>
        <tr><td colspan="7" class="inv-right">SGST ${inv.sgstPct}% Output</td><td class="inv-right">${sgst.toLocaleString('en-IN',{maximumFractionDigits:2})}</td></tr>
        <tr><td colspan="7" class="inv-right"><strong>Total</strong></td><td class="inv-right"><strong>₹${total.toLocaleString('en-IN',{maximumFractionDigits:2})}</strong></td></tr>
      </tbody>
    </table>
    <table><tr><td><strong>Amount Chargeable (in words):</strong> Rupees ${numberToWordsIndian(total)} Only</td></tr></table>
    <table>
      <thead><tr><th>HSN/SAC</th><th>Taxable Value</th><th colspan="2">CGST</th><th colspan="2">SGST/UTGST</th><th>Total Tax</th></tr></thead>
      <tbody>${hsnRows}</tbody>
    </table>
    <table><tr><td>Tax Amount (in words): Rupees ${numberToWordsIndian(cgst+sgst)} Only</td></tr></table>
    <table>
      <tr><td style="width:60%;">
        <div class="inv-label">Declaration</div>
        <span class="inv-small">We declare that this invoice shows the actual price of the goods/services described and that all particulars are true and correct.</span>
      </td>
      <td class="inv-center">for COLLABOR8<br/><br/><br/>Authorised Signatory</td></tr>
    </table>
    ${inv.notes? '<div class="inv-small" style="margin-top:6px;">Notes: '+esc(inv.notes)+'</div>' : ''}
    <div class="inv-center inv-small" style="margin-top:10px;">This is a Computer Generated Invoice</div>
  </div>`;
}
function openInvoicePreview(id){
  const inv = invoices.find(i=>i.id===id);
  if(!inv) return;
  currentPreviewInvoiceId = id;
  document.getElementById('invoice-preview-content').innerHTML = buildInvoiceDocHTML(inv);
  document.getElementById('invoicePreviewModal').classList.add('open');
}
function closeInvoicePreview(){ document.getElementById('invoicePreviewModal').classList.remove('open'); currentPreviewInvoiceId=null; }
function editInvoiceFromPreview(){ const id = currentPreviewInvoiceId; closeInvoicePreview(); openInvoiceModal(id); }
function printInvoicePreview(){ window.print(); }

function downloadInvoicePDF(id){
  const inv = invoices.find(i=>i.id===id);
  if(!inv) return;
  if(typeof html2canvas==='undefined' || typeof window.jspdf==='undefined'){ alert('PDF library failed to load (no internet access?). Please check your connection and retry, or use Print instead.'); return; }
  const el = document.getElementById('invoice-preview-content');
  html2canvas(el, {scale:2, backgroundColor:'#ffffff'}).then(canvas=>{
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p','pt','a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgW = pageWidth;
    const imgH = canvas.height * (imgW/canvas.width);
    const imgData = canvas.toDataURL('image/png');
    let heightLeft = imgH, position = 0;
    pdf.addImage(imgData, 'PNG', 0, position, imgW, imgH);
    heightLeft -= pageHeight;
    while(heightLeft > 0){
      position = heightLeft - imgH;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgW, imgH);
      heightLeft -= pageHeight;
    }
    pdf.save(sanitizeFilename(inv.buyer.name)+'_'+sanitizeFilename(inv.invoiceNo)+'.pdf');
  }).catch(err=>{ alert('Could not generate PDF: '+err.message); });
}

function downloadInvoiceExcel(id){
  const inv = invoices.find(i=>i.id===id);
  if(!inv) return;
  if(typeof XLSX === 'undefined'){ alert('Excel library failed to load (no internet access?). Please check your connection and retry.'); return; }
  const subtotal = (inv.items||[]).reduce((s,it)=>s+(Number(it.amount)||0),0);
  const cgst = subtotal*(inv.cgstPct||0)/100, sgst = subtotal*(inv.sgstPct||0)/100, total = subtotal+cgst+sgst;
  const aoa = [];
  const R = i => aoa[i] = aoa[i] || [];
  R(0)[0]='TAX INVOICE';
  R(2)[0]='COLLABOR8'; R(2)[2]='Invoice No.'; R(2)[5]='Dated';
  R(3)[0]='Kop Tower, No.9&10, Chakkrapani Street, Guindy,'; R(3)[2]=inv.invoiceNo; R(3)[5]=fmtDateDDMMYYYY(inv.date);
  R(4)[0]='Chennai, Tamil Nadu - India'; R(4)[5]='Mode/Term of Payment';
  R(5)[0]='GSTIN/UIN: 33AAVFC6304J1ZY'; R(5)[5]=inv.paymentTerm;
  R(6)[0]='State Name: Tamil Nadu, Code: 33'; R(6)[2]='Reference No. & Date'; R(6)[5]='Other References';
  R(7)[2]=inv.agreementRef; R(7)[5]=inv.otherRef;
  R(9)[0]='Buyer (Bill to)';
  R(10)[0]=inv.buyer.name; R(10)[2]='Dispatched through'; R(10)[5]='Destination';
  R(11)[0]=inv.buyer.addr; R(11)[2]=inv.dispatchedThrough; R(11)[5]=inv.destination;
  R(12)[0]=(inv.buyer.gstin? 'GSTIN/UIN: '+inv.buyer.gstin : '');
  R(13)[0]='State Name: '+inv.buyer.state;
  R(14)[0]=(inv.buyer.contactPerson? 'Contact Person: '+inv.buyer.contactPerson : '');
  R(15)[0]=(inv.buyer.contactPhone? 'Contact: '+inv.buyer.contactPhone : '');
  const headerRow = 17;
  R(headerRow)[0]='S.No'; R(headerRow)[1]='Description of Goods and Services'; R(headerRow)[2]='HSN/SAC'; R(headerRow)[3]='GST Rate'; R(headerRow)[4]='Quantity'; R(headerRow)[5]='Rate'; R(headerRow)[6]='Per'; R(headerRow)[7]='Amount';
  let r = headerRow+1;
  (inv.items||[]).forEach((it,i)=>{ R(r)[0]=i+1; R(r)[1]=it.desc; R(r)[2]=it.hsn; R(r)[3]=(it.gstRate/100); R(r)[4]=it.qty; R(r)[5]=it.rate; R(r)[6]=it.per; R(r)[7]=it.amount; r++; });
  r++;
  R(r)[1]='CGST '+inv.cgstPct+'% Output'; R(r)[7]=cgst; r++;
  R(r)[1]='SGST '+inv.sgstPct+'% Output'; R(r)[7]=sgst; r++;
  r++;
  R(r)[1]='Total'; R(r)[7]=total; r+=2;
  R(r)[0]='Amount Chargeable (in words)'; r++;
  R(r)[0]='Rupees '+numberToWordsIndian(total)+' Only'; r+=2;
  R(r)[0]='HSN/SAC'; R(r)[2]='Taxable Value'; R(r)[3]='CGST'; R(r)[5]='SGST/UTGST'; R(r)[7]='Total Tax Amount'; r++;
  R(r)[3]='Rate'; R(r)[4]='Amount'; R(r)[5]='Rate'; R(r)[6]='Amount'; r++;
  const byHsn = {};
  (inv.items||[]).forEach(it=>{ const k=it.hsn||'—'; byHsn[k]=(byHsn[k]||0)+(Number(it.amount)||0); });
  Object.entries(byHsn).forEach(([hsn,amt])=>{
    const c = amt*(inv.cgstPct||0)/100, s = amt*(inv.sgstPct||0)/100;
    R(r)[0]=hsn; R(r)[2]=amt; R(r)[3]=inv.cgstPct/100; R(r)[4]=c; R(r)[5]=inv.sgstPct/100; R(r)[6]=s; R(r)[7]=c+s; r++;
  });
  r++;
  R(r)[0]='Tax Amount (in words) : Rupees '+numberToWordsIndian(cgst+sgst)+' Only'; r+=2;
  R(r)[0]='Declaration'; r++;
  R(r)[0]='We declare that this invoice shows the actual price of the goods/services described and that all particulars are true and correct.'; r+=2;
  R(r)[6]='for COLLABOR8'; r+=3;
  R(r)[3]='Prepared by'; R(r)[5]='Verified by'; R(r)[6]='Authorised Signatory'; r+=2;
  R(r)[0]='This is a Computer Generated Invoice';
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{wch:16},{wch:34},{wch:12},{wch:10},{wch:12},{wch:10},{wch:8},{wch:14}];
  ws['!merges'] = [ {s:{r:0,c:0}, e:{r:0,c:7}}, {s:{r:2,c:0}, e:{r:5,c:0}}, {s:{r:9,c:0}, e:{r:9,c:1}} ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Invoice');
  XLSX.writeFile(wb, sanitizeFilename(inv.buyer.name)+'_'+sanitizeFilename(inv.invoiceNo)+'.xlsx');
}

function draftInvoiceEmail(id){
  const inv = invoices.find(i=>i.id===id);
  if(!inv) return;
  const subtotal = (inv.items||[]).reduce((s,it)=>s+(Number(it.amount)||0),0);
  const cgst = subtotal*(inv.cgstPct||0)/100, sgst = subtotal*(inv.sgstPct||0)/100, total = subtotal+cgst+sgst;
  const occ = inv.occupantId ? occupants.find(o=>o.id===inv.occupantId) : null;
  const toEmail = occ ? occ.email : '';
  const lines = (inv.items||[]).map(it=>'  • '+it.desc+' — Rs.'+(Number(it.amount)||0).toLocaleString('en-IN')).join('\n');
  const subject = 'COLLABOR8 — Tax Invoice '+inv.invoiceNo;
  const body = `Dear ${inv.buyer.contactPerson||inv.buyer.name},

Please find your tax invoice details below.

Invoice No: ${inv.invoiceNo}
Date: ${fmtDate(inv.date)}
${inv.agreementRef?('Agreement: '+inv.agreementRef+'\n'):''}
${lines}

Subtotal: Rs.${subtotal.toLocaleString('en-IN')}
CGST ${inv.cgstPct}%: Rs.${cgst.toLocaleString('en-IN',{maximumFractionDigits:2})}
SGST ${inv.sgstPct}%: Rs.${sgst.toLocaleString('en-IN',{maximumFractionDigits:2})}
Total: Rs.${total.toLocaleString('en-IN',{maximumFractionDigits:2})}
${paymentLinkBlock(occ, total, 'Invoice '+inv.invoiceNo)}
Note: this draft won't have the invoice attached automatically (browsers can't attach files to email for you) — please download the PDF or Excel copy from the dashboard first and attach it here before sending.

Kindly arrange payment at your earliest convenience. Please reach out if you have any questions.

Warm regards,
COLLABOR8 Management
No.9 & 10, Chakrapani Street, Guindy, Chennai – 600032`;
  closeInvoicePreview();
  showEmailPreview(toEmail, subject, body, {
    title: 'Preview Invoice Email — '+inv.invoiceNo,
    onSend: ()=>{ inv.status='Sent'; if(!inv.sentAt) inv.sentAt=today(); saveInvoices(); renderInvoicesPage(); updateInvoiceNavBadge(); }
  });
}

function markPaymentPaid(id){
  const p = payments.find(p=>p.id===id);
  if(p){ p.paidDate = today(); savePayments(); refreshAll(); }
}
function getPaymentLink(){ return appSettings.paymentLink || ''; }
function setPaymentLink(v){ appSettings.paymentLink = v||''; saveSettings(); }
function getUpiId(){ return appSettings.upiId || ''; }
function setUpiId(v){ appSettings.upiId = v||''; saveSettings(); }
function getPayeeName(){ return appSettings.payeeName || 'COLLABOR8'; }
function setPayeeName(v){ appSettings.payeeName = v||''; saveSettings(); }
function initPaymentLinkField(){
  const a = document.getElementById('payment-link-input'); if(a) a.value = getPaymentLink();
  const b = document.getElementById('upi-id-input'); if(b) b.value = getUpiId();
  const c = document.getElementById('upi-payee-input'); if(c) c.value = getPayeeName();
}
function savePaymentSettings(){
  setPaymentLink(document.getElementById('payment-link-input').value.trim());
  setUpiId(document.getElementById('upi-id-input').value.trim());
  setPayeeName(document.getElementById('upi-payee-input').value.trim());
  const note = document.getElementById('payment-link-note');
  if(note){ note.textContent = '✓ Saved'; setTimeout(()=>{ if(note.textContent==='✓ Saved') note.textContent=''; }, 2000); }
}
// Builds a DISTINCT payment link per invoice: a UPI intent link pre-filled with that
// occupant's exact amount + a reference note (falls back to occupant's own upiId if set
// via Excel import, then to a generic gateway link if no UPI ID exists at all).
function buildPaymentLink(occ, amountRs, note){
  const vpa = (occ && occ.upiId) || getUpiId();
  if(vpa){
    return 'upi://pay?pa='+encodeURIComponent(vpa)+'&pn='+encodeURIComponent(getPayeeName())+'&am='+encodeURIComponent(amountRs)+'&cu=INR&tn='+encodeURIComponent(note||'');
  }
  return getPaymentLink();
}
function paymentLinkBlock(occ, amountRs, note){
  const link = buildPaymentLink(occ, amountRs, note);
  if(!link) return '';
  const isUpi = link.indexOf('upi://')===0;
  return isUpi
    ? `\nPay via UPI (₹${amountRs.toLocaleString('en-IN')}): ${link}\n(Open this link on your phone with GPay, PhonePe, Paytm or any UPI app to pay this exact amount instantly.)\n`
    : `\nPay online: ${link}\n`;
}
function draftPaymentReminder(id){
  const p = payments.find(p=>p.id===id);
  if(!p) return;
  const o = occupants.find(o=>o.id===p.occupantId);
  if(!o) return;
  const subject = 'COLLABOR8 — Rent Reminder for '+p.month+' ('+o.cabins.join(', ')+')';
  const body = `Dear ${o.name},

This is a friendly reminder that your co-working fee for ${p.month} is currently ${paymentStatus(p)==='overdue'?'overdue':'due'}.

Cabin(s): ${o.cabins.join(', ')}
Amount Due: Rs.${p.amountDue.toLocaleString('en-IN')} + GST
Due Date: ${fmtDate(p.dueDate)}
${paymentLinkBlock(o, p.amountDue, 'Rent '+p.month+' - '+o.name)}
Kindly arrange payment at your earliest convenience. Please reach out if you have any questions.

Warm regards,
COLLABOR8 Management
No.9 & 10, Chakrapani Street, Guindy, Chennai – 600032`;
  showEmailPreview(o.email, subject, body, {
    title: 'Preview Payment Reminder — '+o.name,
    onSend: ()=>{ p.reminderSent = true; p.reminderDraftedAt = today(); savePayments(); renderPaymentsPage(); }
  });
}
function draftBulkPaymentReminder(occId){
  const o = occupants.find(o=>o.id===occId);
  if(!o) return;
  ensurePaymentsGenerated();
  const outstanding = payments.filter(p=>p.occupantId===occId && paymentStatus(p)!=='paid');
  if(!outstanding.length){ alert('No outstanding invoices for this occupant.'); return; }
  outstanding.sort((a,b)=>a.month.localeCompare(b.month));
  const total = outstanding.reduce((s,p)=>s+p.amountDue,0);
  const worstOverdue = outstanding.some(p=>paymentStatus(p)==='overdue');
  const lines = outstanding.map(p=>`  • ${p.month} — Rs.${p.amountDue.toLocaleString('en-IN')} + GST — due ${fmtDate(p.dueDate)} (${paymentStatus(p)==='overdue'?'OVERDUE':'due'})`).join('\n');
  const subject = 'COLLABOR8 — Outstanding Payment Summary ('+outstanding.length+' month(s))';
  const body = `Dear ${o.name},

Our records show the following outstanding co-working fee(s) for ${o.cabins.join(', ')}:

${lines}

Total Outstanding: Rs.${total.toLocaleString('en-IN')} + GST
${paymentLinkBlock(o, total, 'Outstanding dues - '+o.name)}
Kindly arrange payment at your earliest convenience${worstOverdue?', especially the overdue month(s) above':''}. Please reach out if you have any questions.

Warm regards,
COLLABOR8 Management
No.9 & 10, Chakrapani Street, Guindy, Chennai – 600032`;
  showEmailPreview(o.email, subject, body, {
    title: 'Preview Outstanding Summary — '+o.name,
    onSend: ()=>{ outstanding.forEach(p=>{ p.reminderSent = true; p.reminderDraftedAt = today(); }); savePayments(); renderPaymentsPage(); }
  });
}


// ══════════════════════════════════ SALES PIPELINE — LEADS ══════════════════════════════════
let salesTabCurrent = 'pipeline';
function salesTab(tab, el){
  salesTabCurrent = tab;
  document.querySelectorAll('#page-sales .tab-bar .tab').forEach(t=>t.classList.remove('active'));
  if(el) el.classList.add('active');
  ['pipeline','leads','followups','quotations','sources'].forEach(t=>{ document.getElementById('sales-tab-'+t).style.display = (t===tab)?'block':'none'; });
  renderSalesPage();
}
function followupFlag(dateStr){
  if(!dateStr) return null;
  const dl = daysLeft(dateStr);
  if(dl<0) return {cls:'overdue', label:'Overdue '+Math.abs(dl)+'d'};
  if(dl===0) return {cls:'today', label:'Due today'};
  return {cls:'upcoming', label:'In '+dl+'d'};
}
function renderSalesMetrics(){
  const total = leads.length;
  const converted = leads.filter(l=>l.stage==='Converted').length;
  const open = leads.filter(l=>l.stage!=='Converted' && l.stage!=='Lost');
  const followupsDue = open.filter(l=>l.nextFollowUp && daysLeft(l.nextFollowUp)<=0).length;
  const pipelineValue = open.reduce((s,l)=>s+((l.seats||0)*RATE_PER_SEAT),0);
  document.getElementById('sl-total').textContent = total;
  document.getElementById('sl-converted').textContent = converted;
  document.getElementById('sl-convrate').textContent = (total?Math.round(converted/total*100):0)+'% conversion';
  document.getElementById('sl-followups').textContent = followupsDue;
  document.getElementById('sl-value').textContent = fmtINR(pipelineValue);
  document.getElementById('sl-quotes').textContent = quotations.length;
  document.getElementById('lead-count-nav').textContent = open.length;
}
function renderKanban(){
  const board = document.getElementById('kanban-board');
  if(!board) return;
  board.innerHTML = LEAD_STAGES.map(stage=>{
    const items = leads.filter(l=>l.stage===stage);
    const cards = items.map(l=>{
      const flag = followupFlag(l.nextFollowUp);
      return `<div class="lead-card" onclick="openLeadModal('${l.id}')">
        <div class="lc-name">${esc(l.name)}</div>
        <div class="lc-comp">${esc(l.company||'')}</div>
        <div class="lc-meta"><span class="source-badge">${l.source}${l.source==='Agency'&&l.agencyName?' · '+esc(l.agencyName):''}</span><span class="lc-value">${l.seats||1} seat${(l.seats||1)>1?'s':''}</span></div>
        ${flag?`<div class="followup-flag ${flag.cls}">${flag.label}</div>`:''}
      </div>`;
    }).join('');
    return `<div class="kanban-col">
      <div class="kanban-col-head"><span>${stage}</span><span class="kanban-count">${items.length}</span></div>
      ${cards || '<div style="text-align:center;color:var(--text3);font-size:11px;padding:10px 0;">Empty</div>'}
    </div>`;
  }).join('');
}
function renderLeadSourceFilters(){
  const el = document.getElementById('lead-source-filters');
  if(!el) return;
  el.innerHTML = ['All',...LEAD_SOURCES].map(s=>`<button class="filter-btn ${(leadSourceFilter||'All')===s?'active':''}" onclick="setLeadSourceFilter('${s}')">${s}</button>`).join('');
}
let leadSourceFilter = 'All';
function setLeadSourceFilter(s){ leadSourceFilter=s; renderLeadsTable(); }
function renderLeadsTable(){
  renderLeadSourceFilters();
  const q = (document.getElementById('lead-search')?.value||'').toLowerCase();
  let list = leads;
  if(leadSourceFilter!=='All') list = list.filter(l=>l.source===leadSourceFilter);
  if(q) list = list.filter(l=> l.name.toLowerCase().includes(q) || (l.company||'').toLowerCase().includes(q));
  const body = document.getElementById('leads-body');
  const empty = document.getElementById('leads-empty');
  if(!list.length){ body.innerHTML=''; empty.style.display='block'; return; }
  empty.style.display='none';
  body.innerHTML = list.map(l=>`
    <tr>
      <td>${esc(l.name)}</td>
      <td>${esc(l.company||'—')}</td>
      <td><span class="source-badge">${esc(l.source)}${l.source==='Agency'&&l.agencyName?' · '+esc(l.agencyName):''}</span></td>
      <td>${esc(l.stage)}</td>
      <td style="text-align:center">${l.seats||1}</td>
      <td style="font-size:12px;color:var(--text3)">${l.nextFollowUp?fmtDate(l.nextFollowUp):'—'}</td>
      <td><button class="btn btn-sm" onclick="openLeadModal('${l.id}')">Open</button></td>
    </tr>`).join('');
}
function renderFollowups(){
  const body = document.getElementById('followups-body');
  const empty = document.getElementById('followups-empty');
  const list = leads.filter(l=>l.nextFollowUp && l.stage!=='Converted' && l.stage!=='Lost').sort((a,b)=>a.nextFollowUp.localeCompare(b.nextFollowUp));
  if(!list.length){ body.innerHTML=''; empty.style.display='block'; return; }
  empty.style.display='none';
  body.innerHTML = list.map(l=>{
    const flag = followupFlag(l.nextFollowUp);
    return `<tr><td>${esc(l.name)}</td><td>${esc(l.company||'—')}</td><td>${esc(l.stage)}</td><td style="font-size:12px;color:var(--text3)">${fmtDate(l.nextFollowUp)}</td>
      <td><span class="followup-flag ${flag.cls}">${flag.label}</span></td>
      <td><button class="btn btn-sm" onclick="openLeadModal('${l.id}')">Log / View</button></td></tr>`;
  }).join('');
}
function renderQuotesGrid(){
  const grid = document.getElementById('quotes-grid');
  const empty = document.getElementById('quotes-empty');
  if(!quotations.length){ grid.innerHTML=''; empty.style.display='block'; return; }
  empty.style.display='none';
  grid.innerHTML = [...quotations].reverse().map(q=>`
    <div class="doc-card">
      <div class="doc-icon">🧾</div>
      <div class="doc-name">${esc(q.clientName)} — ${esc(q.company||'')}</div>
      <span class="doc-badge Other">${esc(q.status)}</span>
      <div class="doc-meta">${q.seatCount} seat(s) · ₹${q.finalRent.toLocaleString('en-IN')}/mo</div>
      <div class="doc-meta">Valid until ${fmtDate(q.validUntil)} · created ${fmtDate(q.created)}</div>
      <div class="doc-actions">
        <button class="btn btn-sm" onclick="viewQuotation('${q.id}')">View</button>
        <button class="btn btn-sm btn-danger" onclick="deleteQuotation('${q.id}')">Delete</button>
      </div>
    </div>`).join('');
}
function renderSalesPage(){
  renderSalesMetrics();
  if(salesTabCurrent==='pipeline') renderKanban();
  if(salesTabCurrent==='leads') renderLeadsTable();
  if(salesTabCurrent==='followups') renderFollowups();
  if(salesTabCurrent==='quotations') renderQuotesGrid();
  if(salesTabCurrent==='sources') renderSourceAnalytics();
}
function renderSourceAnalytics(){
  const bySource = {};
  leads.forEach(l=>{
    const s = l.source || 'Other';
    if(!bySource[s]) bySource[s] = {total:0, converted:0};
    bySource[s].total++;
    if(l.stage==='Converted') bySource[s].converted++;
  });
  const sourceBody = document.getElementById('source-analytics-body');
  const sourceEmpty = document.getElementById('source-analytics-empty');
  const sourceKeys = Object.keys(bySource).sort((a,b)=>bySource[b].total-bySource[a].total);
  if(!sourceKeys.length){ sourceBody.innerHTML=''; sourceEmpty.style.display='block'; }
  else {
    sourceEmpty.style.display='none';
    sourceBody.innerHTML = sourceKeys.map(s=>{
      const d = bySource[s];
      const pct = d.total ? Math.round(d.converted/d.total*100) : 0;
      return `<tr><td><span class="source-badge">${s}</span></td><td style="text-align:center">${d.total}</td><td style="text-align:center">${d.converted}</td><td style="text-align:center">${pct}%</td></tr>`;
    }).join('');
  }

  const byAgency = {};
  leads.filter(l=>l.source==='Agency' && l.agencyName).forEach(l=>{
    const a = l.agencyName;
    if(!byAgency[a]) byAgency[a] = {total:0, converted:0};
    byAgency[a].total++;
    if(l.stage==='Converted') byAgency[a].converted++;
  });
  const agencyBody = document.getElementById('agency-analytics-body');
  const agencyEmpty = document.getElementById('agency-analytics-empty');
  const agencyKeys = Object.keys(byAgency).sort((a,b)=>byAgency[b].total-byAgency[a].total);
  if(!agencyKeys.length){ agencyBody.innerHTML=''; agencyEmpty.style.display='block'; }
  else {
    agencyEmpty.style.display='none';
    agencyBody.innerHTML = agencyKeys.map(a=>{
      const d = byAgency[a];
      return `<tr><td>${esc(a)}</td><td style="text-align:center">${d.total}</td><td style="text-align:center">${d.converted}</td></tr>`;
    }).join('');
  }
}

// ---- Lead modal ----
function populateStageSelect(){
  document.getElementById('ld-stage').innerHTML = LEAD_STAGES.map(s=>`<option>${s}</option>`).join('');
}
function onLeadSourceChange(){
  const isAgency = document.getElementById('ld-source').value === 'Agency';
  document.getElementById('ld-agency-group').style.display = isAgency ? 'block' : 'none';
}
function openLeadModal(id){
  populateStageSelect();
  const editing = !!id;
  document.getElementById('lead-modal-title').textContent = editing ? 'Edit Lead' : 'New Lead';
  document.getElementById('ld-delete-btn').style.display = editing ? 'inline-block' : 'none';
  document.getElementById('ld-existing-section').style.display = editing ? 'block' : 'none';
  if(editing){
    const l = leads.find(l=>l.id===id);
    document.getElementById('ld-id').value = l.id;
    document.getElementById('ld-name').value = l.name;
    document.getElementById('ld-company').value = l.company||'';
    document.getElementById('ld-phone').value = l.phone||'';
    document.getElementById('ld-email').value = l.email||'';
    document.getElementById('ld-source').value = l.source;
    document.getElementById('ld-stage').value = l.stage;
    document.getElementById('ld-seats').value = l.seats||1;
    document.getElementById('ld-followup').value = l.nextFollowUp||'';
    document.getElementById('ld-notes').value = l.notes||'';
    document.getElementById('ld-agency-name').value = l.agencyName||'';
    renderActivities(l);
  } else {
    document.getElementById('ld-id').value = '';
    document.getElementById('ld-name').value = '';
    document.getElementById('ld-company').value = '';
    document.getElementById('ld-phone').value = '';
    document.getElementById('ld-email').value = '';
    document.getElementById('ld-source').value = 'Cold Call';
    document.getElementById('ld-stage').value = 'New';
    document.getElementById('ld-seats').value = 1;
    document.getElementById('ld-followup').value = '';
    document.getElementById('ld-notes').value = '';
    document.getElementById('ld-agency-name').value = '';
  }
  onLeadSourceChange();
  document.getElementById('leadModal').classList.add('open');
}
function closeLeadModal(){ document.getElementById('leadModal').classList.remove('open'); }
function renderActivities(l){
  const el = document.getElementById('ld-activities');
  const acts = [...(l.activities||[])].reverse();
  el.innerHTML = acts.length ? acts.map(a=>`<div class="activity-item"><span class="activity-type">${esc(a.type)}</span><div class="activity-body">${esc(a.notes)}<div class="activity-date">${fmtDate(a.date)}</div></div></div>`).join('') : '<div style="color:var(--text3);font-size:12px;">No activity logged yet.</div>';
}
async function importLeadsExcelFile(input){
  if(typeof XLSX==='undefined'){alert('Excel library failed to load.');return;}
  const file=input?.files?.[0]; if(!file)return;
  try{
    const wb=XLSX.read(new Uint8Array(await file.arrayBuffer()),{type:'array',cellDates:true});
    const sheetName=wb.SheetNames[0], ws=wb.Sheets[sheetName];
    const rows=XLSX.utils.sheet_to_json(ws,{defval:'',raw:false});
    if(!rows.length){alert('The selected Excel file contains no data rows.');return;}
    const aliases={
      name:['name','lead name','contact name'],
      company:['company','company name','organisation','organization'],
      phone:['phone','mobile','mobile number','contact number'],
      email:['email','email address'],
      source:['source','lead source'],
      stage:['stage','status'],
      seats:['seats','seats interested','number of seats'],
      nextFollowUp:['next follow-up','next follow up','follow-up date','follow up date'],
      notes:['notes','remarks','comments'],
      agencyName:['agency name','agency']
    };
    const keyFor=(obj,names)=>{const keys=Object.keys(obj);return keys.find(k=>names.includes(String(k).trim().toLowerCase()));};
    const parsed=rows.map((r,index)=>{
      const get=(field)=>{const k=keyFor(r,aliases[field]);return k==null?'':String(r[k]??'').trim();};
      const name=get('name'); if(!name)throw new Error(`Row ${index+2}: Name is required.`);
      const source=get('source')||'Other', stage=get('stage')||'New';
      if(!LEAD_SOURCES.includes(source))throw new Error(`Row ${index+2}: Invalid source "${source}".`);
      if(!LEAD_STAGES.includes(stage))throw new Error(`Row ${index+2}: Invalid stage "${stage}".`);
      return {name,company:get('company'),phone:get('phone'),email:get('email'),source,stage,seats:Math.max(1,parseInt(get('seats'))||1),nextFollowUp:get('nextFollowUp')||null,notes:get('notes'),agencyName:source==='Agency'?get('agencyName'):''};
    });
    const preview=parsed.slice(0,10).map((r,i)=>`${i+1}. ${r.name} — ${r.company||'No company'} — ${r.source} — ${r.stage}`).join('\n');
    const extra=parsed.length>10?`\n… and ${parsed.length-10} more row(s).`:'';
    if(!confirm(`Preview (${parsed.length} lead(s)):\n\n${preview}${extra}\n\nImport these records?`))return;
    let added=0,updated=0;
    parsed.forEach(r=>{
      const existing=leads.find(l=>(r.email&&l.email&&l.email.toLowerCase()===r.email.toLowerCase())||(r.phone&&l.phone&&l.phone===r.phone));
      if(existing){Object.assign(existing,r);updated++;}else{leads.push({id:'lead-'+Date.now()+'-'+added,...r,created:today(),activities:[]});added++;}
    });
    await saveLeads({throwOnFailure:true});
    input.value='';refreshAll();
    alert(`Lead import successful. Added: ${added}. Updated: ${updated}.`);
  }catch(e){console.error('Lead Excel import failed:',e);alert(e.message||'Lead Excel import failed.');}
}
async function saveLead(){
  const id = document.getElementById('ld-id').value;
  const name = document.getElementById('ld-name').value.trim();
  if(!name){ alert('Lead name is required.'); return; }
  const source = document.getElementById('ld-source').value;
  const data = {
    name, company: document.getElementById('ld-company').value.trim(),
    phone: document.getElementById('ld-phone').value.trim(), email: document.getElementById('ld-email').value.trim(),
    source, stage: document.getElementById('ld-stage').value,
    seats: parseInt(document.getElementById('ld-seats').value)||1, nextFollowUp: document.getElementById('ld-followup').value||null,
    notes: document.getElementById('ld-notes').value.trim(),
    agencyName: source==='Agency' ? document.getElementById('ld-agency-name').value.trim() : ''
  };
  const previous = leads.map(l=>({...l,activities:Array.isArray(l.activities)?l.activities.map(a=>({...a})):[]}));
  if(id){
    const l = leads.find(l=>l.id===id);
    if(!l){alert('Lead record not found. Refresh and try again.');return;}
    Object.assign(l, data);
  } else {
    leads.push({ id:'lead-'+Date.now(), ...data, created: today(), activities:[] });
  }
  try{
    await saveLeads({throwOnFailure:true});
    closeLeadModal(); refreshAll();
    alert(id?'Lead updated successfully.':'Lead saved successfully.');
  }catch(e){
    leads=previous;
    alert(e.message||'Unable to save lead. Please try again.');
  }
}
function deleteLeadFromModal(){
  const id = document.getElementById('ld-id').value;
  if(!id) return;
  if(!confirm('Delete this lead permanently?')) return;
  leads = leads.filter(l=>l.id!==id);
  saveLeads(); closeLeadModal(); refreshAll();
}
function addActivity(){
  const id = document.getElementById('ld-id').value;
  const l = leads.find(l=>l.id===id);
  if(!l) return;
  const type = document.getElementById('act-type').value;
  const notes = document.getElementById('act-notes').value.trim();
  if(!notes){ alert('Add a short note about this activity.'); return; }
  l.activities = l.activities||[];
  l.activities.push({id:'act-'+Date.now(), date: today(), type, notes});
  if(l.stage==='New') l.stage='Contacted';
  document.getElementById('act-notes').value='';
  document.getElementById('ld-stage').value = l.stage;
  saveLeads(); renderActivities(l); renderSalesPage();
}
function draftFollowupEmail(){
  const id = document.getElementById('ld-id').value;
  const l = leads.find(l=>l.id===id);
  if(!l) return;
  const subject = 'COLLABOR8 Co-Working Space — Following up, '+l.name;
  const body = `Hi ${l.name},

Just following up on your interest in a workspace at COLLABOR8 (No.9 & 10, Chakrapani Street, Guindy, Chennai). Happy to help with a seat/cabin that fits your needs (${l.seats||1} seat(s) discussed) and share a quotation.

Let me know a good time to connect.

Best regards,
COLLABOR8 Team`;
  showEmailPreview(l.email, subject, body, { title: 'Preview Follow-up Email — '+l.name });
}
function convertLeadToOccupant(){
  const id = document.getElementById('ld-id').value;
  const l = leads.find(l=>l.id===id);
  if(!l) return;
  l.stage = 'Converted';
  saveLeads();
  closeLeadModal();
  showPage('add', null);
  setTimeout(()=>{
    document.getElementById('f2-name').value = l.name;
    document.getElementById('f2-company').value = l.company||'';
    document.getElementById('f2-email').value = l.email||'';
    document.getElementById('f2-phone').value = l.phone||'';
  }, 50);
}

// ---- Quotations ----
function openQuoteModal(leadId){
  document.getElementById('q-lead-id').value = leadId||'';
  const l = leadId ? leads.find(l=>l.id===leadId) : null;
  document.getElementById('q-name').value = l ? l.name : '';
  document.getElementById('q-company').value = l ? (l.company||'') : '';
  document.getElementById('q-email').value = l ? (l.email||'') : '';
  document.getElementById('q-seats').value = l ? (l.seats||1) : 1;
  document.getElementById('q-discount').value = 0;
  const dt = new Date(); dt.setDate(dt.getDate()+14);
  document.getElementById('q-valid').value = dt.toISOString().slice(0,10);
  document.getElementById('q-notes').value = '';
  updateQuotePreview();
  document.getElementById('quoteModal').classList.add('open');
}
function closeQuoteModal(){ document.getElementById('quoteModal').classList.remove('open'); }
function buildQuoteText(){
  const seats = parseInt(document.getElementById('q-seats').value)||1;
  const discount = parseFloat(document.getElementById('q-discount').value)||0;
  const base = seats*RATE_PER_SEAT;
  const final = Math.round(base*(1-discount/100));
  const valid = document.getElementById('q-valid').value;
  const notes = document.getElementById('q-notes').value.trim();
  const name = document.getElementById('q-name').value.trim()||'Prospective Client';
  const company = document.getElementById('q-company').value.trim();
  return {seats, discount, base, final, valid, notes, name, company, text:
`COLLABOR8 CO-WORKING SPACE — QUOTATION
No.9 & 10, Chakrapani Street, Guindy, Chennai – 600032

Date: ${fmtDate(today())}
To: ${name}${company?', '+company:''}

Seats Required: ${seats}
${discount>0?'Rate: Rs.'+base.toLocaleString('en-IN')+' + GST (Rs.'+RATE_PER_SEAT.toLocaleString('en-IN')+'/seat)':''}
${discount>0?'Discount: '+discount+'% → Rs.'+final.toLocaleString('en-IN')+' + GST per month':'Monthly Fee: Rs.'+final.toLocaleString('en-IN')+' + GST (Rs.'+RATE_PER_SEAT.toLocaleString('en-IN')+'/seat)'}

Security Deposit (3 months): Rs.${(final*3).toLocaleString('en-IN')}
Advance Fee (1 month): Rs.${final.toLocaleString('en-IN')}

Terms: 11-month lock-in · 3-month notice before lock-in completion · 10% escalation after 11 months
Car Parking: Rs.5,000 + GST/car/month · Conference room: 3 hrs/month free (5-seater cabins & above)
Working Hours: Mon–Sat 9:00 AM–7:00 PM (2nd Sat & Sun holiday)

Valid Until: ${valid?fmtDate(valid):'—'}
${notes?'\nNotes: '+notes:''}

We look forward to welcoming you to COLLABOR8.`};
}
function updateQuotePreview(){ document.getElementById('q-preview').textContent = buildQuoteText().text; }
function copyQuoteText(){ copyText(buildQuoteText().text); }
function draftQuoteEmail(){
  const q = buildQuoteText();
  const email = document.getElementById('q-email').value.trim();
  showEmailPreview(email, 'COLLABOR8 Quotation — '+q.name, q.text, { title: 'Preview Quotation Email — '+q.name });
}
function saveQuotation(){
  const q = buildQuoteText();
  const leadId = document.getElementById('q-lead-id').value||null;
  quotations.push({ id:'quote-'+Date.now(), leadId, clientName:q.name, company:q.company, email:document.getElementById('q-email').value.trim(),
    seatCount:q.seats, monthlyRent:q.base, discountPct:q.discount, finalRent:q.final, validUntil:q.valid, created:today(), notes:q.notes, status:'Draft', text:q.text });
  if(leadId){ const l=leads.find(l=>l.id===leadId); if(l && l.stage!=='Converted' && l.stage!=='Lost') l.stage='Quotation Sent'; saveLeads(); }
  saveQuotations();
  closeQuoteModal();
  refreshAll();
}
function viewQuotation(id){
  const q = quotations.find(q=>q.id===id);
  if(!q) return;
  alert(q.text);
}
function deleteQuotation(id){
  if(!confirm('Delete this quotation?')) return;
  quotations = quotations.filter(q=>q.id!==id);
  saveQuotations(); refreshAll();
}

function renderRevenuePage(){
  const body = document.getElementById('pay-body');
  const revList = document.getElementById('rev-by-tenant');
  if(!body) return;
  const active = occupants.filter(o=>getStatus(o)!=='expired');
  body.innerHTML = active.map(o=>{
    const parkingCost = parkingRevenueFor(o);
    const total = (o.rent||0)+parkingCost;
    const isSent = o.reminder_sent;
    return `<tr><td>${esc(o.name)}<br><small style="color:var(--text3)">${esc(o.comp||'')}</small></td><td>${esc(o.cabins.join(', '))}</td>
      <td>₹${(o.rent||0).toLocaleString('en-IN')}</td><td>${parkingCost?'₹'+parkingCost.toLocaleString('en-IN'):'—'}</td>
      <td style="font-weight:600;color:var(--gold)">₹${total.toLocaleString('en-IN')}</td><td style="font-size:12px;color:var(--text3)">1st of month</td>
      <td>${isSent?'<span class="reminder-sent">✓ Sent</span>':`<button class="btn btn-sm" onclick="sendReminder('${o.id}')">Send Reminder</button>`}</td></tr>`;
  }).join('');
  if(revList){
    const sumRent = active.reduce((s,a)=>s+(a.rent||0),0)||1;
    revList.innerHTML = active.map(o=>{
      const pct = Math.round((o.rent||0)/sumRent*100)||0;
      return `<div class="summary-row"><div class="summary-dot" style="background:var(--teal)"></div><div class="summary-label">${esc(o.name)} <span style="color:var(--text3)">(${esc(o.comp||'')})</span></div><div class="summary-val">₹${(o.rent||0).toLocaleString('en-IN')}</div><div class="summary-pct">${pct}%</div></div>`;
    }).join('') || '<div class="empty-state">No active tenants</div>';
  }
}
function sendReminder(id){ const o=occupants.find(x=>x.id===id); if(o){ o.reminder_sent=true; saveOccupants(); renderRevenuePage(); } }

// ══════════════════════════════════ RECENT ══════════════════════════════════
function renderRecentTable(){
  const body = document.getElementById('recent-table');
  if(!body) return;
  const last5 = [...occupants].slice(-5).reverse();
  const pill = (o)=>{ const st=getStatus(o); if(st==='expired') return '<span class="status-pill status-expired">Expired</span>'; if(st==='expiring') return '<span class="status-pill status-expiring">Expiring</span>'; return '<span class="status-pill status-active">Active</span>'; };
  body.innerHTML = last5.map(o=>`<tr><td>${esc(o.cabins.join(', '))}</td><td>${esc(o.name)}</td><td>${esc(o.comp||'—')}</td><td>${fmtINR(o.rent||0)}</td><td>${fmtDate(o.end)}</td><td>${pill(o)}</td></tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:20px;">No occupants yet</td></tr>';
}

// ══════════════════════════════════ MODAL (quick add) ══════════════════════════════════
function openModal(){ document.getElementById('modal').classList.add('open'); }
function closeModal(){ document.getElementById('modal').classList.remove('open'); }
function syncQuickParkingFields(){ const slots=Math.max(0,parseInt(document.getElementById('f-parking')?.value)||0); const el=document.getElementById('f-parking-revenue'); if(el && el.dataset.manual!=='true') el.value=slots*PARKING_RATE; }
function onQuickParkingRevenueChange(){ const el=document.getElementById('f-parking-revenue'); if(el) el.dataset.manual='true'; }
document.getElementById('modal').addEventListener('click', function(e){ if(e.target===this) closeModal(); });
function saveOccupantQuick(){
  const wsRaw = document.getElementById('f-ws').value.trim();
  const name = document.getElementById('f-name').value.trim();
  if(!wsRaw||!name){ alert('Cabin ID(s) and name are required'); return; }
  const ids = wsRaw.split(',').map(s=>s.trim()).filter(Boolean);
  const missing = ids.filter(id=>!cabins.some(c=>c.id===id));
  if(missing.length){ alert('Unknown cabin ID(s): '+missing.join(', ')); return; }
  const taken = ids.filter(id=>cabins.find(c=>c.id===id).occupied);
  if(taken.length){ alert('Already occupied: '+taken.join(', ')); return; }
  const seatCount = ids.reduce((s,id)=>s+cabins.find(c=>c.id===id).seater,0);
  const rent = seatCount*RATE_PER_SEAT;
  const o = { id:'occ-'+Date.now(), name, comp:document.getElementById('f-company').value.trim(),
    email:document.getElementById('f-email').value.trim(), phone:document.getElementById('f-phone').value.trim(),
    cabins:ids, start:document.getElementById('f-start').value, end:document.getElementById('f-end').value,
    rent, deposit:parseFloat(document.getElementById('f-deposit').value)||rent*3, advance:parseFloat(document.getElementById('f-advance').value)||rent, parking:parseInt(document.getElementById('f-parking').value)||0,
    parkingRevenue:parseFloat(document.getElementById('f-parking-revenue').value)||0, parkingDeposit:parseFloat(document.getElementById('f-parking-deposit').value)||0,
    escalation:10, reminder_sent:false };
  occupants.push(o);
  ids.forEach(id=>{ const c=cabins.find(c=>c.id===id); c.occupied=true; c.occupantId=o.id; c.occupantName=name; });
  saveOccupants(); saveCabins(); closeModal(); refreshAll();
}

// ══════════════════════════════════ ADD OCCUPANT PAGE ══════════════════════════════════
let addSeatAllocations = {}; window.addSeatAllocations=addSeatAllocations;
function setAddFloorFilter(f){
  addFloorFilter = f;
  document.querySelectorAll('.cabin-toolbar .filter-btn[data-floor]').forEach(b=>b.classList.toggle('active', b.dataset.floor===f));
  renderAddCabinChoices();
}
function toggleAddAvailOnly(){
  addAvailOnly = !addAvailOnly;
  document.getElementById('a-avail-toggle').classList.toggle('active', addAvailOnly);
  renderAddCabinChoices();
}
function renderAddCabinChoices(){
  const grid = document.getElementById('a-cabin-grid');
  const search = (document.getElementById('a-cabin-search')?.value || '').trim().toUpperCase();
  let list = cabins.filter(c=>{
    if(addFloorFilter!=='all' && c.floor!==addFloorFilter) return false;
    if(addAvailOnly && isCabinOccupied(c)) return false;
    if(search && !c.id.toUpperCase().includes(search)) return false;
    return true;
  });
  // keep previously selected but now-filtered-out cabins selectable via summary, but only render matching ones as cards
  grid.innerHTML = list.length ? list.map(c=>{
    const selected = selectedAddCabinIds.has(c.id);
    const rent = c.seater*RATE_PER_SEAT;
    return `<div class="cabin-card ${selected?'selected':''} ${isCabinOccupied(c)?'occupied-card':''}" onclick="toggleAddCabin('${c.id}')">
      <div class="cabin-card-top">
        <div class="cabin-card-id">${c.id}</div>
        <div class="cabin-card-toggle">${selected?'✓':''}</div>
      </div>
      <div class="cabin-card-floor">${c.floor}</div>
      <div class="cabin-card-meta"><span>${c.seater} Seat${c.seater>1?'s':''}</span><span class="cabin-card-rent">₹${rent.toLocaleString('en-IN')}/mo</span></div>
      <div class="cabin-card-status" style="${isCabinOccupied(c)?'color:var(--red)':''}">
        <div class="cabin-card-status-dot" style="${isCabinOccupied(c)?'background:var(--red)':''}"></div>${isCabinOccupied(c)?'Occupied':'Available'}
      </div>
    </div>`;
  }).join('') : '<div style="grid-column:1/-1;color:var(--text3);font-size:12px;padding:20px;text-align:center;">No cabins match this search/filter.</div>';
  recalcTariff();
  renderSeatAllocationEditor('a-seat-allocation', selectedAddCabins(), window.addSeatAllocations||{});
}
function toggleAddCabin(id){
  const c = cabins.find(c=>c.id===id);
  if(c && isCabinOccupied(c)) return; // occupied cabins aren't selectable
  if(selectedAddCabinIds.has(id)) { selectedAddCabinIds.delete(id); if(window.addSeatAllocations) delete window.addSeatAllocations[id]; } else { selectedAddCabinIds.add(id); window.addSeatAllocations=window.addSeatAllocations||{}; window.addSeatAllocations[id]=c.seater; }
  renderAddCabinChoices();
}
function selectedAddCabins(){
  return Array.from(selectedAddCabinIds);
}
function recalcTariff(){
  const ids=selectedAddCabins(); const capacity=ids.reduce((s,id)=>{const c=cabins.find(x=>x.id===id);return s+(c?c.seater:0)},0); const defaultRent=capacity*RATE_PER_SEAT;
  document.getElementById('a-sum-count').textContent=ids.length; document.getElementById('a-sum-seats').textContent=ids.reduce((s,id)=>{const c=cabins.find(x=>x.id===id);const n=window.addSeatAllocations&&window.addSeatAllocations[id];return s+(c?Math.min(Number(n)||c.seater,c.seater):0)},0);document.getElementById('a-sum-rent').textContent='₹'+defaultRent.toLocaleString('en-IN');
  const rent=document.getElementById('f2-rent'); if(rent.dataset.manual!=='true') rent.value=defaultRent; const r=Number(rent.value)||0;
  const deposit=document.getElementById('f2-deposit'); if(deposit.dataset.manual!=='true') deposit.value=r*3;
  const advance=document.getElementById('f2-advance'); if(advance.dataset.manual!=='true') advance.value=r;
  updateParkingFields();
}
// Deposit and Advance are independently editable now (previously readonly and force-recalculated
// from rent). Each field only auto-follows the rent until the user manually edits it themselves,
// same pattern already used for the rent field's own auto-fill from seat capacity.
function onManualRentChange(){
  const rent=parseFloat(document.getElementById('f2-rent').value)||0;
  const deposit=document.getElementById('f2-deposit'); if(deposit.dataset.manual!=='true') deposit.value=rent*3;
  const advance=document.getElementById('f2-advance'); if(advance.dataset.manual!=='true') advance.value=rent;
  document.getElementById('f2-rent').dataset.manual='true';
}
function onManualDepositChange(){document.getElementById('f2-deposit').dataset.manual='true';}
function onManualAdvanceChange(){document.getElementById('f2-advance').dataset.manual='true';}
function updateParkingFields(){
  const slots=Math.max(0,parseInt(document.getElementById('f2-parking').value)||0);
  const revenue=document.getElementById('f2-parking-revenue');
  if(revenue && revenue.dataset.manual!=='true') revenue.value=slots*PARKING_RATE;
}
function onManualParkingRevenueChange(){ const el=document.getElementById('f2-parking-revenue'); if(el) el.dataset.manual='true'; }
function autofillEnd(){const startVal=readAgreementDate('f2-start');if(!startVal)return;const dt=new Date(startVal+'T00:00:00');dt.setMonth(dt.getMonth()+11);document.getElementById('f2-end').value=formatDateDDMMYYYY(dt.toISOString().slice(0,10));}
async function saveFromPage(){
  const ids=selectedAddCabins(),name=document.getElementById('f2-name').value.trim();if(!ids.length||!name){alert('Select at least one cabin and enter the occupant name.');return;}
  const unavailable=ids.filter(id=>isCabinOccupied(cabins.find(c=>c.id===id)));
  if(unavailable.length){alert('These cabin(s) are already assigned: '+unavailable.join(', ')+'. Refresh and choose vacant cabin(s).');return;}
  const allocations=collectSeatAllocations('a-seat-allocation');let totalAllocated=0;for(const cid of ids){const c=cabins.find(x=>x.id===cid);const n=Number(allocations[cid]);if(!c||n<1||n>c.seater){alert('Please enter 1 to '+(c?c.seater:0)+' occupied seats for '+cid+'.');return;}totalAllocated+=n;}
  const start=readAgreementDate('f2-start'),end=readAgreementDate('f2-end');if(!start){alert('Agreement start date is required in DD/MM/YYYY format.');return;}if(!end){alert('Agreement end date is required in DD/MM/YYYY format.');return;}if(end<start){alert('Agreement end date cannot be before the start date.');return;}
  const rent=parseFloat(document.getElementById('f2-rent').value)||0,deposit=parseFloat(document.getElementById('f2-deposit').value)||rent*3,advance=parseFloat(document.getElementById('f2-advance').value)||rent;
  const parking=parseInt(document.getElementById('f2-parking').value)||0;
  const parkingRevenue=Math.max(0,parseFloat(document.getElementById('f2-parking-revenue').value)||parking*PARKING_RATE);
  const parkingDeposit=Math.max(0,parseFloat(document.getElementById('f2-parking-deposit').value)||0);
  const o={id:'occ-'+Date.now(),name,comp:document.getElementById('f2-company').value.trim(),email:document.getElementById('f2-email').value.trim(),phone:document.getElementById('f2-phone').value.trim(),cabins:ids,seatAllocations:allocations,start,end,rent,deposit,advance,parking,parkingRevenue,parkingDeposit,escalation:10,reminder_sent:false};
  occupants.push(o);ids.forEach(id=>{const c=cabins.find(x=>x.id===id);c.occupied=true;c.occupantId=o.id;c.occupantName=name;});saveOccupants();saveCabins();
  const fileInput=document.getElementById('f2-doc');
  const finish=()=>{alert('Lease registered successfully for '+totalAllocated+' occupied seat(s).');['f2-name','f2-company','f2-email','f2-phone'].forEach(id=>document.getElementById(id).value='');document.getElementById('f2-parking').value='0';document.getElementById('f2-parking-revenue').value='0';document.getElementById('f2-parking-deposit').value='0';document.getElementById('f2-start').value='';document.getElementById('f2-end').value='';document.getElementById('f2-doc').value='';selectedAddCabinIds.clear();window.addSeatAllocations={};document.getElementById('a-cabin-search').value='';document.getElementById('f2-rent').dataset.manual='';document.getElementById('f2-deposit').dataset.manual='';document.getElementById('f2-advance').dataset.manual='';renderAddCabinChoices();refreshAll();};
  if(fileInput.files&&fileInput.files[0]){const file=fileInput.files[0];const meta=await uploadDocumentToDrive(file,{category:'Signed Agreement',occupantId:o.id,documentType:'Signed Agreement',notes:'Auto-attached during lease registration for '+name});if(meta){documents.push(meta);}else{return;}}
  finish();
}

// ══════════════════════════════════ DOCUMENTS ══════════════════════════════════
const DOC_CATS = ['All','Template','Signed Agreement','KYC','Other'];
function renderDocFilters(){
  document.getElementById('doc-filters').innerHTML = DOC_CATS.map(c=>`<button class="filter-btn ${docFilterCurrent===c?'active':''}" onclick="setDocFilter('${c}')">${c}</button>`).join('');
}
function setDocFilter(c){ docFilterCurrent=c; renderDocuments(); }
function populateDocLinkSelect(){
  const sel = document.getElementById('doc-link-occ');
  sel.innerHTML = '<option value="">— None —</option>' + occupants.map(o=>`<option value="${o.id}">${esc(o.name)} (${esc(o.comp||'—')})</option>`).join('');
}
function iconFor(mime, name){
  if(/word|docx?/.test(mime)||/\.docx?$/i.test(name)) return '📄';
  if(/pdf/.test(mime)) return '📕';
  if(/image/.test(mime)) return '🖼️';
  if(/sheet|excel|csv/.test(mime)) return '📊';
  return '📁';
}
function renderDocuments(){
  renderDocFilters();
  populateDocLinkSelect();
  const q = (document.getElementById('doc-search')?.value||'').toLowerCase();
  let list = documents;
  if(docFilterCurrent!=='All') list = list.filter(d=>d.category===docFilterCurrent);
  if(q) list = list.filter(d=> d.name.toLowerCase().includes(q) || (d.notes||'').toLowerCase().includes(q));
  const grid = document.getElementById('doc-grid');
  const empty = document.getElementById('doc-empty');
  document.getElementById('doc-count-label').textContent = list.length + ' document(s)';
  if(!list.length){ grid.innerHTML=''; empty.style.display='block'; }
  else {
    empty.style.display='none';
    grid.innerHTML = list.map(d=>{
      const occ = occupants.find(o=>o.id===d.linkedOccupantId);
      return `<div class="doc-card">
        <div class="doc-icon">${iconFor(d.mime,d.name)}</div>
        <div class="doc-name">${esc(d.name)}</div>
        <span class="doc-badge ${esc(d.category.replace(/\s+/g,''))}">${esc(d.category)}</span>
        <div class="doc-meta">${fmtBytes(d.size)} · uploaded ${fmtDate(d.uploaded)}</div>
        ${occ?`<div class="doc-meta">Linked: ${esc(occ.name)}</div>`:''}
        ${d.notes?`<div class="doc-meta" style="font-style:italic;">${esc(d.notes)}</div>`:''}
        <div class="doc-actions">
          ${d.googleDriveFileId?`<button class="btn btn-sm" onclick="downloadDriveDocument('${esc(d.googleDriveFileId)}','${esc(d.fileName||d.name)}')">⬇ Open / Download</button>`:`<a class="btn btn-sm" href="${d.dataUrl}" download="${esc(d.name)}">⬇ Download</a>`}
          <button class="btn btn-sm btn-danger" onclick="deleteDocument('${d.id}')">Delete</button>
        </div>
      </div>`;
    }).join('');
  }
  const used = documents.reduce((s,d)=>s+(d.size||0),0);
  const pct = Math.min(100, Math.round(used/(5*1024*1024)*100));
  document.getElementById('storage-meter').textContent = fmtBytes(used) + ' stored in Google Drive · 5 MB maximum per document';
  document.getElementById('storage-fill').style.width = pct+'%';
}
const DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;
const DOCUMENT_ALLOWED_TYPES = new Set(['application/pdf','image/jpeg','image/png']);

function readFileAsDataUrl(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result||''));
    reader.onerror=()=>reject(new Error('Unable to read the selected file.'));
    reader.readAsDataURL(file);
  });
}

async function uploadDocumentToDrive(file, options={}){
  if(!file) return null;
  if(file.size<=0){alert('The selected file is empty.');return null;}
  if(file.size>DOCUMENT_MAX_BYTES){alert('Maximum document size is 5 MB.');return null;}
  if(!DOCUMENT_ALLOWED_TYPES.has(file.type)){alert('Only PDF, JPG and PNG files are allowed.');return null;}

  try{
    // Start a Google Drive resumable upload. The file bytes never pass through
    // Vercel, which avoids Vercel's 4.5 MB Function request-payload limit.
    const init=await fetch('/api/documents',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'initiateUpload',name:file.name,mime:file.type,size:file.size})});
    const initJson=await init.json().catch(()=>({}));
    if(!init.ok||!initJson.sessionUrl)throw new Error(initJson?.error?.message||'Could not start Google Drive upload.');

    // Do not PUT directly to Google's cross-origin resumable URL from the browser.
    // Proxy small chunks through our own Vercel API to avoid browser CORS failures.
    const CHUNK_SIZE = 1024 * 1024;
    let driveFile = null;
    for(let start=0; start<file.size; start+=CHUNK_SIZE){
      const end=Math.min(file.size,start+CHUNK_SIZE);
      const chunk=await file.slice(start,end).arrayBuffer();
      let binary='';
      const bytes=new Uint8Array(chunk);
      const STEP=0x8000;
      for(let i=0;i<bytes.length;i+=STEP) binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+STEP,bytes.length)));
      const chunkBase64=btoa(binary);
      const part=await fetch('/api/documents',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'uploadChunk',sessionUrl:initJson.sessionUrl,mime:file.type,start,total:file.size,chunkBase64})});
      const partJson=await part.json().catch(()=>({}));
      if(!part.ok||!partJson.success)throw new Error(partJson?.error?.message||`Google Drive upload failed (${part.status}).`);
      if(partJson.completed)driveFile=partJson.data||null;
    }
    if(!driveFile?.id)throw new Error('Google Drive did not return a file id after upload.');

    const finish=await fetch('/api/documents',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'finalizeUpload',googleDriveFileId:driveFile.id,name:file.name,mime:file.type,size:file.size,occupantId:options.occupantId||'',documentType:options.documentType||options.category||'Other',notes:options.notes||''})});
    const finishJson=await finish.json().catch(()=>({}));
    if(!finish.ok)throw new Error(finishJson?.error?.message||'File uploaded but metadata could not be saved.');
    return Object.assign(finishJson.data||{}, {name:finishJson.data?.fileName||file.name,category:options.category||options.documentType||'Other',linkedOccupantId:options.occupantId||null,uploaded:finishJson.data?.uploadedAt||today()});
  }catch(error){
    console.error('Document upload failed:',error);
    alert(error.message||'Document upload failed.');
    return null;
  }
}

async function deleteDriveDocument(id){
  if(!id)return true;
  try{
    const r=await fetch('/api/documents',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'delete',id})});
    return r.ok;
  }catch(error){console.error('Document delete failed:',error);return false;}
}

function downloadDriveDocument(id,name='document'){
  if(!id)return;
  const url='/api/documents?action=download&id='+encodeURIComponent(id);
  const a=document.createElement('a'); a.href=url; a.target='_blank'; a.rel='noopener'; a.download=name; document.body.appendChild(a); a.click(); a.remove();
}

async function handleDocUpload(e){
  const file=e.target.files[0]; if(!file) return;
  const meta=await uploadDocumentToDrive(file,{category:document.getElementById('doc-cat').value,occupantId:document.getElementById('doc-link-occ').value||'',documentType:document.getElementById('doc-cat').value});
  if(meta){ documents.push(meta); e.target.value=''; refreshAll(); }
}
async function deleteDocument(id){
  if(!confirm('Delete this document permanently?')) return;
  const d=documents.find(x=>x.id===id);
  if(d?.googleDriveFileId && !(await deleteDriveDocument(d.googleDriveFileId))){ alert('Document could not be deleted from Google Drive.'); return; }
  documents=documents.filter(x=>x.id!==id); refreshAll();
}

// ══════════════════════════════════ OCCUPANT KYC DOCUMENTS (Edit Occupant modal) ══════════════════════════════════
const OCC_DOC_TYPES = ['Aadhaar Card','PAN Card','GST Certificate','NOC'];
const OCC_DOC_ALLOWED_EXT = ['pdf','jpg','jpeg','png'];
let occDocPendingType = null; // which slot the hidden file input is currently uploading for

function occDocFor(occId, type){
  return documents.find(d=>d.linkedOccupantId===occId && d.docType===type) || null;
}
function renderOccDocs(occId){
  const grid = document.getElementById('eo-docs-grid');
  if(!grid) return;
  grid.innerHTML = OCC_DOC_TYPES.map(type=>{
    const d = occDocFor(occId, type);
    if(!d){
      return `<div class="occ-doc-card empty">
        <div class="occ-doc-type">${type}</div>
        <div class="occ-doc-status pending">○ Not uploaded</div>
        <div class="occ-doc-actions"><button class="btn btn-sm" onclick="triggerOccDocUpload('${occId}','${type}')">⬆ Upload</button></div>
      </div>`;
    }
    return `<div class="occ-doc-card">
      <div class="occ-doc-type">${type}</div>
      <div class="occ-doc-file">${iconFor(d.mime,d.name)} ${esc(d.name)}</div>
      <div class="occ-doc-status">✓ Uploaded ${fmtDate(d.uploaded)}</div>
      <div class="occ-doc-actions">
        <button class="btn btn-sm" onclick="viewOccDoc('${d.id}')">View</button>
        <button class="btn btn-sm" onclick="triggerOccDocUpload('${occId}','${type}')">Replace</button>
        <button class="btn btn-sm btn-danger" onclick="deleteOccDoc('${d.id}','${occId}')">Delete</button>
      </div>
    </div>`;
  }).join('');
}
function triggerOccDocUpload(occId, type){
  occDocPendingType = type;
  const input = document.getElementById('eo-doc-file-input');
  input.dataset.occId = occId;
  input.value = '';
  input.click();
}
async function onOccDocFileChosen(e){
  const file=e.target.files[0], occId=e.target.dataset.occId, type=occDocPendingType;
  if(!file||!occId||!type)return;
  const meta=await uploadDocumentToDrive(file,{occupantId:occId,documentType:type,category:'KYC'});
  if(!meta)return;
  const existing=occDocFor(occId,type);
  if(existing?.googleDriveFileId) await deleteDriveDocument(existing.googleDriveFileId);
  documents=documents.filter(d=>!(d.linkedOccupantId===occId&&d.docType===type));
  meta.linkedOccupantId=occId; meta.docType=type; meta.category='KYC'; documents.push(meta);
  e.target.value=''; renderOccDocs(occId); if(document.getElementById('page-documents').classList.contains('active'))renderDocuments(); if(document.getElementById('page-occupants').classList.contains('active'))renderOccupantsTable();
}
function viewOccDoc(id){ const d=documents.find(x=>x.id===id); if(!d)return; if(d.googleDriveFileId)return downloadDriveDocument(d.googleDriveFileId,d.fileName||d.name); if(d.dataUrl)window.open(d.dataUrl,'_blank'); }
async function deleteOccDoc(id, occId){
  if(!confirm('Delete this document permanently?')) return;
  const d=documents.find(x=>x.id===id);
  if(d?.googleDriveFileId && !(await deleteDriveDocument(d.googleDriveFileId))){ alert('Document could not be deleted from Google Drive.'); return; }
  documents = documents.filter(d=>d.id!==id);
  renderOccDocs(occId);
  if(document.getElementById('page-documents').classList.contains('active')) renderDocuments();
  if(document.getElementById('page-occupants').classList.contains('active')) renderOccupantsTable();
}

async function renderSettingsPage(){
  const el=document.getElementById('settings-content'); if(!el)return;
  el.innerHTML=`<div class="grid-2"><div class="card"><div class="card-title">Workspace Settings</div><div class="form-group"><label class="form-label">Payment Link</label><input class="form-input" id="set-payment-link" value="${esc(appSettings.paymentLink||'')}"/></div><div class="form-group"><label class="form-label">Default UPI ID</label><input class="form-input" id="set-upi" value="${esc(appSettings.upiId||'')}"/></div><div class="form-group"><label class="form-label">UPI Payee Name</label><input class="form-input" id="set-payee" value="${esc(appSettings.payeeName||'COLLABOR8')}"/></div><button class="btn btn-primary" onclick="saveSupportSettings()">Save Settings</button><span id="settings-note" style="margin-left:10px;color:var(--teal);font-size:12px;"></span></div><div class="card"><div class="card-title">System</div><div class="agreement-terms"><div class="term"><strong>Storage</strong> Google Sheets for CRM data · Google Drive for documents</div><div class="term"><strong>Documents</strong> PDF, JPG, PNG · maximum 5 MB</div><div class="term"><strong>Theme</strong> ${appSettings.theme==='light'?'Light':'Dark'}</div><div class="term"><strong>Role</strong> ${currentUser?.role||'—'}</div></div></div></div><div class="card" id="seating-settings-card" style="margin-top:16px;"></div>`;
  settingsEditingCabin=null; renderSeatingSettings();
}
function saveSupportSettings(){ appSettings.paymentLink=document.getElementById('set-payment-link').value.trim(); appSettings.upiId=document.getElementById('set-upi').value.trim(); appSettings.payeeName=document.getElementById('set-payee').value.trim()||'COLLABOR8'; saveSettings(); const n=document.getElementById('settings-note'); if(n)n.textContent='✓ Saved'; }
async function renderAuditPage(){
  const el=document.getElementById('audit-content'); if(!el)return;
  if(!currentUser||currentUser.role!=='admin'){el.innerHTML='<div class="empty-state">Admin access required.</div>';return;}
  el.innerHTML='<div class="card"><div class="card-title">Audit Log <button class="btn btn-sm" style="float:right" onclick="renderAuditPage()">↻ Refresh</button></div><div id="audit-table-wrap">Loading…</div></div>';
  const r=await fetch('/api/audit',{credentials:'include'}); const j=await r.json().catch(()=>({}));
  if(!r.ok){document.getElementById('audit-table-wrap').textContent=j?.error?.message||'Unable to load audit log.';return;}
  const rows=j.data||[]; document.getElementById('audit-table-wrap').innerHTML=rows.length?`<div style="overflow:auto"><table class="data-table"><thead><tr><th>Time</th><th>User</th><th>Action</th><th>Entity</th><th>Entity ID</th><th>Details</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(x.Timestamp||x.timestamp||'')}</td><td>${esc(x.Username||x.username||x['User ID']||'')}</td><td>${esc(x.Action||x.action||'')}</td><td>${esc(x.Entity||x.entity||'')}</td><td>${esc(x['Entity ID']||x.entityId||'')}</td><td>${esc(x['New Value']||x.newValue||x.details||'')}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty-state">No audit events yet.</div>';
}

async function renderReportsPage(){
 const el=document.getElementById('reports-content'); if(!el)return; if(!['admin','owner'].includes(currentUser?.role)){el.innerHTML='<div class="empty-state">Reports access required.</div>';return;} el.innerHTML='<div class="card">Loading live report…</div>';
 try{const r=await fetch('/api/reports',{credentials:'include'}),j=await r.json();if(!r.ok)throw new Error(j.error?.message||'Unable to load report');const m=j.metrics;const cards=[['Active Occupants',m.activeOccupants],['Collected',moneyIN(m.collected)],['Outstanding',moneyIN(m.outstanding)],['GST Collected',moneyIN(m.gstCollected)],['Bookings',m.bookings],['Leads',m.leads],['Converted Leads',m.convertedLeads],['Active Virtual Office',m.activeVirtualOffice]];el.innerHTML='<div class="grid-4">'+cards.map(x=>`<div class="metric-card"><div class="metric-label">${esc(x[0])}</div><div class="metric-value">${esc(String(x[1]))}</div></div>`).join('')+'</div><div class="card" style="margin-top:16px"><div class="card-title">Report source</div><div style="color:var(--text3);font-size:12px;line-height:1.7">Metrics are calculated from current Google Sheets records. No historical revenue or occupancy values are fabricated.</div></div>';}catch(e){el.innerHTML=`<div class="empty-state">${esc(e.message)}</div>`;}
}
function moneyIN(v){return '₹'+Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:2});}
async function renderUsersPage(){
 const el=document.getElementById('users-content');if(!el)return;if(!['admin','owner'].includes(currentUser?.role)){el.innerHTML='<div class="empty-state">User access required.</div>';return;}el.innerHTML='<div class="card">Loading users…</div>';
 try{const r=await fetch('/api/users',{credentials:'include'}),j=await r.json();if(!r.ok)throw new Error(j.error?.message||'Unable to load users');const rows=j.data||[];el.innerHTML=`<div class="card"><div class="card-title">Add User</div><div class="form-row"><div class="form-group"><label class="form-label">Username</label><input class="form-input" id="nu-user"></div><div class="form-group"><label class="form-label">Display Name</label><input class="form-input" id="nu-name"></div></div><div class="form-row"><div class="form-group"><label class="form-label">Role</label><select class="form-input" id="nu-role"><option value="staff">Staff</option><option value="admin">Admin</option></select></div><div class="form-group"><label class="form-label">Temporary Password</label><input class="form-input" id="nu-pass" type="password"></div></div><button class="btn btn-primary" onclick="createUser()">Create User</button></div><div class="card" style="margin-top:16px"><div class="card-title">Accounts</div><div style="overflow:auto"><table class="data-table"><thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(x.username)}</td><td>${esc(x.displayName)}</td><td>${esc(x.role)}</td><td>${x.active?'Active':'Disabled'}</td><td><button class="btn btn-sm" onclick="toggleUser('${esc(x.id)}',${x.active})">${x.active?'Disable':'Enable'}</button></td></tr>`).join('')}</tbody></table></div></div>`;}catch(e){el.innerHTML=`<div class="empty-state">${esc(e.message)}</div>`;}
}
async function createUser(){const b={username:document.getElementById('nu-user').value.trim(),displayName:document.getElementById('nu-name').value.trim(),role:document.getElementById('nu-role').value,password:document.getElementById('nu-pass').value};const r=await fetch('/api/users',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});const j=await r.json().catch(()=>({}));if(!r.ok){alert(j.error?.message||'Could not create user');return;}renderUsersPage();}
async function toggleUser(id,active){const r=await fetch('/api/users',{method:'PATCH',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,active:!active})});const j=await r.json().catch(()=>({}));if(!r.ok){alert(j.error?.message||'Could not update user');return;}renderUsersPage();}

// ══════════════════════════════════ THEME & MOBILE NAV ══════════════════════════════════
// Theme (and the other small settings below) are persisted to the "settings" tab in
// Google Sheets via appSettings/saveSettings — no localStorage involved.
function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  const icon = document.getElementById('theme-toggle-icon');
  const label = document.getElementById('theme-toggle-label');
  if(theme==='light'){ icon.textContent='☀'; label.textContent='Light mode'; }
  else { icon.textContent='☾'; label.textContent='Dark mode'; }
  appSettings.theme = theme;
}
function toggleTheme(){
  const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  applyTheme(current === 'light' ? 'dark' : 'light');
  saveSettings();
  if(typeof renderCharts === 'function') renderCharts();
}
function initTheme(){
  // Temporary pre-Sheets-load default so the screen isn't unstyled; syncAllFromSheets()
  // overrides this with the real saved theme once the initial load completes.
  const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  applyTheme(prefersLight ? 'light' : 'dark');
}
function toggleSidebar(){
  document.getElementById('main-sidebar').classList.toggle('open');
  document.getElementById('sidebar-backdrop').classList.toggle('open');
}
function closeSidebar(){
  document.getElementById('main-sidebar').classList.remove('open');
  document.getElementById('sidebar-backdrop').classList.remove('open');
}

// ══════════════════════════════════ PAGE NAV ══════════════════════════════════
function showPage(id, el){
  closeSidebar();
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const page = document.getElementById('page-'+id);
  if(page) page.classList.add('active');
  if(el) el.classList.add('active');
  else { const navEl = document.querySelector(`.nav-item[onclick*="'${id}'"]`); if(navEl) navEl.classList.add('active'); }
  if(['revenue','datasync','audit','reports','users'].includes(id) && (!currentUser || !['admin','owner'].includes(currentUser.role))){
    alert('This section is restricted to Admin accounts.');
    return showPage('dashboard');
  }
  if(id==='floors') renderFloorPage();
  if(id==='occupants') renderOccupantsTable();
  if(id==='vacated') renderVacatedClients();
  if(id==='payments') renderPaymentsPage();
  if(id==='invoices') renderInvoicesPage();
  if(id==='revenue') renderRevenuePage();
  if(id==='alerts') renderAlerts(alertTabCurrent);
  if(id==='documents') renderDocuments();
  if(id==='sales') renderSalesPage();
  if(id==='settings') renderSettingsPage();
  if(id==='audit') renderAuditPage();
  if(id==='reports') renderReportsPage();
  if(id==='users') renderUsersPage();
  if(id==='add') renderAddCabinChoices();
}

// ══════════════════════════════════ REFRESH ══════════════════════════════════
function refreshAll(){
  if(Array.isArray(occupants)) reconcileCabinOccupancy({persist:false});
  ensurePaymentsGenerated();
  updateMetrics();
  renderFloorSummaryCards();
  renderDashGrid();
  renderAlerts(alertTabCurrent);
  renderRecentTable();
  renderRevenuePage();
  renderOccupantsTable();
  if(document.getElementById('page-vacated')?.classList.contains('active')) renderVacatedClients();
  if(typeof renderVirtualOffice==='function') renderVirtualOffice();
  renderCharts();
  if(document.getElementById('page-floors').classList.contains('active')) renderFloorPage();
  if(document.getElementById('page-payments').classList.contains('active')) renderPaymentsPage();
  if(document.getElementById('page-invoices').classList.contains('active')) renderInvoicesPage();
  updateInvoiceNavBadge();
  if(document.getElementById('page-documents').classList.contains('active')) renderDocuments();
  if(document.getElementById('page-sales').classList.contains('active')) renderSalesPage();
}

// ══════════════════════════════════ INIT ══════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  setupIdleActivityTracking();
  initTheme();
  const dt = new Date();
  document.getElementById('today-date').textContent = dt.toLocaleDateString('en-IN',{weekday:'long',year:'numeric',month:'long',day:'numeric'}) + ' · Guindy, Chennai';
  checkAuthOnLoad();

  document.getElementById('login-username').focus();
});

// ══════════════════════════════════ PHASE 7 — OPERATIONS & AUTOMATION ══════════════════════════════════
const P7_API='/api/operations';
let p7Cache={maintenance:[],inventory:[],vendors:[],expenses:[],automation:[],integrations:[]};
async function p7Load(sheet){try{const r=await fetch(P7_API+'?sheet='+encodeURIComponent(sheet),{credentials:'include'}),j=await r.json();if(!r.ok)throw new Error(j.error?.message||'Unable to load '+sheet);p7Cache[sheet]=j.data||[];return p7Cache[sheet]}catch(e){console.error(e);return []}}
async function p7Save(sheet,record,id=null){const r=await fetch(P7_API,{method:id?'PATCH':'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({sheet,record,id})});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error?.message||'Save failed');p7Cache[sheet]=j.data||p7Cache[sheet];return j}
async function p7Delete(sheet,id){const r=await fetch(P7_API,{method:'DELETE',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({sheet,id})});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error?.message||'Delete failed');p7Cache[sheet]=j.data||[]}
function p7Money(v){return moneyIN(Number(v||0))}
function p7Date(v){return v?new Date(v).toLocaleDateString('en-IN'):''}
function p7Prompt(label,def=''){const v=prompt(label,def);return v===null?null:v.trim()}
async function renderP7Table(sheet,elId,columns,actions=true){
 const el=document.getElementById(elId); if(!el)return;
 const rows=await p7Load(sheet);
 if(!rows.length){el.insertAdjacentHTML('beforeend','<div class="card"><div class="empty-state">No records yet.</div></div>');return;}
 const heads=columns.map(c=>`<th>${esc(c.label)}</th>`).join('')+(actions?'<th>Actions</th>':'');
 const body=rows.map(r=>{
   const cells=columns.map(c=>`<td>${esc(c.format?c.format(r[c.key],r):String(r[c.key]??''))}</td>`).join('');
   const act=actions?`<td><div class="p7-actions"><button class="btn btn-sm" onclick="p7Edit('${sheet}','${esc(r.id)}')">Edit</button><button class="btn btn-sm" onclick="p7Remove('${sheet}','${esc(r.id)}')">Delete</button></div></td>`:'';
   return `<tr>${cells}${act}</tr>`;
 }).join('');
 el.insertAdjacentHTML('beforeend',`<div class="card"><div style="overflow:auto"><table class="data-table phase7-table"><thead><tr>${heads}</tr></thead><tbody>${body}</tbody></table></div></div>`);
}
const P7FIELDS={
 maintenance:[['title','Issue / request'],['location','Location'],['priority','Priority (LOW/MEDIUM/HIGH/URGENT)'],['category','Category'],['assignedTo','Assigned to'],['status','Status (OPEN/IN PROGRESS/RESOLVED/CANCELLED)'],['dueDate','Due date (YYYY-MM-DD)'],['notes','Notes']],
 inventory:[['name','Asset / item'],['category','Category'],['location','Location'],['quantity','Quantity'],['condition','Condition'],['assignedTo','Assigned to'],['purchaseDate','Purchase date'],['value','Value (₹)'],['status','Status (ACTIVE/REPAIR/RETIRED)'],['notes','Notes']],
 vendors:[['name','Vendor name'],['service','Service'],['contact','Contact person'],['phone','Phone'],['email','Email'],['gstin','GSTIN'],['paymentTerms','Payment terms'],['status','Status (ACTIVE/INACTIVE)'],['notes','Notes']],
 expenses:[['date','Expense date (YYYY-MM-DD)'],['vendor','Vendor'],['category','Category'],['description','Description'],['amount','Amount (₹)'],['gst','GST (₹)'],['paymentMethod','Payment method'],['reference','Reference'],['status','Status (RECORDED/PENDING/PAID)'],['notes','Notes']],
};
async function p7Edit(sheet,id){const row=p7Cache[sheet].find(x=>x.id===id);if(!row)return;const rec={...row};for(const [k,label] of P7FIELDS[sheet]){const v=p7Prompt(label,rec[k]||'');if(v===null)return;rec[k]=v}try{await p7Save(sheet,rec,id);p7Render(sheet)}catch(e){alert(e.message)}}
async function p7Remove(sheet,id){if(!confirm('Delete this record? This action is audited but the record will be removed from the active register.'))return;try{await p7Delete(sheet,id);p7Render(sheet)}catch(e){alert(e.message)}}
async function p7Add(sheet){const rec={};for(const [k,label] of P7FIELDS[sheet]){const v=p7Prompt(label,'');if(v===null)return;rec[k]=v}try{await p7Save(sheet,rec);p7Render(sheet)}catch(e){alert(e.message)}}
function p7Render(sheet){if(sheet==='maintenance')renderMaintenancePage();if(sheet==='inventory')renderInventoryPage();if(sheet==='vendors')renderVendorsPage();if(sheet==='expenses')renderExpensesPage()}
function addMaintenance(){p7Add('maintenance')} function addInventory(){p7Add('inventory')} function addVendor(){p7Add('vendors')} function addExpense(){p7Add('expenses')}
async function renderMaintenancePage(){const rows=await p7Load('maintenance');const open=rows.filter(x=>!['RESOLVED','CANCELLED'].includes(String(x.status).toUpperCase())).length;const urgent=rows.filter(x=>String(x.priority).toUpperCase()==='URGENT'&&String(x.status).toUpperCase()!=='RESOLVED').length;document.getElementById('maintenance-content').innerHTML='<div class="p7-grid"><div class="metric-card"><div class="metric-label">OPEN TICKETS</div><div class="metric-value">'+open+'</div></div><div class="metric-card coral"><div class="metric-label">URGENT</div><div class="metric-value coral">'+urgent+'</div></div></div>';await renderP7Table('maintenance','maintenance-content',[{key:'id',label:'ID'},{key:'title',label:'Issue'},{key:'location',label:'Location'},{key:'priority',label:'Priority'},{key:'assignedTo',label:'Assigned'},{key:'status',label:'Status'},{key:'dueDate',label:'Due'}])}
async function renderInventoryPage(){const rows=await p7Load('inventory');const value=rows.reduce((s,x)=>s+Number(x.value||0),0),active=rows.filter(x=>String(x.status).toUpperCase()==='ACTIVE').length;document.getElementById('inventory-content').innerHTML='<div class="p7-grid"><div class="metric-card"><div class="metric-label">ASSETS</div><div class="metric-value">'+rows.length+'</div></div><div class="metric-card teal"><div class="metric-label">ACTIVE</div><div class="metric-value teal">'+active+'</div></div><div class="metric-card gold"><div class="metric-label">BOOK VALUE</div><div class="metric-value gold">'+p7Money(value)+'</div></div></div>';await renderP7Table('inventory','inventory-content',[{key:'id',label:'ID'},{key:'name',label:'Asset'},{key:'category',label:'Category'},{key:'location',label:'Location'},{key:'quantity',label:'Qty'},{key:'condition',label:'Condition'},{key:'status',label:'Status'}])}
async function renderVendorsPage(){await renderP7Table('vendors','vendors-content',[{key:'id',label:'ID'},{key:'name',label:'Vendor'},{key:'service',label:'Service'},{key:'contact',label:'Contact'},{key:'phone',label:'Phone'},{key:'email',label:'Email'},{key:'status',label:'Status'}])}
async function renderExpensesPage(){const rows=await p7Load('expenses');const total=rows.reduce((s,x)=>s+Number(x.amount||0),0),gst=rows.reduce((s,x)=>s+Number(x.gst||0),0);document.getElementById('expenses-content').innerHTML='<div class="p7-grid"><div class="metric-card coral"><div class="metric-label">TOTAL EXPENSES</div><div class="metric-value coral">'+p7Money(total)+'</div></div><div class="metric-card"><div class="metric-label">GST INPUT</div><div class="metric-value">'+p7Money(gst)+'</div></div><div class="metric-card"><div class="metric-label">RECORDS</div><div class="metric-value">'+rows.length+'</div></div></div>';await renderP7Table('expenses','expenses-content',[{key:'date',label:'Date',format:p7Date},{key:'vendor',label:'Vendor'},{key:'category',label:'Category'},{key:'description',label:'Description'},{key:'amount',label:'Amount',format:p7Money},{key:'gst',label:'GST',format:p7Money},{key:'status',label:'Status'}])}
async function renderAutomationPage(){const el=document.getElementById('automation-content');if(!el)return;const a=await p7Load('automation'),i=await p7Load('integrations');const get=(arr,key,def='')=>arr.find(x=>x.key===key)?.value??def;el.innerHTML=`<div class="grid-2"><div class="card"><div class="card-title">Reminder Automation</div><p class="p7-muted">These preferences are stored in Google Sheets. Actual delivery requires the provider credentials shown on the right.</p><div class="form-group"><label class="form-label">Payment reminders</label><select class="form-input" id="p7-payrem"><option value="off">Off</option><option value="3">3 days before</option><option value="7">7 days before</option></select></div><div class="form-group"><label class="form-label">Lease expiry reminder</label><select class="form-input" id="p7-lease"><option value="off">Off</option><option value="30">30 days before</option><option value="60">60 days before</option><option value="90">90 days before</option></select></div><button class="btn btn-primary" onclick="saveAutomation()">Save Automation</button></div><div class="card"><div class="card-title">External Integrations</div><p class="p7-muted">Credentials remain server-side. Configure provider environment variables in Vercel; this page only records enabled features.</p><div class="form-group"><label class="form-label">Email provider</label><select class="form-input" id="p7-email"><option value="disabled">Disabled</option><option value="resend">Resend</option></select></div><div class="form-group"><label class="form-label">WhatsApp provider</label><select class="form-input" id="p7-wa"><option value="disabled">Disabled</option><option value="twilio">Twilio WhatsApp</option></select></div><div class="form-group"><label class="form-label">Online payments</label><select class="form-input" id="p7-pay"><option value="disabled">Disabled</option><option value="razorpay">Razorpay</option></select></div><button class="btn btn-primary" onclick="saveIntegrations()">Save Integration Settings</button><div class="p7-muted" style="margin-top:12px">Configured provider keys are never returned to the browser.</div></div></div><div class="card" style="margin-top:16px"><div class="card-title">Manual Notification Test</div><div class="form-row"><div class="form-group"><label class="form-label">Email recipient</label><input class="form-input" id="p7-to-email" placeholder="client@example.com"></div><div class="form-group"><label class="form-label">WhatsApp number</label><input class="form-input" id="p7-to-wa" placeholder="+91XXXXXXXXXX"></div></div><div class="p7-actions"><button class="btn" onclick="testEmail()">Send Test Email</button><button class="btn" onclick="testWhatsApp()">Send Test WhatsApp</button></div></div>`;document.getElementById('p7-payrem').value=get(a,'paymentReminder','off');document.getElementById('p7-lease').value=get(a,'leaseReminder','off');document.getElementById('p7-email').value=get(i,'email','disabled');document.getElementById('p7-wa').value=get(i,'whatsapp','disabled');document.getElementById('p7-pay').value=get(i,'payments','disabled')}
async function saveKV(sheet,items){for(const x of items){const old=p7Cache[sheet].find(r=>r.key===x.key);await p7Save(sheet,{...(old||{}),key:x.key,value:x.value},old?.id)}alert('Saved.')}
async function saveAutomation(){await saveKV('automation',[{key:'paymentReminder',value:document.getElementById('p7-payrem').value},{key:'leaseReminder',value:document.getElementById('p7-lease').value}]);renderAutomationPage()}
async function saveIntegrations(){await saveKV('integrations',[{key:'email',value:document.getElementById('p7-email').value},{key:'whatsapp',value:document.getElementById('p7-wa').value},{key:'payments',value:document.getElementById('p7-pay').value}]);renderAutomationPage()}
async function p7Notify(channel,payload){const r=await fetch('/api/notifications',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({channel,...payload})});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error?.message||'Notification failed');return j}
async function testEmail(){const to=document.getElementById('p7-to-email').value.trim();if(!to)return alert('Enter an email address.');try{await p7Notify('email',{to,subject:'COLLABOR8 test notification',html:'<p>This is a test notification from COLLABOR8.</p>'});alert('Test email sent.')}catch(e){alert(e.message)}}
async function testWhatsApp(){const to=document.getElementById('p7-to-wa').value.trim();if(!to)return alert('Enter a WhatsApp number.');try{await p7Notify('whatsapp',{to,body:'COLLABOR8 test notification.'});alert('Test WhatsApp sent.')}catch(e){alert(e.message)}}

// Extend page routing for Phase 7 modules.
const _showPageV7=showPage;
showPage=function(id,el){
  const restricted=['revenue','datasync','audit','reports','users','expenses','automation'];
  if(restricted.includes(id)&&(!currentUser||currentUser.role!=='admin')){alert('This section is restricted to Admin accounts.');return _showPageV7('dashboard');}
  _showPageV7(id,el);
  if(id==='maintenance')renderMaintenancePage();
  if(id==='inventory')renderInventoryPage();
  if(id==='vendors')renderVendorsPage();
  if(id==='expenses')renderExpensesPage();
  if(id==='automation')renderAutomationPage();
};
