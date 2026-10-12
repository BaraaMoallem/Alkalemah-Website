const counts = new Map();
const revisions = new Map();

export function updateRegistrationCount(eventId, count) {
  counts.set(eventId, count);
  revisions.set(eventId, (revisions.get(eventId) || 0) + 1);
  for (const element of document.querySelectorAll('[data-registration-count]')) {
    if (element.dataset.registrationCount === eventId) {
      element.textContent = `عدد المسجلين: ${new Intl.NumberFormat('ar-EG').format(count)}`;
    }
  }
}

export function registrationCount(event) {
  const count = document.createElement('p');
  count.className = 'text-sm font-bold mt-3';
  count.dataset.registrationCount = event.id;
  count.setAttribute('aria-live', 'polite');
  const known = counts.get(event.id);
  const revision = revisions.get(event.id) || 0;
  count.textContent = known === undefined ? 'عدد المسجلين: جارٍ التحميل...'
    : `عدد المسجلين: ${new Intl.NumberFormat('ar-EG').format(known)}`;
  fetch(`/api/registration-count?eventId=${encodeURIComponent(event.id)}`, {
    headers: { Accept: 'application/json' }, cache: 'no-store',
  }).then(async response => {
    if (!response.ok) throw new Error('Count unavailable');
    const data = await response.json();
    if (data.eventId !== event.id || !Number.isSafeInteger(data.count) || data.count < 0) throw new Error('Invalid count');
    if ((revisions.get(event.id) || 0) === revision) updateRegistrationCount(event.id, data.count);
  }).catch(() => {
    if (!counts.has(event.id)) count.textContent = 'تعذر عرض عدد المسجلين حاليًا';
  });
  return count;
}

export function registrationButton(event, featured = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'سجل حضورك';
  button.className = featured
    ? 'rounded-xl bg-happy-yellow hover:bg-happy-yellow-dark text-loyal-blue px-5 py-2.5 font-black'
    : 'rounded-xl bg-true-maroon hover:opacity-90 text-white px-5 py-2.5 font-black';
  button.addEventListener('click', () => openRegistration(event, button));
  return button;
}

function openRegistration(event, trigger) {
  const dialog = document.createElement('dialog');
  dialog.dir = 'rtl';
  dialog.className = 'w-[calc(100%-2rem)] max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl p-0 shadow-2xl backdrop:bg-slate-950/70';
  dialog.setAttribute('aria-labelledby', 'registration-title');
  dialog.setAttribute('aria-modal', 'true');
  const panel = document.createElement('div');
  panel.className = 'p-5 sm:p-7 bg-white text-slate-800';
  const heading = document.createElement('h2');
  heading.id = 'registration-title';
  heading.className = 'text-xl font-black text-loyal-blue';
  heading.textContent = 'تسجيل حضور الاجتماع';
  const meeting = document.createElement('p');
  meeting.className = 'mt-2 text-slate-600 font-bold';
  meeting.textContent = event.title;
  meeting.dir = 'auto';
  const form = document.createElement('form');
  form.noValidate = true;
  form.className = 'mt-5 space-y-4';
  const inputs = {};
  for (const [key, label, type, maxLength, autocomplete] of [
    ['name', 'الاسم الكامل *', 'text', 120, 'name'],
    ['phone', 'رقم واتساب *', 'tel', 32, 'tel'],
    ['email', 'البريد الإلكتروني', 'email', 254, 'email'],
  ]) {
    const field = document.createElement('label');
    field.className = 'block text-sm font-bold text-loyal-blue';
    field.textContent = label;
    const input = document.createElement('input');
    input.name = key;
    input.type = type;
    input.maxLength = maxLength;
    input.autocomplete = autocomplete;
    input.required = key !== 'email';
    input.dir = key === 'name' ? 'auto' : 'ltr';
    input.className = 'mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-800 focus:outline-2 focus:outline-loyal-blue';
    field.append(input);
    form.append(field);
    inputs[key] = input;
  }
  const status = document.createElement('p');
  status.className = 'text-sm font-bold min-h-5';
  status.setAttribute('role', 'alert');
  const actions = document.createElement('div');
  actions.className = 'flex flex-wrap gap-3 pt-1';
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = 'تأكيد التسجيل';
  submit.className = 'rounded-xl bg-true-maroon hover:opacity-90 text-white px-5 py-2.5 font-bold disabled:opacity-50';
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'إغلاق';
  close.className = 'rounded-xl border border-slate-300 text-loyal-blue px-5 py-2.5 font-bold';
  close.addEventListener('click', () => dialog.close());
  actions.append(submit, close);
  form.append(status, actions);
  panel.append(heading, meeting, form);
  dialog.append(panel);
  document.body.append(dialog);
  dialog.addEventListener('close', () => {
    dialog.remove();
    if (trigger.isConnected) trigger.focus();
  }, { once: true });
  let pending = false;
  dialog.addEventListener('cancel', e => { if (pending) e.preventDefault(); });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (pending) return;
    const name = inputs.name.value.trim();
    const phone = inputs.phone.value.trim();
    const email = inputs.email.value.trim();
    if (!name) { status.textContent = 'يرجى إدخال الاسم الكامل.'; inputs.name.focus(); return; }
    if (!/^[+\d][\d\s().-]{6,31}$/u.test(phone)) {
      status.textContent = 'يرجى إدخال رقم واتساب صحيح.'; inputs.phone.focus(); return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
      status.textContent = 'يرجى إدخال بريد إلكتروني صحيح.'; inputs.email.focus(); return;
    }
    pending = true;
    submit.disabled = true;
    close.disabled = true;
    status.textContent = 'جارٍ تسجيل حضورك...';
    try {
      const response = await fetch('/api/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, email, eventId: event.id, eventTitle: event.title, eventStart: event.start }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 404) throw new Error('لم يعد هذا الاجتماع متاحًا للتسجيل. يرجى تحديث الصفحة.');
        if (response.status === 429) throw new Error('محاولات كثيرة. يرجى الانتظار قليلًا ثم المحاولة مجددًا.');
        throw new Error('تعذر تسجيل الحضور حاليًا. يرجى المحاولة لاحقًا.');
      }
      if (Number.isSafeInteger(data.count) && data.count >= 0) updateRegistrationCount(event.id, data.count);
      status.textContent = data.alreadyRegistered === true
        ? 'أنت مسجل بالفعل في هذا الاجتماع.' : 'تم تسجيل حضورك بنجاح. ننتظرك في الاجتماع!';
      status.className = 'text-sm font-bold text-emerald-700';
      for (const input of Object.values(inputs)) input.disabled = true;
      submit.remove();
      if (data.count === null) refreshCount(event);
    } catch (error) {
      status.textContent = error.message?.startsWith('لم يعد') || error.message?.startsWith('محاولات')
        ? error.message : 'تعذر تسجيل الحضور حاليًا. يرجى المحاولة لاحقًا.';
      submit.disabled = false;
    } finally {
      pending = false;
      close.disabled = false;
    }
  });
  dialog.showModal();
  inputs.name.focus();
}

function refreshCount(event) {
  // A successful write can be followed by a count-only read if the upstream omitted its count.
  const revision = revisions.get(event.id) || 0;
  fetch(`/api/registration-count?eventId=${encodeURIComponent(event.id)}`, { cache: 'no-store' })
    .then(response => response.ok ? response.json() : null)
    .then(data => { if ((revisions.get(event.id) || 0) === revision && data &&
      Number.isSafeInteger(data.count) && data.count >= 0) updateRegistrationCount(event.id, data.count); })
    .catch(() => {});
}
