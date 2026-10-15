import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

test('product submit saves and refreshes catalog even when a named input shadows form.id', async () => {
  const source = await readFile('public/app.js', 'utf8');
  const start = source.indexOf("document.addEventListener('submit', async (event) => {");
  const end = source.indexOf("\n});", start) + 4;
  let submit;
  const calls = [];
  const button = { disabled: false };
  const form = {
    id: { value: '' },
    getAttribute: () => 'product-form',
    querySelector: () => button,
  };
  runInNewContext(source.slice(start, end), {
    document: {
      addEventListener: (name, handler) => {
        if (name === 'submit') submit = handler;
      },
    },
    FormData: class {
      *[Symbol.iterator]() {
        yield* Object.entries({
          id: '',
          name: 'Produk baru',
          unit: '1 buah',
          price: '5000',
          category: 'Buah',
          image: '/icon.svg',
          available: 'on',
        });
      }
    },
    crypto: { randomUUID: () => '12345678-1234-1234-1234-123456789012' },
    $: (selector) =>
      selector === '#product-photo' ? { files: [] } : { close: () => calls.push('close') },
    api: async (path, options) => calls.push({ path, body: JSON.parse(options.body) }),
    bootstrap: async () => calls.push('refresh'),
    renderProductAdmin: () => calls.push('render'),
    toast: (message) => calls.push(message),
  });
  let prevented = false;
  await submit({
    target: form,
    preventDefault: () => {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  assert.equal(calls[0].path, '/api/seller/products/produk-12345678');
  assert.equal(calls[0].body.name, 'Produk baru');
  assert.equal(calls[0].body.price, 5000);
  assert.equal(calls[0].body.available, true);
  assert.deepEqual(calls.slice(1), ['close', 'refresh', 'render', 'Perubahan tersimpan.']);
  assert.equal(button.disabled, false);
});
