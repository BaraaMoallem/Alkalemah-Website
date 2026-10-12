import test from 'node:test';
import assert from 'node:assert/strict';
import { registrationButton, registrationCount } from '../src/registration.js';

class Element {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.listeners = new Map();
    this.dataset = {};
    this.isConnected = true;
  }
  append(...children) { this.children.push(...children); }
  remove() { this.isConnected = false; }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(name, listener) { this.listeners.set(name, listener); }
  fire(name) {
    const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    this.listeners.get(name)?.(event);
    return event;
  }
  showModal() { this.open = true; }
  close() { this.open = false; this.fire('close'); }
  focus() { this.focused = true; }
}

function descendants(root) {
  return [root, ...root.children.flatMap(descendants)];
}

test('registration modal is keyboard operable, mobile sized, prevents rapid duplicate submits and updates count', async () => {
  const oldDocument = globalThis.document;
  const oldFetch = globalThis.fetch;
  const body = new Element('body');
  globalThis.document = {
    body,
    createElement: tag => new Element(tag),
    querySelectorAll: selector => selector === '[data-registration-count]'
      ? descendants(body).filter(item => item.dataset.registrationCount) : [],
  };
  const event = { id: 'ui_event', title: 'اجتماع تجريبي', start: '2030-01-01T19:00:00+02:00' };
  let resolveRegistration;
  let registrationCalls = 0;
  globalThis.fetch = async url => {
    if (url.startsWith('/api/registration-count')) {
      return { ok: true, json: async () => ({ eventId: event.id, count: 0 }) };
    }
    registrationCalls++;
    return new Promise(resolve => { resolveRegistration = resolve; });
  };
  try {
    const count = registrationCount(event);
    body.append(count);
    await new Promise(resolve => setImmediate(resolve));
    assert.match(count.textContent, /٠/);
    const button = registrationButton(event, true);
    body.append(button);
    button.fire('click');
    const dialog = body.children.find(item => item.tagName === 'dialog');
    assert.equal(dialog.open, true);
    assert.equal(dialog.dir, 'rtl');
    assert.match(dialog.className, /max-w-lg|max-h-\[calc/);
    assert.equal(dialog['aria-labelledby'], 'registration-title');
    const parts = descendants(dialog);
    const form = parts.find(item => item.tagName === 'form');
    const inputs = parts.filter(item => item.tagName === 'input');
    assert.equal(inputs[0].focused, true);
    inputs[0].value = 'Guest Name';
    inputs[1].value = '+201234567890';
    inputs[2].value = '';
    form.fire('submit');
    form.fire('submit');
    assert.equal(registrationCalls, 1);
    assert.equal(dialog.fire('cancel').defaultPrevented, true);
    const submit = parts.find(item => item.type === 'submit');
    assert.equal(submit.disabled, true);
    resolveRegistration({ ok: true, json: async () => ({ alreadyRegistered: false, count: 1 }) });
    await new Promise(resolve => setImmediate(resolve));
    assert.match(count.textContent, /١/);
    assert.match(parts.find(item => item.role === 'alert').textContent, /تم تسجيل حضورك بنجاح/);
    const close = parts.find(item => item.textContent === 'إغلاق');
    close.fire('click');
    assert.equal(dialog.isConnected, false);
    assert.equal(button.focused, true);
  } finally {
    globalThis.document = oldDocument;
    globalThis.fetch = oldFetch;
  }
});
