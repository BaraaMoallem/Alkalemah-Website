import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registrationButton, registrationCount } from '../src/registration.js';

class Element {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.listeners = new Map();
    this.dataset = {};
    this.isConnected = true;
  }
  append(...children) { this.children.push(...children); for (const child of children) child.parent = this; }
  remove() {
    this.isConnected = false;
    if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
  }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(name, listener) { this.listeners.set(name, listener); }
  fire(name, details = {}) {
    const event = { target: this, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; }, ...details };
    this.listeners.get(name)?.(event);
    if (name === 'cancel' && !event.defaultPrevented) this.close();
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
    assert.match(dialog.className, /registration-modal/);
    assert.equal(dialog['aria-labelledby'], 'registration-title');
    assert.equal(dialog['aria-modal'], 'true');
    const parts = descendants(dialog);
    assert.match(parts.find(item => item.tagName === 'div').className, /text-right/);
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
    resolveRegistration({ ok: true, json: async () => ({ ok: true, code: 'REGISTERED', alreadyRegistered: false, count: 1 }) });
    await new Promise(resolve => setImmediate(resolve));
    assert.match(count.textContent, /١/);
    assert.match(parts.find(item => item.role === 'alert').textContent, /تم تسجيل حضورك بنجاح/);
    dialog.fire('cancel');
    assert.equal(dialog.isConnected, false);
    assert.equal(button.focused, true);
    button.fire('click');
    const outsideDialog = body.children.find(item => item.tagName === 'dialog');
    outsideDialog.fire('click');
    assert.equal(outsideDialog.isConnected, false);
    globalThis.fetch = async () => ({ ok: false,
      json: async () => ({ ok: false, code: 'INVALID_EVENT' }) });
    button.fire('click');
    const errorDialog = body.children.find(item => item.tagName === 'dialog');
    const errorParts = descendants(errorDialog);
    const errorInputs = errorParts.filter(item => item.tagName === 'input');
    errorInputs[0].value = 'Guest Name';
    errorInputs[1].value = '+201234567890';
    errorInputs[2].value = '';
    errorParts.find(item => item.tagName === 'form').fire('submit');
    await new Promise(resolve => setImmediate(resolve));
    assert.match(errorParts.find(item => item.role === 'alert').textContent, /لم يعد هذا الاجتماع متاحًا/);
    errorDialog.fire('cancel');
  } finally {
    globalThis.document = oldDocument;
    globalThis.fetch = oldFetch;
  }
});

test('dialog CSS centers independently of RTL and stays within a mobile viewport', () => {
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  assert.match(css, /dialog\.registration-modal\s*\{[^}]*position:\s*fixed;[^}]*top:\s*50%;[^}]*left:\s*50%;[^}]*transform:\s*translate\(-50%, -50%\)/s);
  assert.match(css, /width:\s*min\(35rem, calc\(100vw - 2rem\)\)/);
  assert.match(css, /max-height:\s*calc\(100dvh - 2rem\)/);
  assert.match(css, /overflow-y:\s*auto/);
  assert.match(css, /dialog\.registration-modal::backdrop/);
});
