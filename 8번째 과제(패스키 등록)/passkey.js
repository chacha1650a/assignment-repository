/* ============================================================
   8번째 과제 — 비공개 서랍을 패스키로 여는 화면 쪽 코드.
   1번째 과제의 script.js 는 한 줄도 고치지 않았고, 이 파일만 새로 붙였습니다.

   흐름은 네 개입니다.
     등록      : POST /api/passkey/register/options  → navigator.credentials.create() → POST /api/passkey/register/verify
     로그인    : POST /api/passkey/login/options     → navigator.credentials.get()    → POST /api/passkey/login/verify
     로그아웃  : POST /api/auth/logout
     자료 조회 : GET  /api/private/items            (Authorization: Bearer …)

   이 파일에는 비밀번호를 입력받는 자리가 없습니다. 만들 일도 없습니다.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- 서버 주소 ---------------- */
  // 로컬에서 열었으면 로컬 서버를, 그 밖에는 배포한 서버를 부릅니다.
  var LOCAL_HOSTS = ['localhost', '127.0.0.1'];
  var API_BASE = LOCAL_HOSTS.indexOf(location.hostname) >= 0
    ? 'http://localhost:3200'
    : 'https://daehoon-passkey-backend.onrender.com';

  /* ---------------- base64url ↔ ArrayBuffer ----------------
     WebAuthn 은 값을 ArrayBuffer 로 주고받고, JSON 으로는 그것을 실어 보낼 수 없어서
     base64url 문자열로 바꿔 주고받습니다. 서버도 같은 표기를 씁니다. */
  function b64uToBuf(value) {
    var padded = value.replace(/-/g, '+').replace(/_/g, '/');
    while (padded.length % 4) padded += '=';
    var binary = atob(padded);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  function bufToB64u(buffer) {
    var bytes = new Uint8Array(buffer);
    var binary = '';
    for (var i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /** 브라우저가 돌려준 credential 을 JSON 으로 보낼 수 있는 모양으로 바꿉니다. */
  function credentialToJSON(cred) {
    var out = {
      id: cred.id,
      rawId: bufToB64u(cred.rawId),
      type: cred.type,
      clientExtensionResults: cred.getClientExtensionResults ? cred.getClientExtensionResults() : {},
      authenticatorAttachment: cred.authenticatorAttachment || null,
      response: {}
    };
    var r = cred.response;
    out.response.clientDataJSON = bufToB64u(r.clientDataJSON);
    if (r.attestationObject) {
      // 등록 응답
      out.response.attestationObject = bufToB64u(r.attestationObject);
      out.response.transports = r.getTransports ? r.getTransports() : [];
    } else {
      // 로그인 응답
      out.response.authenticatorData = bufToB64u(r.authenticatorData);
      out.response.signature = bufToB64u(r.signature);
      out.response.userHandle = r.userHandle ? bufToB64u(r.userHandle) : null;
    }
    return out;
  }

  /* ---------------- 세션 토큰 ----------------
     로그인 뒤 사람을 알아보는 것은 '서버에 저장된 세션 토큰' 입니다.
     화면에서는 sessionStorage 에 둡니다 — 탭을 닫으면 사라지고, 다른 사이트는 읽을 수 없습니다.
     서버에는 이 토큰의 원문이 아니라 HMAC 값만 저장돼 있습니다. */
  var TOKEN_KEY = 'passkey-vault-token';
  function getToken() {
    try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }
  function setToken(value) {
    try {
      if (value) sessionStorage.setItem(TOKEN_KEY, value);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch (e) { /* 저장을 막아 둔 브라우저라면 이번 화면에서만 유지됩니다 */ }
  }

  /* ---------------- 서버 부르기 ---------------- */
  function api(method, path, body) {
    var headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    var token = getToken();
    if (token) headers.Authorization = 'Bearer ' + token;

    return fetch(API_BASE + path, {
      method: method,
      headers: headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    }).then(function (res) {
      return res.text().then(function (text) {
        var data;
        try { data = JSON.parse(text); } catch (e) { data = { message: text }; }
        return { status: res.status, ok: res.ok, data: data };
      });
    });
  }

  /* ---------------- 화면 조각 ---------------- */
  var $ = function (id) { return document.getElementById(id); };
  var gate = $('vault-gate');
  var open = $('vault-open');
  if (!gate || !open) return; // 이 페이지가 아니면 아무것도 하지 않습니다.

  var handleInput = $('handle-input');
  var gateStatus = $('gate-status');
  var gateMessage = $('gate-message');
  var gateChallenge = $('gate-challenge');
  var vaultMessage = $('vault-message');

  function say(el, text, kind) {
    el.textContent = text || '';
    el.className = el.id === 'gate-message' ? 'gate-message' : 'vault-message';
    if (text && kind) el.className += ' msg-' + kind;
  }

  function busy(on) {
    var buttons = document.querySelectorAll('.vault .btn');
    for (var i = 0; i < buttons.length; i += 1) buttons[i].disabled = !!on;
  }

  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function formatDate(iso) {
    if (!iso) return '아직 쓴 적 없음';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0') + ' ' +
      String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function showChallenge(label, challenge) {
    if (!gateChallenge) return;
    gateChallenge.textContent = '방금 서버가 만든 ' + label + ' 질문: ' + challenge.slice(0, 24) + '… (매번 다른 값입니다)';
  }

  /* ---------------- 잠김 / 열림 전환 ---------------- */
  function showLocked() {
    gate.hidden = false;
    open.hidden = true;
  }

  function showOpen(handle) {
    gate.hidden = true;
    open.hidden = false;
    $('who-handle').textContent = handle;
  }

  /* ---------------- 목록 그리기 ---------------- */
  function renderItems(payload) {
    var list = $('item-list');
    $('item-count').textContent = payload.count + '건';
    if (!payload.items.length) {
      list.innerHTML = '<li class="list-empty">아직 넣어 둔 항목이 없습니다.</li>';
      return;
    }
    list.innerHTML = payload.items.map(function (item) {
      return '<li class="item-card">' +
        '<div class="item-card-top">' +
          '<h4>' + escapeHtml(item.title) + '</h4>' +
          '<span class="item-category">' + escapeHtml(item.category) + '</span>' +
        '</div>' +
        (item.body ? '<p>' + escapeHtml(item.body) + '</p>' : '') +
        '<p class="passkey-meta">' + escapeHtml(formatDate(item.created_at)) +
          ' · <button type="button" class="link-danger" data-delete-item="' + item.id + '">지우기</button></p>' +
      '</li>';
    }).join('');
  }

  function renderPasskeys(payload) {
    var list = $('passkey-list');
    $('passkey-count').textContent = payload.count + '개';
    list.innerHTML = payload.passkeys.map(function (pk) {
      var canDelete = payload.count > 1;
      return '<li class="passkey-card">' +
        '<div class="passkey-card-top">' +
          '<h4>' + escapeHtml(pk.nickname) + '</h4>' +
          (canDelete
            ? '<button type="button" class="link-danger" data-delete-passkey="' + escapeHtml(pk.credentialId) + '">지우기</button>'
            : '<span class="item-category">마지막 하나</span>') +
        '</div>' +
        '<p class="passkey-meta">' +
          '<span>등록: ' + escapeHtml(formatDate(pk.createdAt)) + '</span>' +
          '<span>마지막 사용: ' + escapeHtml(formatDate(pk.lastUsedAt)) + '</span>' +
          '<span>저장된 곳: ' + escapeHtml(pk.backedUp ? '기기 밖 동기화됨 (예: 구글 비밀번호 관리자·iCloud 키체인)' : '이 기기 안') + '</span>' +
          '<span>공개키 식별자: <code>' + escapeHtml(pk.credentialIdPreview) + '</code></span>' +
        '</p>' +
      '</li>';
    }).join('');
  }

  function refresh() {
    return Promise.all([
      api('GET', '/api/private/items'),
      api('GET', '/api/passkeys')
    ]).then(function (results) {
      var items = results[0];
      var keys = results[1];
      if (items.status === 401 || keys.status === 401) {
        setToken('');
        showLocked();
        say(gateMessage, '로그인이 끝났습니다. 다시 들어와 주세요.', 'info');
        return;
      }
      renderItems(items.data);
      renderPasskeys(keys.data);
    });
  }

  /* ---------------- 브라우저가 패스키를 쓸 수 있는가 ---------------- */
  function assertSupported() {
    if (!window.PublicKeyCredential || !navigator.credentials) {
      throw new Error('이 브라우저는 패스키를 지원하지 않습니다. 크롬·엣지·사파리 최신 버전에서 열어 주세요.');
    }
    if (location.protocol !== 'https:' && LOCAL_HOSTS.indexOf(location.hostname) < 0) {
      throw new Error('패스키는 https 주소에서만 동작합니다. (개발 중에는 localhost 만 예외입니다)');
    }
  }

  /** 사용자가 창을 닫았거나 기기가 거절했을 때의 안내를 한 자리에서 만듭니다. */
  function describeWebAuthnError(err) {
    if (err.name === 'NotAllowedError') {
      return '취소했거나 시간이 지났습니다. 서버에는 아무것도 저장되지 않았습니다.';
    }
    if (err.name === 'InvalidStateError') {
      return '이 기기에는 이 계정의 패스키가 이미 있습니다. 다른 기기나 다른 브라우저에서 등록해 주세요.';
    }
    if (err.name === 'SecurityError') {
      return '주소(도메인)와 서버에 설정된 RP ID 가 맞지 않습니다.';
    }
    return err.message || '패스키 창을 여는 중 문제가 생겼습니다.';
  }

  /* ---------------- ① 등록 ---------------- */
  function registerPasskey(options) {
    options = options || {};
    var adding = !!options.adding; // 이미 들어와 있는 계정에 하나 더 붙이는 경우
    var messageBox = adding ? vaultMessage : gateMessage;
    var handle = adding ? $('who-handle').textContent : handleInput.value.trim();

    try {
      assertSupported();
    } catch (err) {
      say(messageBox, err.message, 'error');
      return;
    }
    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(handle)) {
      say(messageBox, '계정 이름을 영문·숫자·. _ - 으로 3~32자로 적어 주세요.', 'error');
      handleInput.focus();
      return;
    }

    busy(true);
    say(messageBox, '서버에서 일회용 질문을 받는 중…', 'info');

    api('POST', '/api/passkey/register/options', { handle: handle })
      .then(function (res) {
        if (!res.ok) throw new Error(res.data.message || '질문을 받지 못했습니다.');
        showChallenge('등록용', res.data.options.challenge);
        say(messageBox, '기기에서 확인해 주세요. (지문·얼굴·PIN)', 'info');

        var pk = res.data.options;
        return navigator.credentials.create({
          publicKey: {
            challenge: b64uToBuf(pk.challenge),
            rp: pk.rp,
            user: {
              id: b64uToBuf(pk.user.id),
              name: pk.user.name,
              displayName: pk.user.displayName
            },
            pubKeyCredParams: pk.pubKeyCredParams,
            timeout: pk.timeout,
            attestation: pk.attestation,
            authenticatorSelection: pk.authenticatorSelection,
            // 이미 등록된 패스키를 알려 주면, 같은 기기에 두 번 등록되는 것을 브라우저가 막아 줍니다.
            excludeCredentials: (pk.excludeCredentials || []).map(function (c) {
              return { id: b64uToBuf(c.id), type: 'public-key', transports: c.transports };
            })
          }
        }).catch(function (err) {
          throw new Error(describeWebAuthnError(err));
        });
      })
      .then(function (cred) {
        var nickname = window.prompt(
          '이 패스키에 붙일 이름을 적어 주세요.\n(예: 회사 노트북, 개인 휴대폰, 보안 키)',
          adding ? '두 번째 기기' : '첫 기기'
        );
        if (nickname === null) {
          // 이름 짓기에서 취소해도 서버에는 아직 아무것도 보내지 않았습니다.
          throw new Error('등록을 취소했습니다. 서버에는 아무것도 저장되지 않았습니다.');
        }
        return api('POST', '/api/passkey/register/verify', {
          handle: handle,
          nickname: nickname,
          response: credentialToJSON(cred)
        });
      })
      .then(function (res) {
        if (!res.ok) throw new Error(res.data.message || '등록을 확인하지 못했습니다.');
        say(messageBox,
          '패스키 "' + res.data.passkey.nickname + '" 를 등록했습니다. ' +
          '서버에 저장된 것은 공개키(' + res.data.passkey.publicKeyPreview + ')이고, 개인키는 기기 안에 남아 있습니다.',
          'ok');
        if (adding) return refresh();
        gateStatus.textContent = '등록이 끝났습니다. 이제 "패스키로 들어가기"를 눌러 주세요.';
        return null;
      })
      .catch(function (err) {
        say(messageBox, err.message, 'error');
      })
      .then(function () { busy(false); });
  }

  /* ---------------- ② 로그인 ---------------- */
  function loginWithPasskey() {
    var handle = handleInput.value.trim();
    try {
      assertSupported();
    } catch (err) {
      say(gateMessage, err.message, 'error');
      return;
    }

    busy(true);
    say(gateMessage, '서버에서 새 질문을 받는 중…', 'info');

    api('POST', '/api/passkey/login/options', { handle: handle })
      .then(function (res) {
        if (!res.ok) throw new Error(res.data.message || '질문을 받지 못했습니다.');
        showChallenge('로그인용', res.data.options.challenge);
        say(gateMessage, '기기에서 확인해 주세요. (지문·얼굴·PIN)', 'info');

        var pk = res.data.options;
        return navigator.credentials.get({
          publicKey: {
            challenge: b64uToBuf(pk.challenge),
            rpId: pk.rpId,
            timeout: pk.timeout,
            userVerification: pk.userVerification,
            allowCredentials: (pk.allowCredentials || []).map(function (c) {
              return { id: b64uToBuf(c.id), type: 'public-key', transports: c.transports };
            })
          }
        }).catch(function (err) {
          throw new Error(describeWebAuthnError(err));
        });
      })
      .then(function (cred) {
        return api('POST', '/api/passkey/login/verify', { response: credentialToJSON(cred) });
      })
      .then(function (res) {
        if (!res.ok) throw new Error(res.data.message || '서명을 확인하지 못했습니다.');
        setToken(res.data.token);
        say(gateMessage, '', null);
        showOpen(res.data.user.handle);
        say(vaultMessage, '"' + res.data.usedPasskey + '" 로 들어왔습니다.', 'ok');
        return refresh();
      })
      .catch(function (err) {
        say(gateMessage, err.message, 'error');
      })
      .then(function () { busy(false); });
  }

  /* ---------------- ③ 로그아웃 ---------------- */
  function logout() {
    busy(true);
    api('POST', '/api/auth/logout')
      .then(function () {
        setToken('');
        showLocked();
        gateStatus.textContent = '나갔습니다. 다시 들어오려면 패스키가 필요합니다.';
        say(gateMessage, '서버에서도 그 토큰을 끊었습니다. 같은 값으로 다시 요청해도 401 로 거절됩니다.', 'info');
        // 열린 상태에 그려 뒀던 내용은 화면에서도 지웁니다.
        $('item-list').innerHTML = '';
        $('passkey-list').innerHTML = '';
      })
      .then(function () { busy(false); });
  }

  /* ---------------- 버튼 연결 ---------------- */
  $('btn-register').addEventListener('click', function () { registerPasskey(); });
  $('btn-login').addEventListener('click', loginWithPasskey);
  $('btn-logout').addEventListener('click', logout);
  $('btn-add-passkey').addEventListener('click', function () {
    // 같은 비밀번호 관리자에 두 번째를 만들면 첫 번째가 조용히 대체될 수 있어서, 누르기 전에 한 번 짚어 준다.
    // (실제로 그렇게 해서 계정 하나가 잠긴 적이 있다 — 증거/실기기 검증 기록.md 참고)
    var ok = window.confirm(
      '두 번째 패스키는 지금 쓰고 있는 것과 다른 기기나 다른 비밀번호 관리자에 만들어 주세요.\n\n' +
      '같은 관리자에 또 만들면 먼저 만든 패스키를 대체해 버릴 수 있습니다. ' +
      '그러면 목록에는 두 개로 보여도 실제로 쓸 수 있는 것은 하나뿐이라, ' +
      '하나를 지우는 순간 이 계정에 들어올 수 없게 됩니다.\n\n' +
      '계속할까요?'
    );
    if (!ok) return;
    registerPasskey({ adding: true });
  });

  handleInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      loginWithPasskey();
    }
  });

  $('item-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var title = $('item-title').value.trim();
    if (!title) return;
    busy(true);
    api('POST', '/api/private/items', {
      category: $('item-category').value.trim() || '메모',
      title: title,
      body: $('item-body').value.trim()
    }).then(function (res) {
      if (!res.ok) { say(vaultMessage, res.data.message || '추가하지 못했습니다.', 'error'); return null; }
      $('item-title').value = '';
      $('item-body').value = '';
      $('item-category').value = '';
      say(vaultMessage, '항목을 추가했습니다.', 'ok');
      return refresh();
    }).then(function () { busy(false); });
  });

  // 목록 안의 "지우기" 버튼들 (그릴 때마다 다시 붙이지 않으려고 한 자리에서 받습니다)
  open.addEventListener('click', function (event) {
    var target = event.target;
    if (!target || target.tagName !== 'BUTTON') return;

    var itemId = target.getAttribute('data-delete-item');
    if (itemId) {
      busy(true);
      api('DELETE', '/api/private/items/' + itemId).then(function (res) {
        if (!res.ok) say(vaultMessage, res.data.message || '지우지 못했습니다.', 'error');
        return refresh();
      }).then(function () { busy(false); });
      return;
    }

    var credentialId = target.getAttribute('data-delete-passkey');
    if (credentialId) {
      if (!window.confirm('이 패스키를 지울까요?\n지운 패스키로는 더 이상 들어올 수 없습니다.')) return;
      busy(true);
      api('DELETE', '/api/passkeys/' + encodeURIComponent(credentialId)).then(function (res) {
        say(vaultMessage, res.data.message || (res.ok ? '패스키를 지웠습니다.' : '지우지 못했습니다.'), res.ok ? 'ok' : 'error');
        return refresh();
      }).then(function () { busy(false); });
    }
  });

  /* ---------------- 첫 화면 ---------------- */
  // 새로고침해도 세션이 살아 있으면 다시 열어 줍니다. 살아 있는지는 서버가 판단합니다.
  if (getToken()) {
    api('GET', '/api/auth/me').then(function (res) {
      if (res.ok) {
        showOpen(res.data.user.handle);
        return refresh();
      }
      setToken('');
      showLocked();
      return null;
    });
  } else {
    showLocked();
  }

  // 무료 서버는 한동안 아무도 안 쓰면 잠들어서 첫 요청이 느립니다. 미리 깨워 둡니다.
  api('GET', '/api/health').catch(function () { /* 안 되면 그냥 둡니다 */ });
})();
