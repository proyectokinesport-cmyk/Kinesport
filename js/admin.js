// ============================================================
// ADMIN — Dashboard para gestión de citas y usuarios
// ============================================================
const Admin = {
  currentUser: null,
  currentFilter: 'all',
  _alertTimer: null,
  _alertQueue: [],
  _alertBusy:  false,

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
    Admin.updateNotifToggle();
    Admin.setupRealtime();
    Admin.checkNovedades();
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
    let firstLoad = true;
    db.collection('appointments')
      .orderBy('createdAt', 'desc')
      .onSnapshot(snap => {
        if (firstLoad) { firstLoad = false; Admin.loadAppointments(); return; }
        snap.docChanges().forEach(change => {
          if (change.type === 'added') {
            const a = change.doc.data();
            if (a.status === 'pending' && !a.isManual) {
              Admin._alertQueue.push({ id: change.doc.id, data: a });
              if (!Admin._alertBusy) Admin._showNextAlert();
            }
          }
        });
        Admin.loadAppointments();
      });
  },

  // ── Alerta in-app nueva cita ──────────────────────────────
  _showNextAlert() {
    if (Admin._alertQueue.length === 0) { Admin._alertBusy = false; return; }
    Admin._alertBusy = true;
    const { id, data: a } = Admin._alertQueue.shift();

    // Rellenar contenido
    document.getElementById('alert-name').textContent    = a.userName;
    document.getElementById('alert-service').textContent = `${a.service} · $${a.price}`;
    document.getElementById('alert-when').textContent    = `${Admin.formatDate(a.date)} · ${a.time}`;

    // Botón confirmar
    document.getElementById('alert-confirm-btn').onclick = async () => {
      await Admin.updateStatus(id, 'confirmed', a.userId, a.service, a.date, a.time, a.userPhone || '', a.userName);
      Admin.dismissAlert();
    };

    // Botón WhatsApp
    const waBtn = document.getElementById('alert-wa-btn');
    if (a.userPhone) {
      waBtn.href = Admin.buildWhatsApp(a.userPhone, a.userName, a.service, a.date, a.time);
      waBtn.classList.remove('hidden');
      waBtn.classList.add('flex');
    } else {
      waBtn.classList.add('hidden');
      waBtn.classList.remove('flex');
    }

    // Animar campana
    const bell = document.getElementById('alert-bell');
    bell.classList.remove('bell-ring');
    void bell.offsetWidth; // reflow
    bell.classList.add('bell-ring');

    // Mostrar
    const el = document.getElementById('cita-alert');
    el.classList.add('alert-in');

    // Sonido + vibración
    Admin._playAlertSound();
    navigator.vibrate?.([150, 80, 150]);

    // Barra countdown 8s
    const bar = document.getElementById('alert-bar');
    bar.style.transition = 'none';
    bar.style.width = '100%';
    requestAnimationFrame(() => {
      bar.style.transition = 'width 8s linear';
      bar.style.width = '0%';
    });

    Admin._alertTimer = setTimeout(() => Admin.dismissAlert(), 8000);
  },

  dismissAlert() {
    clearTimeout(Admin._alertTimer);
    const el = document.getElementById('cita-alert');
    el.classList.remove('alert-in');
    setTimeout(() => Admin._showNextAlert(), 500);
  },

  _playAlertSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [[600, 0], [800, 0.18], [600, 0.36]].forEach(([freq, delay]) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.2, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.25);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.3);
      });
    } catch (e) {}
  },

  // ── Cargar todas las citas ────────────────────────────────
  async loadAppointments() {
    const container = document.getElementById('appointments-list');
    if (!container) return;

    try {
      // Traer todas las citas y filtrar client-side (evita índice compuesto)
      const snap = await db.collection('appointments').orderBy('createdAt', 'desc').get();
      let docs = snap.docs;
      if (Admin.currentFilter !== 'all') {
        docs = docs.filter(d => d.data().status === Admin.currentFilter);
      }

      // Actualizar contadores siempre con TODOS los docs
      Admin.updateCounters(snap.docs.map(d => d.data()));

      if (docs.length === 0) {
        container.innerHTML = `
          <div class="text-center py-12 text-gray-400 col-span-full">
            <i class="fa-solid fa-calendar-xmark text-4xl mb-3"></i>
            <p>No hay citas ${Admin.currentFilter !== 'all' ? 'con este filtro' : ''}.</p>
          </div>`;
        return;
      }

      container.innerHTML = docs.map(doc => {
        const a = doc.data();
        const statusInfo = Admin.getStatusInfo(a.status);
        const dateStr = Admin.formatDate(a.date);
        return `
          <div class="bg-white rounded-xl shadow-sm p-4 border-l-4 ${statusInfo.border}" data-id="${doc.id}">
            <div class="flex justify-between items-start mb-3">
              <div>
                <p class="font-bold text-gray-800">
                  ${a.userName}
                  ${a.isManual ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-600 ml-1">Manual</span>` : ''}
                </p>
                ${a.userEmail ? `<p class="text-xs text-gray-500">${a.userEmail}</p>` : ''}
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

            <div class="flex gap-2 flex-wrap">
              ${a.status === 'pending' ? `
                <button onclick="Admin.updateStatus('${doc.id}', 'confirmed', '${a.userId}', '${a.service}', '${a.date}', '${a.time}', '${(a.userPhone||'').replace(/'/g,"\\'")}', '${(a.userName||'').replace(/'/g,"\\'")}')"
                  class="flex-1 bg-green-500 hover:bg-green-600 text-white text-sm font-bold py-2 px-3 rounded-lg transition-colors">
                  <i class="fa-solid fa-check mr-1"></i>Confirmar
                </button>
                <button onclick="Admin.updateStatus('${doc.id}', 'cancelled', '${a.userId}', '${a.service}', '${a.date}', '${a.time}', '${(a.userPhone||'').replace(/'/g,"\\'")}', '${(a.userName||'').replace(/'/g,"\\'")}')"
                  class="flex-1 bg-red-400 hover:bg-red-500 text-white text-sm font-bold py-2 px-3 rounded-lg transition-colors">
                  <i class="fa-solid fa-xmark mr-1"></i>Cancelar
                </button>` : `
                ${a.status === 'confirmed' ? `
                  <button onclick="Admin.updateStatus('${doc.id}', 'cancelled', '${a.userId}', '${a.service}', '${a.date}', '${a.time}', '${(a.userPhone||'').replace(/'/g,"\\'")}', '${(a.userName||'').replace(/'/g,"\\'")}')"
                    class="flex-1 bg-red-400 hover:bg-red-500 text-white text-xs font-bold py-2 px-3 rounded-lg transition-colors">
                    <i class="fa-solid fa-xmark mr-1"></i>Cancelar
                  </button>` : `
                  <button onclick="Admin.updateStatus('${doc.id}', 'confirmed', '${a.userId}', '${a.service}', '${a.date}', '${a.time}', '${(a.userPhone||'').replace(/'/g,"\\'")}', '${(a.userName||'').replace(/'/g,"\\'")}')"
                    class="flex-1 bg-green-500 hover:bg-green-600 text-white text-xs font-bold py-2 px-3 rounded-lg transition-colors">
                    <i class="fa-solid fa-check mr-1"></i>Reactivar
                  </button>
                  <button onclick="Admin.deleteAppointment('${doc.id}')"
                    class="bg-red-100 hover:bg-red-200 text-red-600 text-xs font-bold py-2 px-3 rounded-lg transition-colors">
                    <i class="fa-solid fa-trash"></i>
                  </button>`}`}
              ${a.userPhone ? `
                <a href="${Admin.buildWhatsApp(a.userPhone, a.userName, a.service, a.date, a.time)}" target="_blank"
                  class="bg-green-500 hover:bg-green-600 text-white text-xs font-bold py-2 px-3 rounded-lg transition-colors flex items-center gap-1">
                  <i class="fa-brands fa-whatsapp text-sm"></i>WA
                </a>` : ''}
            </div>
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

      if (msgs[newStatus] && userId && userId !== 'null') {
        await NotificationService.sendToUser(userId, msgs[newStatus].title, msgs[newStatus].body);
      }

      Admin.showAlert(`Cita ${newStatus === 'confirmed' ? 'confirmada' : 'cancelada'}.`, 'success');

    } catch (err) {
      console.error(err);
      Admin.showAlert('Error actualizando la cita.', 'error');
    }
  },

  // ── Eliminar cita cancelada ───────────────────────────────
  async deleteAppointment(id) {
    if (!confirm('¿Eliminar esta cita permanentemente?')) return;
    try {
      await db.collection('appointments').doc(id).delete();
      Admin.showAlert('Cita eliminada.', 'success');
    } catch (err) {
      console.error(err);
      Admin.showAlert('Error eliminando la cita.', 'error');
    }
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

    // Badge de pendientes en el tab
    const badge = document.getElementById('tab-pending-badge');
    if (badge) {
      if (counts.pending > 0) {
        badge.textContent = counts.pending;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }
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
    ['citas', 'usuarios', 'servicios'].forEach(t => {
      const section = document.getElementById(`admin-tab-${t}`);
      if (section) section.classList.toggle('hidden', t !== tab);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (tab === 'usuarios') Admin.loadUsers();
    if (tab === 'servicios') { Admin.loadServicesAdmin(); Admin.loadHours(); Admin.loadDays(); Admin.updateNotifToggle(); }
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
  },

  // ── WhatsApp reminder link ────────────────────────────────
  buildWhatsApp(phone, name, service, date, time) {
    const clean = phone.replace(/\D/g, '');
    const num   = clean.startsWith('1') ? clean : '1' + clean;
    const lines = [
      'Hola ' + name + ', te recordamos tu cita en KineSport PR:',
      '',
      'Servicio: ' + service,
      'Fecha: ' + Admin.formatDate(date),
      'Hora: ' + time,
      '',
      'Te esperamos! Cualquier cambio escribenos.'
    ];
    return 'https://wa.me/' + num + '?text=' + encodeURIComponent(lines.join('\n'));
  },

  // ── Servicios: cargar lista ───────────────────────────────
  async loadServicesAdmin() {
    const container = document.getElementById('services-admin-list');
    if (!container) return;
    container.innerHTML = '<p class="text-center text-gray-400 py-4"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Cargando...</p>';
    try {
      const snap = await db.collection('services').orderBy('order').get();
      if (snap.empty) {
        container.innerHTML = '<p class="text-center text-gray-400 py-4 text-sm">No hay servicios. Agrega uno arriba.</p>';
        return;
      }
      container.innerHTML = snap.docs.map(doc => {
        const s = doc.data();
        return `
          <div class="bg-white rounded-xl p-3 shadow-sm flex justify-between items-center">
            <div class="flex-1 min-w-0">
              <p class="font-bold text-gray-800 text-sm">${s.name}
                <span class="font-bold text-[--kine-orange] ml-2">$${s.price}.00</span>
              </p>
              <p class="text-xs text-gray-500 truncate">${s.description || ''} · ${s.duration} min</p>
            </div>
            <div class="flex gap-2 ml-3 flex-shrink-0">
              <button onclick="Admin.editService('${doc.id}','${s.name.replace(/'/g,"\\'")}','${(s.description||'').replace(/'/g,"\\'")}',${s.price},${s.duration})"
                class="text-xs bg-blue-100 text-blue-600 font-bold px-3 py-1.5 rounded-lg">
                <i class="fa-solid fa-pen"></i>
              </button>
              <button onclick="Admin.deleteService('${doc.id}')"
                class="text-xs bg-red-100 text-red-500 font-bold px-3 py-1.5 rounded-lg">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </div>`;
      }).join('');
    } catch (err) {
      console.error(err);
      container.innerHTML = '<p class="text-center text-red-400 py-4 text-sm">Error cargando servicios.</p>';
    }
  },

  // ── Servicios: guardar (crear o actualizar) ───────────────
  async saveService() {
    const id       = document.getElementById('service-edit-id').value;
    const name     = document.getElementById('svc-name').value.trim();
    const desc     = document.getElementById('svc-desc').value.trim();
    const price    = parseFloat(document.getElementById('svc-price').value);
    const duration = parseInt(document.getElementById('svc-duration').value);

    if (!name || !price || !duration) {
      Admin.showAlert('Completa nombre, precio y duración.', 'error');
      return;
    }

    try {
      if (id) {
        await db.collection('services').doc(id).update({ name, description: desc, price, duration });
        Admin.showAlert('Servicio actualizado.', 'success');
      } else {
        const snap = await db.collection('services').get();
        await db.collection('services').add({ name, description: desc, price, duration, order: snap.size + 1 });
        Admin.showAlert('Servicio agregado.', 'success');
      }
      Admin.cancelEditService();
      Admin.loadServicesAdmin();
    } catch (err) {
      console.error(err);
      Admin.showAlert('Error guardando servicio.', 'error');
    }
  },

  // ── Servicios: cargar datos en form para editar ───────────
  editService(id, name, desc, price, duration) {
    document.getElementById('service-edit-id').value  = id;
    document.getElementById('svc-name').value         = name;
    document.getElementById('svc-desc').value         = desc;
    document.getElementById('svc-price').value        = price;
    document.getElementById('svc-duration').value     = duration;
    document.getElementById('service-form-title').textContent = 'Editar Servicio';
    document.getElementById('svc-name').focus();
  },

  // ── Servicios: eliminar ───────────────────────────────────
  async deleteService(id) {
    if (!confirm('¿Eliminar este servicio?')) return;
    try {
      await db.collection('services').doc(id).delete();
      Admin.showAlert('Servicio eliminado.', 'success');
      Admin.loadServicesAdmin();
    } catch (err) {
      console.error(err);
      Admin.showAlert('Error eliminando servicio.', 'error');
    }
  },

  // ── Servicios: cancelar edición ───────────────────────────
  cancelEditService() {
    document.getElementById('service-edit-id').value  = '';
    document.getElementById('svc-name').value         = '';
    document.getElementById('svc-desc').value         = '';
    document.getElementById('svc-price').value        = '';
    document.getElementById('svc-duration').value     = '';
    document.getElementById('service-form-title').textContent = 'Agregar Servicio';
  },

  // ── Horas: cargar desde Firestore ────────────────────────
  async loadHours() {
    const container = document.getElementById('hours-list');
    if (!container) return;
    try {
      const doc = await db.collection('settings').doc('hours').get();
      const hours = doc.exists ? (doc.data().list || []) : [];
      Admin._renderHourChips(hours);
    } catch (err) {
      console.error(err);
    }
  },

  _renderHourChips(hours) {
    const container = document.getElementById('hours-list');
    if (!container) return;
    if (hours.length === 0) {
      container.innerHTML = '<p class="text-xs text-gray-400">Sin horas configuradas.</p>';
      return;
    }
    container.innerHTML = hours.map(h => `
      <span class="inline-flex items-center gap-1 bg-teal-50 text-teal-700 text-xs font-semibold px-3 py-1.5 rounded-full">
        ${h}
        <button onclick="Admin._removeHourChip(this)" class="hover:text-red-500 transition-colors ml-1">
          <i class="fa-solid fa-xmark text-xs"></i>
        </button>
      </span>`).join('');
  },

  _removeHourChip(btn) {
    btn.closest('span').remove();
  },

  // ── Horas: agregar chip ───────────────────────────────────
  addHour() {
    const input = document.getElementById('new-hour');
    const val   = input.value.trim();
    if (!val) return;
    const container = document.getElementById('hours-list');
    const placeholder = container.querySelector('p');
    if (placeholder) placeholder.remove();
    const chip = document.createElement('span');
    chip.className = 'inline-flex items-center gap-1 bg-teal-50 text-teal-700 text-xs font-semibold px-3 py-1.5 rounded-full';
    chip.innerHTML = `${val}<button onclick="Admin._removeHourChip(this)" class="hover:text-red-500 transition-colors ml-1"><i class="fa-solid fa-xmark text-xs"></i></button>`;
    container.appendChild(chip);
    input.value = '';
    input.focus();
  },

  // ── Horas: guardar en Firestore ───────────────────────────
  async saveHours() {
    const chips = document.querySelectorAll('#hours-list span');
    const hours = Array.from(chips).map(c => c.childNodes[0].textContent.trim()).filter(Boolean);
    try {
      await db.collection('settings').doc('hours').set({ list: hours });
      Admin.showAlert('Horas guardadas.', 'success');
    } catch (err) {
      console.error(err);
      Admin.showAlert('Error guardando horas.', 'error');
    }
  },

  // ── Días: cargar desde Firestore ─────────────────────────
  async loadDays() {
    try {
      const doc = await db.collection('settings').doc('days').get();
      // Default: Lun-Vie (1-5)
      const days = doc.exists ? (doc.data().list || [1,2,3,4,5]) : [1,2,3,4,5];
      document.querySelectorAll('.day-checkbox').forEach(cb => {
        cb.checked = days.includes(parseInt(cb.value));
      });
    } catch (err) {
      console.error(err);
    }
  },

  // ── Días: guardar en Firestore ────────────────────────────
  async saveDays() {
    const days = Array.from(document.querySelectorAll('.day-checkbox:checked'))
      .map(cb => parseInt(cb.value));
    if (days.length === 0) {
      Admin.showAlert('Selecciona al menos un día.', 'error');
      return;
    }
    try {
      await db.collection('settings').doc('days').set({ list: days });
      Admin.showAlert('Días guardados.', 'success');
    } catch (err) {
      console.error(err);
      Admin.showAlert('Error guardando días.', 'error');
    }
  },

  // ── Toggle de notificaciones push ────────────────────────
  updateNotifToggle() {
    const toggle   = document.getElementById('notif-toggle');
    const knob     = document.getElementById('notif-knob');
    const statusEl = document.getElementById('notif-status-text');
    if (!toggle) return;

    const permission = NotificationService.getPermissionStatus();
    const hasToken   = !!(Admin.currentUser && Admin.currentUser.fcmToken);
    const isOn       = permission === 'granted' && hasToken;

    if (permission === 'unsupported') {
      statusEl.textContent = 'No soportado en este dispositivo';
      toggle.disabled = true;
      toggle.classList.add('opacity-40');
      return;
    }
    if (permission === 'denied') {
      statusEl.textContent = 'Bloqueado — actívalo en Ajustes del sistema';
      toggle.style.background = '#e5e7eb';
      knob.style.transform = 'translateX(0)';
      return;
    }
    if (isOn) {
      statusEl.textContent = 'Activado — recibirás alertas de nuevas citas';
      toggle.style.background = 'var(--kine-teal)';
      knob.style.transform = 'translateX(24px)';
    } else {
      statusEl.textContent = 'Toca para activar las notificaciones';
      toggle.style.background = '#e5e7eb';
      knob.style.transform = 'translateX(0)';
    }
  },

  // ── Novedades / What's New ────────────────────────────────
  checkNovedades() {
    const CURRENT_VERSION = '1.9';
    const seen = localStorage.getItem('ks_admin_seen_version');
    if (seen === CURRENT_VERSION) return;
    // Pequeño delay para que cargue el panel primero
    setTimeout(() => {
      document.getElementById('novedades-modal').classList.remove('hidden');
    }, 800);
  },

  closeNovedades() {
    const CURRENT_VERSION = '1.9';
    localStorage.setItem('ks_admin_seen_version', CURRENT_VERSION);
    document.getElementById('novedades-modal').classList.add('hidden');
  },

  // ── Cita Manual: abrir modal ──────────────────────────────
  async openManualModal() {
    // Limpiar form
    ['manual-name','manual-phone','manual-notes'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    document.getElementById('manual-date').value = new Date().toISOString().split('T')[0];

    // Cargar servicios
    const svcSelect = document.getElementById('manual-service');
    svcSelect.innerHTML = '<option value="">Selecciona un servicio *</option>';
    try {
      const snap = await db.collection('services').orderBy('order').get();
      snap.docs.forEach(doc => {
        const s = doc.data();
        const opt = document.createElement('option');
        opt.value = JSON.stringify({ name: s.name, price: s.price });
        opt.textContent = `${s.name} — $${s.price}`;
        svcSelect.appendChild(opt);
      });
    } catch (e) { console.error(e); }

    // Cargar horas
    const timeSelect = document.getElementById('manual-time');
    timeSelect.innerHTML = '<option value="">Hora *</option>';
    try {
      const doc = await db.collection('settings').doc('hours').get();
      const hours = doc.exists ? (doc.data().list || []) : [];
      hours.forEach(h => {
        const opt = document.createElement('option');
        opt.value = h;
        opt.textContent = h;
        timeSelect.appendChild(opt);
      });
    } catch (e) { console.error(e); }

    document.getElementById('manual-modal').classList.remove('hidden');
    document.getElementById('manual-name').focus();
  },

  closeManualModal() {
    document.getElementById('manual-modal').classList.add('hidden');
  },

  // ── Cita Manual: guardar ──────────────────────────────────
  async saveManualAppointment() {
    const name    = document.getElementById('manual-name').value.trim();
    const phone   = document.getElementById('manual-phone').value.trim();
    const svcRaw  = document.getElementById('manual-service').value;
    const date    = document.getElementById('manual-date').value;
    const time    = document.getElementById('manual-time').value;
    const notes   = document.getElementById('manual-notes').value.trim();

    if (!name) { Admin.showAlert('Ingresa el nombre del cliente.', 'error'); return; }
    if (!svcRaw) { Admin.showAlert('Selecciona un servicio.', 'error'); return; }
    if (!date)  { Admin.showAlert('Selecciona una fecha.', 'error'); return; }
    if (!time)  { Admin.showAlert('Selecciona una hora.', 'error'); return; }

    const svc = JSON.parse(svcRaw);

    try {
      await db.collection('appointments').add({
        userId:    null,
        isManual:  true,
        userName:  name,
        userEmail: '',
        userPhone: phone,
        service:   svc.name,
        price:     svc.price,
        date,
        time,
        notes,
        status:    'confirmed',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      Admin.closeManualModal();
      Admin.showQRModal(name);

    } catch (err) {
      console.error(err);
      Admin.showAlert('Error guardando la cita.', 'error');
    }
  },

  // ── QR Modal ──────────────────────────────────────────────
  showQRModal(clientName) {
    document.getElementById('qr-client-name').textContent = `Cita para: ${clientName}`;
    const canvas = document.getElementById('qr-canvas');
    canvas.innerHTML = '';
    const url = window.location.origin + '/register.html';
    new QRCode(canvas, {
      text:         url,
      width:        200,
      height:       200,
      correctLevel: QRCode.CorrectLevel.M
    });
    document.getElementById('qr-modal').classList.remove('hidden');
  },

  closeQRModal() {
    document.getElementById('qr-modal').classList.add('hidden');
  },

  async shareQR() {
    const url = window.location.origin + '/register.html';
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'KineSport PR — Descarga la App',
          text:  'Regístrate en KineSport PR para ver tus citas y reservar nuevas.',
          url
        });
      } catch (e) { /* usuario canceló */ }
    } else {
      navigator.clipboard?.writeText(url);
      Admin.showAlert('Enlace copiado al portapapeles.', 'success');
    }
  },

  downloadQR() {
    const img = document.querySelector('#qr-canvas img');
    if (!img) { Admin.showAlert('QR no disponible aún.', 'error'); return; }
    const link = document.createElement('a');
    link.download = 'kinesport-qr.png';
    link.href = img.src;
    link.click();
  },

  async toggleNotifications() {
    const permission = NotificationService.getPermissionStatus();
    const hasToken   = !!(Admin.currentUser && Admin.currentUser.fcmToken);
    const isOn       = permission === 'granted' && hasToken;

    if (permission === 'denied') {
      Admin.showAlert('Notificaciones bloqueadas. Actívalo en Ajustes del sistema.', 'error');
      return;
    }

    if (isOn) {
      await NotificationService.disable();
      Admin.currentUser.fcmToken = '';
      Admin.showAlert('Notificaciones desactivadas.', 'success');
    } else {
      const result = await NotificationService.enable();
      if (result === 'granted') {
        const doc = await db.collection('users').doc(Admin.currentUser.uid).get();
        Admin.currentUser.fcmToken = doc.data().fcmToken || '';
        Admin.showAlert('¡Notificaciones activadas!', 'success');
      } else if (result === 'denied') {
        Admin.showAlert('Permiso denegado. Actívalo en Ajustes del sistema.', 'error');
      } else if (result === 'unsupported') {
        Admin.showAlert('Este dispositivo no soporta notificaciones push.', 'error');
      }
    }
    Admin.updateNotifToggle();
  }
};

document.addEventListener('DOMContentLoaded', Admin.init.bind(Admin));
