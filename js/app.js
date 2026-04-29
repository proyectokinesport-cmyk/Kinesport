// ============================================================
// APP — Lógica principal para clientes (booking + historial)
// ============================================================
const App = {
  currentUser:   null,
  services:      [],
  availableDays: [],
  allHours:      [],
  saturdayHours: [],
  dayHours:      { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] },

  // ── Inicializar app ───────────────────────────────────────
  async init() {
    App.showLoading(true);
    App.currentUser = await AuthService.requireAuth();
    App.renderUserInfo();
    await Promise.all([App.loadServices(), App.loadHours(), App.loadAvailableDays()]);
    App.bindBookingForm();
    App.bindNavigation();
    App.showTab('citas');
    App.showLoading(false);
    await NotificationService.init();
  },

  // ── Render info de usuario en el header ───────────────────
  renderUserInfo() {
    const el = document.getElementById('user-name');
    if (el) el.textContent = App.currentUser.name || App.currentUser.email;

    // Mostrar botón admin si tiene rol admin
    if (App.currentUser.role === 'admin') {
      const adminTab = document.getElementById('admin-nav-tab');
      if (adminTab) adminTab.classList.remove('hidden');
      const histTitle = document.getElementById('historial-title');
      if (histTitle) histTitle.textContent = 'Clientes Registrados';
    }

    document.getElementById('logout-btn')?.addEventListener('click', () => {
      if (confirm('¿Cerrar sesión?')) AuthService.logout();
    });
  },

  // ── Cargar servicios desde Firestore ──────────────────────
  async loadServices() {
    const snap = await db.collection('services').orderBy('order').get();

    if (snap.empty) {
      // Seed servicios por defecto si no existen
      await App.seedServices();
      return App.loadServices();
    }

    App.services = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    App.renderServices();
    App.renderServiceSelect();
  },

  // ── Cargar horas desde Firestore (guarda en allHours y saturdayHours) ────
  async loadHours() {
    const DEFAULT = ['4:00 PM','5:00 PM','6:00 PM','7:00 PM','8:00 PM'];
    try {
      const dayHoursDoc = await db.collection('settings').doc('day_hours').get();
      if (dayHoursDoc.exists && dayHoursDoc.data()) {
        const data = dayHoursDoc.data();
        for (let d = 0; d <= 6; d++) App.dayHours[d] = data[String(d)] || [];
      } else {
        // Fallback to old structure
        const [hoursDoc, satDoc] = await Promise.all([
          db.collection('settings').doc('hours').get(),
          db.collection('settings').doc('saturday_hours').get()
        ]);
        const reg = hoursDoc.exists ? (hoursDoc.data().list || []) : DEFAULT;
        const sat = satDoc.exists   ? (satDoc.data().list   || []) : [];
        for (let d = 0; d <= 6; d++) {
          App.dayHours[d] = (d === 6 && sat.length > 0) ? sat : (reg.length > 0 ? reg : DEFAULT);
        }
      }
    } catch (err) {
      console.error('Error cargando horas:', err);
      for (let d = 0; d <= 6; d++) App.dayHours[d] = DEFAULT;
    }
  },

  // ── Horas disponibles para una fecha específica ───────────
  async loadAvailableHoursForDate(date) {
    const select = document.getElementById('booking-time');
    if (!select) return;

    if (!date) {
      const fallback = Object.values(App.dayHours).find(h => h.length > 0) || [];
      select.innerHTML = fallback.map(h => `<option value="${h}">${h}</option>`).join('');
      return;
    }

    select.disabled = true;
    select.innerHTML = '<option value="">Verificando disponibilidad...</option>';

    try {
      const [y, m, d] = date.split('-').map(Number);
      const dayOfWeek = new Date(y, m - 1, d).getDay();
      const hoursToUse = (App.dayHours[dayOfWeek] && App.dayHours[dayOfWeek].length > 0)
        ? App.dayHours[dayOfWeek]
        : (Object.values(App.dayHours).find(h => h.length > 0) || ['4:00 PM','5:00 PM','6:00 PM','7:00 PM','8:00 PM']);

      const snap = await db.collection('appointments')
        .where('date', '==', date)
        .get();

      const taken = new Set(
        snap.docs
          .filter(d => ['pending', 'confirmed'].includes(d.data().status))
          .map(d => d.data().time)
      );

      const available = hoursToUse.filter(h => !taken.has(h));

      if (available.length === 0) {
        select.innerHTML = '<option value="">Sin horas disponibles este día</option>';
      } else {
        select.innerHTML = available.map(h => `<option value="${h}">${h}</option>`).join('');
      }
    } catch (err) {
      console.error(err);
      const fallback = Object.values(App.dayHours).find(h => h.length > 0) || [];
      select.innerHTML = fallback.map(h => `<option value="${h}">${h}</option>`).join('');
    } finally {
      select.disabled = false;
    }
  },

  // ── Cargar días disponibles desde Firestore ──────────────
  async loadAvailableDays() {
    try {
      const doc = await db.collection('settings').doc('days').get();
      App.availableDays = doc.exists ? (doc.data().list || []) : [];
      App.renderDateSelect();
    } catch (err) {
      console.error('Error cargando días:', err);
    }
  },

  // ── Render select de fechas disponibles ──────────────────
  renderDateSelect() {
    const select = document.getElementById('booking-date');
    if (!select) return;

    if (App.availableDays.length === 0) {
      select.innerHTML = '<option value="">No hay días configurados</option>';
      return;
    }

    const dayNames   = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
    const monthNames = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const today = new Date();
    const options = ['<option value="">— Selecciona una fecha —</option>'];

    for (let i = 1; i <= 60; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      if (App.availableDays.includes(d.getDay())) {
        const yyyy = d.getFullYear();
        const mm   = String(d.getMonth() + 1).padStart(2, '0');
        const dd   = String(d.getDate()).padStart(2, '0');
        const val  = `${yyyy}-${mm}-${dd}`;
        const lbl  = `${dayNames[d.getDay()]} ${dd} ${monthNames[d.getMonth()]} ${yyyy}`;
        options.push(`<option value="${val}">${lbl}</option>`);
      }
    }

    select.innerHTML = options.join('');
  },

  // ── Seed servicios iniciales ──────────────────────────────
  async seedServices() {
    const batch = db.batch();
    const defaults = [
      { name: 'Recovery', description: 'Sesión completa de recuperación', price: 45, duration: 60, order: 1 },
      { name: 'Masajes',  description: 'Terapéuticos y deportivos',        price: 60, duration: 60, order: 2 }
    ];
    defaults.forEach(s => {
      const ref = db.collection('services').doc();
      batch.set(ref, s);
    });
    await batch.commit();
  },

  // ── Render cards de servicios ─────────────────────────────
  toggleServices() {
    const list = document.getElementById('services-list');
    const chevron = document.getElementById('services-chevron');
    list.classList.toggle('hidden');
    chevron.classList.toggle('rotate-180');
  },

  toggleNormas() {
    const list = document.getElementById('normas-list');
    const chevron = document.getElementById('normas-chevron');
    list.classList.toggle('hidden');
    chevron.classList.toggle('rotate-180');
  },

  renderServices() {
    const container = document.getElementById('services-list');
    if (!container) return;
    container.innerHTML = App.services.map(s => `
      <div class="service-card bg-white p-4 rounded-xl shadow-sm flex justify-between items-center">
        <div>
          <h3 class="font-bold text-gray-700">${s.name}</h3>
          <p class="text-xs text-gray-500">${s.description}</p>
          <span class="text-xs text-gray-400"><i class="fa-regular fa-clock mr-1"></i>${s.duration} min</span>
        </div>
        <span class="font-bold text-[--kine-teal] text-lg">$${s.price}.00</span>
      </div>`).join('');
  },

  // ── Render select de servicios en el form ─────────────────
  renderServiceSelect() {
    const select = document.getElementById('booking-service');
    if (!select) return;
    select.innerHTML = App.services.map(s =>
      `<option value="${s.id}">${s.name} — $${s.price}.00</option>`
    ).join('');
  },

  // ── Bind formulario de reserva ────────────────────────────
  bindBookingForm() {
    const form = document.getElementById('booking-form');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      App.showProtocolModal();
    });

    // Al cambiar la fecha, actualizar horas disponibles
    document.getElementById('booking-date')?.addEventListener('change', (e) => {
      App.loadAvailableHoursForDate(e.target.value);
    });
  },

  // ── Modal de protocolo de normas ──────────────────────────
  showProtocolModal() {
    const modal = document.getElementById('protocol-modal');
    if (!modal) { App.bookAppointment(); return; }
    const cb = document.getElementById('protocol-accept');
    if (cb) cb.checked = false;
    const btn = document.getElementById('protocol-confirm-btn');
    if (btn) btn.disabled = true;
    modal.querySelector('.overflow-y-auto')?.scrollTo(0, 0);
    modal.classList.remove('hidden');
  },

  closeProtocolModal() {
    document.getElementById('protocol-modal')?.classList.add('hidden');
  },

  // ── Crear cita en Firestore ───────────────────────────────
  async bookAppointment() {
    const serviceId = document.getElementById('booking-service').value;
    const date      = document.getElementById('booking-date').value;
    const time      = document.getElementById('booking-time').value;
    const notes     = document.getElementById('booking-notes')?.value || '';

    if (!serviceId || !date || !time) {
      App.showAlert('Por favor completa todos los campos.', 'error');
      return;
    }

    // Validar que no sea fecha pasada
    if (new Date(date) < new Date(new Date().toDateString())) {
      App.showAlert('No puedes reservar en una fecha pasada.', 'error');
      return;
    }

    const service = App.services.find(s => s.id === serviceId);
    const btn     = document.getElementById('book-btn');

    try {
      btn.disabled = true;
      btn.textContent = 'Reservando...';

      await db.collection('appointments').add({
        userId:    App.currentUser.uid,
        userName:  App.currentUser.name,
        userEmail: App.currentUser.email,
        userPhone: App.currentUser.phone || '',
        serviceId,
        service:   service.name,
        price:     service.price,
        date,
        time,
        notes,
        status:    'pending',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      document.getElementById('booking-form').reset();
      App.showAlert('¡Cita reservada! El equipo la confirmará pronto.', 'success');
      App.showTab('historial');
      await App.loadHistory();

      // Notificar al admin via push
      try {
        await fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userName: App.currentUser.name || App.currentUser.email,
            service:  service.name,
            date,
            time
          })
        });
      } catch (e) { /* silencioso */ }

    } catch (err) {
      console.error(err);
      App.showAlert('Error al reservar. Intenta de nuevo.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Confirmar Cita';
    }
  },

  // ── Cargar historial del usuario ──────────────────────────
  async loadHistory() {
    const container = document.getElementById('history-list');
    if (!container) return;

    if (App.currentUser.role === 'admin') {
      await App._loadAdminHistory(container);
    } else {
      await App._loadClientHistory(container);
    }
  },

  async _loadClientHistory(container) {
    container.innerHTML = '<p class="text-center text-gray-400 py-8"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Cargando...</p>';

    try {
      const snap = await db.collection('appointments')
        .where('userId', '==', App.currentUser.uid)
        .get();

      snap.docs.sort((a, b) => {
        const at = a.data().createdAt?.seconds || 0;
        const bt = b.data().createdAt?.seconds || 0;
        return bt - at;
      });

      if (snap.empty) {
        container.innerHTML = `
          <div class="text-center py-12 text-gray-400">
            <i class="fa-solid fa-calendar-xmark text-4xl mb-3"></i>
            <p>Aún no tienes citas registradas.</p>
          </div>`;
        return;
      }

      container.innerHTML = snap.docs.map(d => {
        const a = d.data();
        const statusInfo = App.getStatusInfo(a.status);
        const canCancel = a.status === 'pending' || a.status === 'confirmed';
        return `
          <div class="bg-white rounded-xl shadow-sm p-4 border-l-4 ${statusInfo.border}">
            <div class="flex justify-between items-start">
              <div>
                <h3 class="font-bold text-gray-700">${a.service}</h3>
                <p class="text-sm text-gray-500">
                  <i class="fa-regular fa-calendar mr-1"></i>${App.formatDate(a.date)}
                  &nbsp;·&nbsp;
                  <i class="fa-regular fa-clock mr-1"></i>${a.time}
                </p>
                ${a.notes ? `<p class="text-xs text-gray-400 mt-1">${a.notes}</p>` : ''}
              </div>
              <div class="text-right">
                <span class="text-xs font-semibold px-2 py-1 rounded-full ${statusInfo.badge}">${statusInfo.label}</span>
                <p class="text-sm font-bold text-[--kine-teal] mt-1">$${a.price}.00</p>
              </div>
            </div>
            ${canCancel ? `
            <div class="mt-3 flex justify-end">
              <button onclick="App.cancelAppointment('${d.id}')"
                class="text-xs text-red-500 border border-red-300 hover:bg-red-50 font-semibold px-3 py-1.5 rounded-lg transition-colors">
                <i class="fa-solid fa-xmark mr-1"></i>Cancelar cita
              </button>
            </div>` : ''}
          </div>`;
      }).join('');

    } catch (err) {
      console.error(err);
      container.innerHTML = '<p class="text-center text-red-400 py-8">Error cargando historial.</p>';
    }
  },

  async _loadAdminHistory(container) {
    container.innerHTML = '<p class="text-center text-gray-400 py-8"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Cargando...</p>';

    try {
      const [usersSnap, appsSnap] = await Promise.all([
        db.collection('users').orderBy('createdAt', 'desc').get(),
        db.collection('appointments').get()
      ]);

      const appsByUser = {};
      appsSnap.docs.forEach(d => {
        const a = d.data();
        const uid = a.userId || '__manual__';
        if (!appsByUser[uid]) appsByUser[uid] = [];
        appsByUser[uid].push({ id: d.id, ...a });
      });

      if (usersSnap.empty) {
        container.innerHTML = `
          <div class="text-center py-12 text-gray-400">
            <i class="fa-solid fa-users text-4xl mb-3"></i>
            <p>Aún no hay clientes registrados.</p>
          </div>`;
        return;
      }

      container.innerHTML = usersSnap.docs.map(doc => {
        const u = doc.data();
        const citas = (appsByUser[doc.id] || []).sort((a, b) => {
          const at = a.createdAt?.seconds || 0;
          const bt = b.createdAt?.seconds || 0;
          return bt - at;
        });
        const total     = citas.length;
        const confirmed = citas.filter(c => c.status === 'confirmed').length;
        const cancelled = citas.filter(c => c.status === 'cancelled').length;
        const pending   = citas.filter(c => c.status === 'pending').length;

        const citasHtml = citas.slice(0, 3).map(a => {
          const si = App.getStatusInfo(a.status);
          return `<div class="flex justify-between items-center text-xs py-1 border-b border-gray-50 last:border-0">
            <span class="text-gray-600 truncate mr-2">${a.service} · ${App.formatDate(a.date)}</span>
            <span class="font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${si.badge}">${si.label}</span>
          </div>`;
        }).join('');

        const extraLabel = total > 3 ? `<p class="text-xs text-gray-400 mt-1 text-right">+${total - 3} más</p>` : '';

        return `
          <div class="bg-white rounded-xl shadow-sm p-4">
            <div class="flex justify-between items-start mb-2">
              <div>
                <p class="font-bold text-gray-800">${u.name}</p>
                <p class="text-xs text-gray-500">${u.email}</p>
                ${u.phone ? `<p class="text-xs text-gray-400"><i class="fa-solid fa-phone mr-1"></i>${u.phone}</p>` : ''}
              </div>
              <div class="text-right">
                <span class="text-xs font-semibold px-2 py-1 rounded-full ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}">${u.role === 'admin' ? 'Admin' : 'Cliente'}</span>
                ${total > 0 ? `<p class="text-xs text-gray-400 mt-1">${total} cita${total !== 1 ? 's' : ''}</p>` : ''}
              </div>
            </div>
            ${total > 0 ? `
              <div class="bg-gray-50 rounded-lg p-2 mt-2 space-y-0.5">
                ${citasHtml}
              </div>
              ${extraLabel}
            ` : `<p class="text-xs text-gray-400 italic">Sin citas registradas</p>`}
          </div>`;
      }).join('');

    } catch (err) {
      console.error(err);
      container.innerHTML = '<p class="text-center text-red-400 py-8">Error cargando clientes.</p>';
    }
  },

  // ── Cancelar cita (cliente) ───────────────────────────────
  async cancelAppointment(id) {
    if (!confirm('¿Cancelar esta cita?')) return;
    try {
      const doc = await db.collection('appointments').doc(id).get();
      const a = doc.data();

      await db.collection('appointments').doc(id).update({
        status:    'cancelled',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      App.showAlert('Cita cancelada.', 'success');
      await App.loadHistory();

      // Notificar al admin via push
      try {
        await fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type:     'cancellation',
            userName: App.currentUser.name || App.currentUser.email,
            service:  a?.service,
            date:     a?.date,
            time:     a?.time
          })
        });
      } catch (e) { /* silencioso */ }

    } catch (err) {
      console.error(err);
      App.showAlert('Error al cancelar. Intenta de nuevo.', 'error');
    }
  },

  // ── Info de estado de cita ────────────────────────────────
  getStatusInfo(status) {
    const map = {
      pending:   { label: 'Pendiente',  badge: 'bg-yellow-100 text-yellow-700', border: 'border-yellow-400' },
      confirmed: { label: 'Confirmada', badge: 'bg-green-100 text-green-700',   border: 'border-green-400'  },
      cancelled: { label: 'Cancelada',  badge: 'bg-red-100 text-red-700',       border: 'border-red-400'    }
    };
    return map[status] || map.pending;
  },

  // ── Formatear fecha YYYY-MM-DD a legible ──────────────────
  formatDate(dateStr) {
    const [y, m, d] = dateStr.split('-');
    const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    return `${d} ${months[parseInt(m) - 1]} ${y}`;
  },

  // ── Navegación por tabs ───────────────────────────────────
  bindNavigation() {
    document.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => App.showTab(btn.dataset.tab));
    });
    document.getElementById('services-toggle')?.addEventListener('click', () => App.toggleServices());
    document.getElementById('normas-toggle')?.addEventListener('click', () => App.toggleNormas());
  },

  showTab(tab) {
    ['citas', 'historial'].forEach(t => {
      const section = document.getElementById(`tab-${t}`);
      const navBtn  = document.querySelector(`[data-tab="${t}"]`);
      if (section) section.classList.toggle('hidden', t !== tab);
      if (navBtn) {
        navBtn.classList.toggle('text-[--kine-orange]', t === tab);
        navBtn.classList.toggle('text-gray-500', t !== tab);
      }
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (tab === 'historial') App.loadHistory();
  },

  // ── UI helpers ────────────────────────────────────────────
  showLoading(show) {
    const el = document.getElementById('loading-overlay');
    if (el) el.classList.toggle('hidden', !show);
  },

  showAlert(msg, type = 'success') {
    const el    = document.getElementById('alert-banner');
    const msgEl = document.getElementById('alert-message');
    if (!el) return;

    msgEl.textContent = msg;
    el.className = `fixed top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl shadow-lg text-white text-sm font-medium transition-all max-w-xs w-full text-center ${
      type === 'success' ? 'bg-green-500' : 'bg-red-500'
    }`;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 4000);
  }
};

document.addEventListener('DOMContentLoaded', App.init.bind(App));
