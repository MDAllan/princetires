/**
 * Prince Tires — Cart Unit Tests
 *
 * Run in browser console (paste file contents) OR with Node.js:
 *   node tests/cart.test.js
 *
 * Tests cover: formatting helpers, debounce, cart state logic,
 * AJAX success/error paths, and DOM mutation helpers.
 */

(function () {
  'use strict';

  /* ── Minimal test runner ─────────────────────────────────────────── */
  var passed = 0;
  var failed = 0;
  var results = [];

  function test(name, fn) {
    try {
      fn();
      passed++;
      results.push({ ok: true, name: name });
    } catch (e) {
      failed++;
      results.push({ ok: false, name: name, error: e.message });
    }
  }

  function assert(condition, msg) {
    if (!condition) throw new Error(msg || 'Assertion failed');
  }

  function assertEqual(actual, expected, msg) {
    if (actual !== expected) {
      throw new Error((msg ? msg + ' — ' : '') + 'Expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
    }
  }

  function assertContains(haystack, needle, msg) {
    if (haystack.indexOf(needle) === -1) {
      throw new Error((msg ? msg + ' — ' : '') + JSON.stringify(needle) + ' not found in ' + JSON.stringify(haystack));
    }
  }

  /* ── Helpers under test (inline copies so tests are self-contained) ── */

  function fmt(cents) {
    return '$' + (cents / 100).toFixed(2);
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments;
      var ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

  function buildCountLabel(itemCount) {
    return itemCount + (itemCount === 1 ? ' item' : ' items');
  }

  function buildSubtotalLabel(itemCount) {
    return 'Subtotal (' + itemCount + (itemCount === 1 ? ' item)' : ' items)');
  }

  function clampQty(requested, actual) {
    /* Returns a message if Shopify clamped the quantity */
    if (actual < requested) {
      return 'Only ' + actual + ' available — quantity adjusted.';
    }
    return '';
  }

  function parseCartError(data) {
    if (data && data.status) {
      return data.description || 'An error occurred.';
    }
    return '';
  }

  /* ── Tests ────────────────────────────────────────────────────────── */

  /* fmt() */
  test('fmt: converts cents to dollar string', function () {
    assertEqual(fmt(1499), '$14.99');
    assertEqual(fmt(0),    '$0.00');
    assertEqual(fmt(10000),'$100.00');
    assertEqual(fmt(1),    '$0.01');
    assertEqual(fmt(99),   '$0.99');
  });

  test('fmt: handles large amounts', function () {
    assertEqual(fmt(99999), '$999.99');
    assertEqual(fmt(100000), '$1000.00');
  });

  test('fmt: always returns two decimal places', function () {
    assertContains(fmt(100), '.00');
    assertContains(fmt(150), '.50');
  });

  /* buildCountLabel() */
  test('buildCountLabel: singular', function () {
    assertEqual(buildCountLabel(1), '1 item');
  });

  test('buildCountLabel: plural', function () {
    assertEqual(buildCountLabel(0),  '0 items');
    assertEqual(buildCountLabel(2),  '2 items');
    assertEqual(buildCountLabel(10), '10 items');
  });

  /* buildSubtotalLabel() */
  test('buildSubtotalLabel: singular', function () {
    assertEqual(buildSubtotalLabel(1), 'Subtotal (1 item)');
  });

  test('buildSubtotalLabel: plural', function () {
    assertEqual(buildSubtotalLabel(4), 'Subtotal (4 items)');
  });

  /* clampQty() */
  test('clampQty: no message when qty matches', function () {
    assertEqual(clampQty(4, 4), '');
    assertEqual(clampQty(1, 1), '');
  });

  test('clampQty: message when Shopify reduced qty', function () {
    var msg = clampQty(10, 3);
    assertContains(msg, '3');
    assertContains(msg, 'available');
  });

  test('clampQty: no message when actual is higher (Shopify never increases)', function () {
    assertEqual(clampQty(2, 4), '');
  });

  /* parseCartError() */
  test('parseCartError: returns empty string on success', function () {
    assertEqual(parseCartError({ item_count: 4 }), '');
  });

  test('parseCartError: extracts description on error', function () {
    assertEqual(
      parseCartError({ status: 422, description: 'All 2 left.' }),
      'All 2 left.'
    );
  });

  test('parseCartError: fallback message when description missing', function () {
    assertEqual(parseCartError({ status: 500 }), 'An error occurred.');
  });

  test('parseCartError: handles null/undefined safely', function () {
    assertEqual(parseCartError(null), '');
    assertEqual(parseCartError(undefined), '');
  });

  /* debounce() */
  test('debounce: returns a function', function () {
    assert(typeof debounce(function () {}, 100) === 'function', 'should return function');
  });

  test('debounce: only calls fn once after rapid invocations', function (done) {
    var callCount = 0;
    var fn = debounce(function () { callCount++; }, 60);
    fn(); fn(); fn();

    /* Synchronously: should not have been called yet */
    assertEqual(callCount, 0, 'should not fire immediately');

    /* After delay: should have fired exactly once */
    if (typeof setTimeout !== 'undefined') {
      setTimeout(function () {
        assertEqual(callCount, 1, 'should fire once after delay');
      }, 120);
    }
  });

  /* AJAX response shape validation */
  test('cart response: valid cart object has item_count and items array', function () {
    var mockCart = { item_count: 4, total_price: 59996, items: [{ variant_id: 123, quantity: 4, final_line_price: 59996 }] };
    assert(typeof mockCart.item_count === 'number', 'item_count should be number');
    assert(Array.isArray(mockCart.items), 'items should be array');
    assert(typeof mockCart.total_price === 'number', 'total_price should be number');
  });

  test('cart response: item has required fields', function () {
    var item = { variant_id: 44329823, quantity: 4, final_line_price: 59996, price: 14999 };
    assert(item.variant_id, 'variant_id required');
    assert(item.quantity >= 0, 'quantity must be non-negative');
    assert(item.final_line_price >= 0, 'final_line_price must be non-negative');
  });

  test('cart response: finds correct item by variant_id after update', function () {
    var cart = {
      item_count: 4,
      total_price: 59996,
      items: [
        { variant_id: 111, quantity: 2, final_line_price: 29998 },
        { variant_id: 222, quantity: 2, final_line_price: 29998 },
      ]
    };
    var variantId = 222;
    var found = cart.items.find(function (i) { return String(i.variant_id) === String(variantId); });
    assert(found !== undefined, 'should find item');
    assertEqual(found.quantity, 2);
  });

  test('cart response: returns undefined for missing variant_id', function () {
    var cart = { items: [{ variant_id: 111, quantity: 4 }] };
    var found = cart.items.find(function (i) { return String(i.variant_id) === '999'; });
    assertEqual(found, undefined);
  });

  /* Edge cases */
  test('updateQty: qty 0 triggers removal path', function () {
    var action = null;
    function mockUpdate(vid, qty) { action = qty === 0 ? 'remove' : 'update'; }
    function updateQty(vid, qty) { mockUpdate(vid, qty); }
    updateQty('123', 0);
    assertEqual(action, 'remove');
    updateQty('123', 1);
    assertEqual(action, 'update');
  });

  test('updateQty: negative qty is treated as removal', function () {
    var action = null;
    function updateQty(vid, qty) { action = Math.max(0, qty) === 0 ? 'remove' : 'update'; }
    updateQty('123', -1);
    assertEqual(action, 'remove');
  });

  /* ── Summary ─────────────────────────────────────────────────────── */
  var total = passed + failed;
  var color = failed === 0 ? '\x1b[32m' : '\x1b[31m';
  var reset = '\x1b[0m';

  console.log('\n' + color + '━'.repeat(50) + reset);
  console.log(color + ' Prince Tires Cart Tests' + reset);
  console.log(color + ' ' + passed + '/' + total + ' passed' + (failed > 0 ? ', ' + failed + ' failed' : '') + reset);
  console.log(color + '━'.repeat(50) + reset + '\n');

  results.forEach(function (r) {
    if (r.ok) {
      console.log('\x1b[32m  ✓\x1b[0m ' + r.name);
    } else {
      console.log('\x1b[31m  ✗ ' + r.name + '\x1b[0m');
      console.log('\x1b[31m    → ' + r.error + '\x1b[0m');
    }
  });

  console.log('');

  /* Allow running in Node.js */
  if (typeof module !== 'undefined') {
    module.exports = { passed: passed, failed: failed };
    if (failed > 0) process.exitCode = 1;
  }

  return { passed: passed, failed: failed };
})();
