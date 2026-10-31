/* @ds-bundle: {"format":4,"namespace":"Kvita","components":[{"name":"Button"},{"name":"Eyebrow"},{"name":"StatusBadge"},{"name":"Field"},{"name":"ChargeCard"},{"name":"PaymentPanel"},{"name":"SettledBanner"}]} */
(function () {
  var React = window.React;
  var h = React.createElement;

  function cx() {
    var out = [];
    for (var i = 0; i < arguments.length; i++) { if (arguments[i]) out.push(arguments[i]); }
    return out.join(' ');
  }
  function omit(obj, keys) {
    var r = {};
    for (var k in obj) { if (Object.prototype.hasOwnProperty.call(obj, k) && keys.indexOf(k) === -1) r[k] = obj[k]; }
    return r;
  }
  function eur(cents) {
    var n = (typeof cents === 'number' ? cents : 0) / 100;
    try { return new Intl.NumberFormat('sl-SI', { style: 'currency', currency: 'EUR' }).format(n); }
    catch (e) { return n.toFixed(2).replace('.', ',') + ' €'; }
  }
  function svg(paths, extra) {
    return h('svg', Object.assign({ viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'square', strokeLinejoin: 'miter', 'aria-hidden': 'true' }, extra || {}), paths);
  }

  /* Button */
  function Button(props) {
    var p = props || {};
    var rest = omit(p, ['variant', 'size', 'icon', 'className', 'children']);
    return h('button', Object.assign({ type: 'button' }, rest, {
      className: cx('kv-btn', 'kv-btn-' + (p.variant || 'primary'), p.size && p.size !== 'md' ? 'kv-btn-' + p.size : null, p.className)
    }), p.icon || null, p.children);
  }

  /* Eyebrow */
  function Eyebrow(props) {
    var p = props || {};
    return h('span', { className: cx('kv-eyebrow', p.className) },
      p.index != null ? h('span', { className: 'kv-eyebrow-index' }, p.index) : null,
      h('span', null, p.children));
  }

  /* StatusBadge */
  var STATUS = {
    open: { label: 'Odprto', icon: function () { return svg(h('rect', { x: 4.5, y: 4.5, width: 7, height: 7 })); } },
    reported: { label: 'Čaka potrditev', icon: function () { return svg([h('circle', { key: 'c', cx: 8, cy: 8, r: 5.5 }), h('path', { key: 'p', d: 'M8 5v3.5l2 1.5' })]); } },
    confirmed: { label: 'Poravnano', icon: function () { return svg(h('path', { d: 'M3 8.5l3.2 3.2L13 4.5' })); } },
    overdue: { label: 'Zamuda', icon: function () { return svg([h('path', { key: 't', d: 'M8 2.5l6 11H2z' }), h('path', { key: 'l', d: 'M8 6.5v3.5M8 11.8v.4' })]); } },
    disputed: { label: 'Spor', icon: function () { return svg(h('path', { d: 'M4 4l8 8M12 4l-8 8' })); } }
  };
  function StatusBadge(props) {
    var p = props || {};
    var s = STATUS[p.status] || STATUS.open;
    var key = STATUS[p.status] ? p.status : 'open';
    return h('span', { className: cx('kv-badge', 'kv-badge-' + key, p.className) }, s.icon(), p.children || s.label);
  }

  /* Field */
  var fieldSeq = 0;
  function Field(props) {
    var p = props || {};
    var autoId = React.useState(function () { fieldSeq += 1; return 'kv-field-' + fieldSeq; })[0];
    var id = p.id || autoId;
    var hintId = id + '-hint';
    var message = p.error || p.hint;
    var rest = omit(p, ['label', 'hint', 'error', 'mono', 'id', 'className']);
    return h('div', { className: cx('kv-field', p.error ? 'kv-field-error' : null, p.className) },
      h('label', { className: 'kv-field-label', htmlFor: id }, p.label),
      h('input', Object.assign({}, rest, {
        id: id,
        className: cx('kv-input', p.mono ? 'kv-input-mono' : null),
        'aria-invalid': p.error ? 'true' : undefined,
        'aria-describedby': message ? hintId : undefined
      })),
      message ? h('span', { id: hintId, className: 'kv-field-hint' }, message) : null);
  }

  /* ChargeCard */
  function ChargeCard(props) {
    var p = props || {};
    var late = p.status === 'overdue';
    return h('article', { className: cx('kv-card', 'kv-charge', p.className) },
      h('div', { className: 'kv-charge-head' },
        h(Eyebrow, { index: p.index }, p.kind),
        h(StatusBadge, { status: p.status })),
      h('div', null,
        h('h3', { className: 'kv-charge-title' }, p.title),
        p.meta ? h('p', { className: 'kv-charge-meta' }, p.meta) : null),
      h('div', { className: 'kv-amount' }, eur(p.amountCents)),
      h('div', { className: 'kv-charge-foot' },
        h('span', { className: cx('kv-due', late ? 'kv-due-late' : null) }, p.due ? 'Rok: ' + p.due : ''),
        p.actionLabel ? h(Button, { variant: p.status === 'confirmed' ? 'secondary' : 'primary', onClick: p.onAction }, p.actionLabel) : null));
  }

  /* PaymentPanel — the QR here is a visual SAMPLE, not a valid UPN QR. */
  function SampleQr() {
    var cells = [];
    var n = 25, seed = 7;
    function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
    function finder(x, y, k) {
      return [
        h('rect', { key: k + 'o', x: x, y: y, width: 7, height: 7, fill: '#121212' }),
        h('rect', { key: k + 'w', x: x + 1, y: y + 1, width: 5, height: 5, fill: '#ffffff' }),
        h('rect', { key: k + 'i', x: x + 2, y: y + 2, width: 3, height: 3, fill: '#121212' })
      ];
    }
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        var inFinder = (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9);
        if (!inFinder && rnd() > 0.52) cells.push(h('rect', { key: x + '-' + y, x: x, y: y, width: 1, height: 1, fill: '#121212' }));
      }
    }
    return h('svg', { viewBox: '0 0 25 25', shapeRendering: 'crispEdges', role: 'img', 'aria-label': 'Vzorčna QR koda' },
      cells, finder(0, 0, 'a'), finder(n - 7, 0, 'b'), finder(0, n - 7, 'c'));
  }
  function CopyRow(props) {
    var st = React.useState(false), done = st[0], setDone = st[1];
    function copy() {
      try { if (navigator.clipboard) navigator.clipboard.writeText(String(props.value)); } catch (e) { /* clipboard blocked: still show feedback */ }
      setDone(true);
      setTimeout(function () { setDone(false); }, 1500);
    }
    return h('div', { className: 'kv-pay-row' },
      h('div', null,
        h('span', { className: 'kv-pay-label' }, props.label),
        h('span', { className: 'kv-pay-value' }, props.display || props.value)),
      h(Button, { variant: 'secondary', size: 'sm', onClick: copy, 'aria-label': 'Kopiraj ' + props.label },
        done ? 'Kopirano' : 'Kopiraj'));
  }
  function PaymentPanel(props) {
    var p = props || {};
    return h('section', { className: cx('kv-card', 'kv-pay', p.className), 'aria-label': 'Podatki za plačilo' },
      h('div', { className: 'kv-qr' }, h(SampleQr), p.sample !== false ? h('span', { className: 'kv-qr-tag' }, 'Vzorec') : null),
      h('div', { className: 'kv-pay-rows' },
        h(CopyRow, { label: 'Prejemnik', value: p.recipient }),
        h(CopyRow, { label: 'IBAN', value: (p.iban || '').replace(/\s+/g, ''), display: p.iban }),
        h(CopyRow, { label: 'Znesek', value: ((p.amountCents || 0) / 100).toFixed(2).replace('.', ','), display: eur(p.amountCents) }),
        h(CopyRow, { label: 'Sklic', value: p.reference }),
        h(CopyRow, { label: 'Namen', value: p.purpose })),
      p.hint ? h('p', { className: 'kv-pay-hint' }, p.hint) : null);
  }

  /* SettledBanner */
  function SettledBanner(props) {
    var p = props || {};
    return h('section', { className: cx('kv-settled', 'kv-on-panel', p.className), role: 'status' },
      h('svg', { className: 'kv-settled-mark', viewBox: '0 0 48 48', 'aria-hidden': 'true' },
        h('path', { d: 'M4 0 H34 L48 14 V44 A4 4 0 0 1 44 48 H4 A4 4 0 0 1 0 44 V4 A4 4 0 0 1 4 0 Z', fill: 'var(--signal)' }),
        h('polyline', { points: '12,25 20,33 33,18', fill: 'none', stroke: 'var(--panel)', strokeWidth: 7, strokeLinecap: 'square', strokeLinejoin: 'miter' })),
      h('div', null,
        h(Eyebrow, null, p.period || 'Ta mesec'),
        h('p', { className: 'kv-settled-title' }, 'Kvita ', h('span', null, '✓')),
        h('p', { className: 'kv-settled-text' }, p.children || 'Vse obveznosti so poravnane.')));
  }

  var api = { Button: Button, Eyebrow: Eyebrow, StatusBadge: StatusBadge, Field: Field, ChargeCard: ChargeCard, PaymentPanel: PaymentPanel, SettledBanner: SettledBanner };
  window.Kvita = Object.assign(window.Kvita || {}, api);
})();
