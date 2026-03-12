// ============================================================
// ADMIN — Dashboard para gestión de citas y usuarios
// ============================================================
const Admin = {
  currentUser: null,
  currentFilter: 'all',

  // ── Inicializar ───────────────────────────────────────────
  async init() {
    Admin.showLoading(true);
    Admin.currentUser = await AuthService.requireAdmin();
    Admin.renderAdminInfo();
    Admin.bindNavigation();
    Admin.bindFilters();
    await Admin.loadAppointments();
    Admin.showLoading(false);
    await NotificationService.init();
    Admin.setupRealtime();
  },

  renderAdminInfo() {
    const el = document.getElementById('admin-name');
    if (el) el.textContent = Admin.currentUser.name || 'Admin';
    document.getElementById('logout-btn')?.addEventListener('click', () => {
      if (confirm('¿Cerrar sesión?')) AuthService.logout();
    });
  },

  // ── Escuchar cambios en tiempo real ───────────────────────
  setupRealtime() {
    db.collection('appointments')
      .orderBy('createdAt', 'desc')
      .onSnapshot(snap => {
        snap.docChanges().forEach(change => {
          if (change.type === 'added' && !snap.metadata.fromCache) {
            const a = change.doc.data();
            if (a.status === 'pending') {
              NotificationService.showToast(
                'Nueva cita solicitada',
                `${a.userName} — ${a.service} el ${a.date} a las ${a.time}`
              );
            }
          }
        });
        Admin.loadAppointments();
      });
  },

  // ── Cargar todas las citas ────────────────────────────────
  async loadAppointments() {
    const container = document.getElementById('appointments-list');
    if (!container) return;

    try {
      let query = db.collection('appointments').orderBy('createdAt', 'desc');
      if (Admin.currentFilter !== 'all') {
        query = query.where('status', '==', Admin.currentFilter);
      }

      const snap = await query.get();

      // Actualizar contadores
      Admin.updateCounters(snap.docs.map(d => d.data()));

      if (snap.empty) {
        container.innerHTML = `
          <div class="text-center py-12 text-gray-400 col-span-full">
            <i class="fa-solid fa-calendar-xmark text-4xl mb-3"></i>
            <p>No hay citas ${Admin.currentFilter !== 'all' ? 'con este filtro' : ''}.</p>
          </div>`;
        return;
      }

      container.innerHTML = snap.docs.map(doc => {
        const a = doc.data();
        const statusInfo = Admin.getStatusInfo(a.status);
        const dateStr = Admin.formatDate(a.date);
        return `
          <div class="bg-white rounded-xl shadow-sm p-4 border-l-4 ${statusInfo.border}" data-id="${doc.id}">
            <div class="flex justify-between items-start mb-3">
              <div>
                <p class="font-bold text-gray-800">${a.userName}</p>
                <p class="text-xs text-gray-500">${a.userEmail}</p>
                ${a.userPhone ? `<p class="text-xs text-gray-500"><i class="fa-solid fa-phone mr-1"></i>${a.userPhone}</p>` : ''}
              </div>
              <span class="text-xs font-semibold px-2 py-1 rounded-full ${statusInfo.badge}">${statusInfo.label}</span>
            </div>

            <div class="bg-gray-50 rounded-lg p-3 mb-3 space-y-1">
              <p class="text-sm font-medium text-gray-700">
                <i class="fa-solid fa-spa mr-2 text-[--kine-teal]"></i>${a.service}
                <span class="font-bold text-[--kine-orange] ml-2">$${a.price}.00</span>
              </p>
              <p class="text-sm text-gray-600">
                <i class="fa-regular fa-calendar mr-2 text-[--kine-teal]"></i>${dateStr}
                &nbsp;·&nbsp;
                <i class="fa-regular fa-clock mr-2 text-[--kine-teal]"></i>${a.time}
              </p>
              ${a.notes ? `<p class="text-xs text-gray-500 italic">"${a.notes}"</p>` : ''}
            </div>

            ${a.status === 'pending' ? `
              <div class="flex gap-2">
                <button onclick="Admin.updateStatus('${doc.id}', 'confirmed', '${a.userId}', '${a.service}', '${a.date}', '${a.time}')"
                  class="flex-1 bg-green-500 hover:bg-green-600 text-white text-sm font-bold py-2 px-3 rounded-lg transition-colors">
                  <i class="fa-solid fa-check mr-1"></i>Confirmar
                </button>
                <button onclick="Admin.updateStatus('${doc.id}', 'cancelled', '${a.userId}', '${a.service}', '${a.date}', '${a.time}')"
                  class="flex-1 bg-red-400 hover:bg-red-500 text-white text-sm font-bold py-2 px-3 rounded-lg transition-colors">
                  <i class="fa-solid fa-xmark mr-1"></i>Cancelar
                </button>
              </div>` : `
              <div class="flex gap-2">
                ${a.status === 'confirmed' ? `
                  <button onclick="Admin.updateStatus('${doc.id}', 'cancelled', '${a.userId}', '${a.service}', '${a.date}', '${a.time}')"
                    class="flex-1 bg-red-400 hover:bg-red-500 text-white text-xs font-bold py-2 px-3 rounded-lg transition-colors">
                    <i class="fa-solid fa-xmark mr-1"></i>Cancelar
                  </button>` : `
                  <button onclick="Admin.updateStatus('${doc.id}', 'confirmed', '${a.userId}', '${a.service}', '${a.date}', '${a.time}')"
                    class="flex-1 bg-green-500 hover:bg-green-600 text-white text-xs font-bold py-2 px-3 rounded-lg transition-colors">
                    <i class="fa-solid fa-check mr-1"></i>Reactivar
                  </button>`}
                <button onclick="Admin.sendCustomNotification('${a.userId}', '${a.userName}')"
                  class="bg-blue-400 hover:bg-blue-500 text-white text-xs font-bold py-2 px-3 rounded-lg transition-colors">
                  <i class="fa-solid fa-bell"></i>
                </button>
              </div>`}
          </div>`;
      }).join('');

    } catch (err) {
      console.error(err);
      container.innerHTML = '<p class="text-center text-red-400 py-8 col-span-full">Error cargando citas.</p>';
    }
  },

  // ── Actualizar estado de una cita ─────────────────────────
  async updateStatus(appointmentId, newStatus, userId, service, date, time) {
    try {
      await db.collection('appointments').doc(appointmentId).update({
        status:    newStatus,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      const msgs = {
        confirmed: { title: '✅ Cita Confirmada', body: `Tu ${service} del ${Admin.formatDate(date)} a las ${time} ha sido confirmada.` },
        cancelled: { title: '❌ Cita Cancelada',  body: `Tu ${service} del ${Admin.formatDate(date)} a las ${time} fue cancelada. Contáctanos para reprogramar.` }
      };

      if (msgs[newStatus]) {
        await NotificationService.sendToUser(userId, msgs[newStatus].title, msgs[newStatus].body);
      }

      Admin.showAlert(`Cita ${newStatus === 'confirmed' ? 'confirmada' : 'cancelada'}.`, 'success');

    } catch (err) {
      console.error(err);
      Admin.showAlert('Error actualizando la cita.', 'error');
    }
  },

  // ── Enviar notificación personalizada ─────────────────────
  async sendCustomNotification(userId, userName) {
    const msg = prompt(`Mensaje para ${userName}:`);
    if (!msg) return;
    await NotificationService.sendToUser(userId, 'KineSport PR', msg);
    Admin.showAlert('Notificación enviada.', 'success');
  },

  // ── Actualizar contadores del dashboard ───────────────────
  updateCounters(appointments) {
    const counts = { total: appointments.length, pending: 0, confirmed: 0, cancelled: 0 };
    appointments.forEach(a => { if (counts[a.status] !== undefined) counts[a.status]++; });

    document.getElementById('count-total')?.setAttribute('data-count', counts.total);
    document.getElementById('count-pending')?.setAttribute('data-count', counts.pending);
    document.getElementById('count-confirmed')?.setAttribute('data-count', counts.confirmed);
    document.getElementById('count-cancelled')?.setAttribute('data-count', counts.cancelled);

    ['total', 'pending', 'confirmed', 'cancelled'].forEach(k => {
      const el = document.getElementById(`count-${k}`);
      if (el) el.textContent = counts[k];
    });
  },

  // ── Info de estado ────────────────────────────────────────
  getStatusInfo(status) {
    const map = {
      pending:   { label: 'Pendiente',  badge: 'bg-yellow-100 text-yellow-700', border: 'border-yellow-400' },
      confirmed: { label: 'Confirmada', badge: 'bg-green-100 text-green-700',   border: 'border-green-400'  },
      cancelled: { label: 'Cancelada',  badge: 'bg-red-100 text-red-700',       border: 'border-red-400'    }
    };
    return map[status] || map.pending;
  },

  formatDate(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    return `${d} ${months[parseInt(m) - 1]} ${y}`;
  },

  // ── Filtros ───────────────────────────────────────────────
  bindFilters() {
    document.querySelectorAll('[data-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        Admin.currentFilter = btn.dataset.filter;
        document.querySelectorAll('[data-filter]').forEach(b => {
          b.classList.toggle('bg-[--kine-orange]', b.dataset.filter === Admin.currentFilter);
          b.classList.toggle('text-white', b.dataset.filter === Admin.currentFilter);
          b.classList.toggle('bg-gray-100', b.dataset.filter !== Admin.currentFilter);
          b.classList.toggle('text-gray-600', b.dataset.filter !== Admin.currentFilter);
        });
        Admin.loadAppointments();
      });
    });
  },

  // ── Navegación ────────────────────────────────────────────
  bindNavigation() {
    document.querySelectorAll('[data-admin-tab]').forEach(btn => {
      btn.addEventListener('click', () => Admin.showAdminTab(btn.dataset.adminTab));
    });
  },

  showAdminTab(tab) {
    ['citas', 'usuarios'].forEach(t => {
      const section = document.getElementById(`admin-tab-${t}`);
      if (section) section.classList.toggle('hidden', t !== tab);
    });
    if (tab === 'usuarios') Admin.loadUsers();
  },

  // ── Cargar usuarios ───────────────────────────────────────
  async loadUsers() {
    const container = document.getElementById('users-list');
    if (!container) return;

    container.innerHTML = '<p class="text-center text-gray-400 py-8"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Cargando...</p>';

    const snap = await db.collection('users').orderBy('createdAt', 'desc').get();

    container.innerHTML = snap.docs.map(doc => {
      const u = doc.data();
      return `
        <div class="bg-white rounded-xl p-4 shadow-sm flex justify-between items-center">
          <div>
            <p class="font-bold text-gray-800">${u.name}</p>
            <p class="text-xs text-gray-500">${u.email}</p>
            ${u.phone ? `<p class="text-xs text-gray-500">${u.phone}</p>` : ''}
          </div>
          <span class="text-xs font-semibold px-2 py-1 rounded-full ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}">
            ${u.role === 'admin' ? 'Admin' : 'Cliente'}
          </span>
        </div>`;
    }).join('');
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
    el.className = `fixed top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl shadow-lg text-white text-sm font-medium max-w-xs w-full text-center ${
      type === 'success' ? 'bg-green-500' : 'bg-red-500'
    }`;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 4000);
  }
};

document.addEventListener('DOMContentLoaded', Admin.init.bind(Admin));
