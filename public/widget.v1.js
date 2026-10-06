(function () {
    'use strict';
    var script = document.currentScript;
    var host = script && script.parentElement;
    if (!host) { return; }
    var src = script.src;
    var api = new URL(src).origin;
    var publicId = new URL(src).searchParams.get('id');
    if (!publicId) { return; }

    var root = document.createElement('div');
    root.className = 'flyrank-widget';
    root.setAttribute('data-public-id', publicId);
    host.appendChild(root);

    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
        });
    }

    function injectStyles() {
        if (document.getElementById('flyrank-widget-styles')) { return; }
        var css = [
            '.flyrank-widget{box-sizing:border-box;width:100%;max-width:360px;margin:0;padding:24px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 10px 24px rgba(15,23,42,.08);color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;}',
            '.flyrank-widget *,.flyrank-widget *::before,.flyrank-widget *::after{box-sizing:inherit;}',
            '.flyrank-title{margin:0 0 16px;font-size:18px;font-weight:600;line-height:1.3;}',
            '.flyrank-form{display:flex;flex-direction:column;gap:14px;margin:0;}',
            '.flyrank-field{display:flex;flex-direction:column;gap:6px;margin:0;}',
            '.flyrank-label{font-size:13px;font-weight:500;color:#334155;}',
            '.flyrank-input{width:100%;margin:0;padding:10px 12px;font:inherit;color:#0f172a;background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;outline:none;transition:border-color .15s ease,box-shadow .15s ease;}',
            '.flyrank-input:focus{border-color:#6366f1;background:#ffffff;box-shadow:0 0 0 3px rgba(99,102,241,.18);}',
            '.flyrank-submit{display:block;width:100%;margin:4px 0 0;padding:10px 16px;font:inherit;font-weight:600;color:#ffffff;background:#4f46e5;border:none;border-radius:8px;cursor:pointer;transition:background .15s ease;}',
            '.flyrank-submit:hover{background:#4338ca;}',
            '.flyrank-submit:active{background:#3730a3;}',
            '.flyrank-status{margin:12px 0 0;min-height:1.2em;font-size:13px;color:#334155;}'
        ].join('\n');
        var style = document.createElement('style');
        style.id = 'flyrank-widget-styles';
        style.textContent = css;
        document.head.appendChild(style);
    }

    function render(config) {
        injectStyles();
        var widgetId = config.id;
        var html = '';
        if (config.title) { html += '<h3 class="flyrank-title">' + escapeHtml(config.title) + '</h3>'; }
        html += '<form class="flyrank-form">';
        (config.fields || []).forEach(function (field, index) {
            var inputId = 'flyrank-input-' + index;
            html += '<div class="flyrank-field">';
            html += '<label class="flyrank-label" for="' + inputId + '">' + escapeHtml(field.label || '') + '</label>';
            html += '<input class="flyrank-input" id="' + inputId + '" type="' + escapeHtml(field.type || 'text') + '" name="' + escapeHtml(field.name) + '"';
            if (field.required) { html += ' required'; }
            if (field.placeholder) { html += ' placeholder="' + escapeHtml(field.placeholder) + '"'; }
            html += '></div>';
        });
        html += '<input type="text" name="__hp" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;">';
        html += '<button type="submit" class="flyrank-submit">' + escapeHtml(config.buttonText || 'Submit') + '</button>';
        html += '</form>';
        html += '<p class="flyrank-status" aria-live="polite"></p>';
        root.innerHTML = html;

        var form = root.querySelector('form');
        var status = root.querySelector('.flyrank-status');

        form.addEventListener('submit', function (event) {
            event.preventDefault();
            var payload = {};
            (config.fields || []).forEach(function (field) {
                var input = form.elements[field.name];
                payload[field.name] = input ? input.value : '';
            });
            var hp = form.elements['__hp'];
            var idempotencyKey = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : '';
            var body = {
                widgetId: widgetId,
                idempotencyKey: idempotencyKey,
                honeypot: hp ? hp.value : '',
                payload: payload
            };
            status.textContent = 'Submitting…';
            fetch(api + '/api/v1/public/submissions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            }).then(function (res) {
                if (!res.ok) { throw new Error('HTTP ' + res.status); }
                return res.json();
            }).then(function () {
                status.textContent = 'Thank you!';
                form.reset();
            }).catch(function () {
                status.textContent = 'Something went wrong. Please try again.';
            });
        });
    }

    fetch(api + '/api/v1/public/widgets/' + encodeURIComponent(publicId) + '/config')
        .then(function (res) {
            if (!res.ok) { throw new Error('widget not found'); }
            return res.json();
        })
        .then(render)
        .catch(function () {
            if (root.parentNode) { root.parentNode.removeChild(root); }
        });
})();
