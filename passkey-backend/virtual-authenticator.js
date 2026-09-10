/**
 * 가상 인증기 — 검증용 "가짜 기기"
 *
 * 실제 패스키는 사람이 지문이나 PIN 을 눌러야 만들어져서, 자동으로 몇십 번 돌려 보며
 * "이미 쓴 질문은 정말 막히나", "남의 패스키로는 정말 안 열리나" 를 기록으로 남기기가 어렵다.
 * 그래서 브라우저·기기가 하는 일(열쇠 한 쌍 만들기 / 질문에 서명하기)을 표준 그대로
 * node:crypto 로 흉내 내는 자리를 따로 뒀다.
 *
 * 중요한 점: 이 파일은 **서버를 도와주지 않는다.** 서버는 이 파일의 존재를 모르고,
 * 진짜 브라우저가 보내는 것과 똑같은 모양의 요청만 받는다. 그래서 여기서 나온
 * 성공·실패 기록이 실제 브라우저에서의 성공·실패와 같은 뜻을 가진다.
 *
 * 개인키는 이 파일 안(=가짜 기기 안)에만 있고, 서버로 보내는 값에는 들어가지 않는다.
 */
const crypto = require('crypto');
const { isoCBOR } = require('@simplewebauthn/server/helpers');

const b64u = (buf) => Buffer.from(buf).toString('base64url');

/** COSE 형식(WebAuthn 이 쓰는 공개키 표기)으로 P-256 공개키를 적는다. */
function coseKeyFrom(publicKeyObject) {
  const jwk = publicKeyObject.export({ format: 'jwk' });
  const x = Buffer.from(jwk.x, 'base64url');
  const y = Buffer.from(jwk.y, 'base64url');
  const map = new Map();
  map.set(1, 2);      // kty: EC2
  map.set(3, -7);     // alg: ES256
  map.set(-1, 1);     // crv: P-256
  map.set(-2, new Uint8Array(x));
  map.set(-3, new Uint8Array(y));
  return Buffer.from(isoCBOR.encode(map));
}

function authenticatorData({ rpId, flags, signCount, attested }) {
  const rpIdHash = crypto.createHash('sha256').update(rpId).digest();
  const flagsBuf = Buffer.from([flags]);
  const counterBuf = Buffer.alloc(4);
  counterBuf.writeUInt32BE(signCount);
  if (!attested) return Buffer.concat([rpIdHash, flagsBuf, counterBuf]);

  const aaguid = Buffer.alloc(16, 0); // 어떤 기기인지 밝히지 않는 값(전부 0)
  const idLen = Buffer.alloc(2);
  idLen.writeUInt16BE(attested.credentialId.length);
  return Buffer.concat([rpIdHash, flagsBuf, counterBuf, aaguid, idLen, attested.credentialId, attested.coseKey]);
}

const FLAG_UP = 0x01; // 사람이 기기를 만졌다
const FLAG_UV = 0x04; // 사람이 지문/PIN 으로 자기 자신을 확인했다
const FLAG_AT = 0x40; // 이 응답에 새 공개키가 들어 있다

class VirtualAuthenticator {
  /**
   * @param {string} label 사람이 읽는 이름 (기록에만 쓴다)
   */
  constructor(label) {
    this.label = label;
    this.signCount = 0;
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    this.publicKey = publicKey;
    /** 이 값은 기기 밖으로 나가지 않는다. 아래 어떤 메서드도 이것을 돌려주지 않는다. */
    this.privateKey = privateKey;
    this.credentialId = crypto.randomBytes(32);
  }

  get credentialIdB64() {
    return b64u(this.credentialId);
  }

  /** 브라우저의 navigator.credentials.create() 자리 — 열쇠 한 쌍을 만들고 공개키만 돌려준다. */
  create({ rpId, origin, challenge }) {
    const clientDataJSON = Buffer.from(JSON.stringify({
      type: 'webauthn.create',
      challenge,
      origin,
      crossOrigin: false
    }), 'utf8');

    const coseKey = coseKeyFrom(this.publicKey);
    const authData = authenticatorData({
      rpId,
      flags: FLAG_UP | FLAG_UV | FLAG_AT,
      signCount: this.signCount,
      attested: { credentialId: this.credentialId, coseKey }
    });

    const attestationObject = Buffer.from(isoCBOR.encode(new Map([
      ['fmt', 'none'],
      ['attStmt', new Map()],
      ['authData', new Uint8Array(authData)]
    ])));

    return {
      id: this.credentialIdB64,
      rawId: this.credentialIdB64,
      type: 'public-key',
      clientExtensionResults: {},
      authenticatorAttachment: 'platform',
      response: {
        clientDataJSON: b64u(clientDataJSON),
        attestationObject: b64u(attestationObject),
        transports: ['internal', 'hybrid']
      }
    };
  }

  /**
   * 브라우저의 navigator.credentials.get() 자리 — 질문에 개인키로 서명해 답한다.
   * @param {object} opts
   * @param {crypto.KeyObject} [opts.signWith] 일부러 다른 키로 서명해 보고 싶을 때 (실패 기록용)
   */
  get({ rpId, origin, challenge, userHandle, signWith }) {
    this.signCount += 1;

    const clientDataJSON = Buffer.from(JSON.stringify({
      type: 'webauthn.get',
      challenge,
      origin,
      crossOrigin: false
    }), 'utf8');

    const authData = authenticatorData({
      rpId,
      flags: FLAG_UP | FLAG_UV,
      signCount: this.signCount,
      attested: null
    });

    const clientDataHash = crypto.createHash('sha256').update(clientDataJSON).digest();
    const signature = crypto.sign('sha256', Buffer.concat([authData, clientDataHash]), signWith || this.privateKey);

    return {
      id: this.credentialIdB64,
      rawId: this.credentialIdB64,
      type: 'public-key',
      clientExtensionResults: {},
      authenticatorAttachment: 'platform',
      response: {
        clientDataJSON: b64u(clientDataJSON),
        authenticatorData: b64u(authData),
        signature: b64u(signature),
        userHandle: userHandle || null
      }
    };
  }
}

module.exports = { VirtualAuthenticator, b64u };
