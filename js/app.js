// ============================================================
// APP — Lógica principal para clientes (booking + historial)
// ============================================================
const App = {
  currentUser:   null,
  services:      [],
  availableDays: [],

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

  // ── Cargar horas disponibles desde Firestore ─────────────
  async loadHours() {
    const select = document.getElementById('booking-time');
    if (!select) return;
    try {
      const doc = await db.collection('settings').doc('hours').get();
      const hours = doc.exists ? (doc.data().list || []) : [];
      if (hours.length > 0) {
        select.innerHTML = hours.map(h => `<option value="${h}">${h}</option>`).join('');
      }
      // If no hours configured, keep whatever hardcoded options are in HTML
    } catch (err) {
      console.error('Error cargando horas:', err);
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
      await App.bookAppointment();
    });
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

    container.innerHTML = '<p class="text-center text-gray-400 py-8"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Cargando...</p>';

    try {
      const snap = await db.collection('appointments')
        .where('userId', '==', App.currentUser.uid)
        .get();

      // Ordenar client-side (evita índice compuesto en Firestore)
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

  // ── Cancelar cita (cliente) ───────────────────────────────
  async cancelAppointment(id) {
    if (!confirm('¿Cancelar esta cita?')) return;
    try {
      await db.collection('appointments').doc(id).update({
        status:    'cancelled',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      App.showAlert('Cita cancelada.', 'success');
      await App.loadHistory();
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
