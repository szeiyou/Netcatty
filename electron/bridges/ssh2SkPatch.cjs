/**
 * Patch ssh2's Protocol.authPK to support:
 * 1. OpenSSH Security Key (sk-*) signature layouts
 * 2. OpenSSH Certificate authentication with correct signature algorithm
 *
 * ssh2 assumes the SSH "signature" field is always:
 *   string sig_alg, string sig_blob
 *
 * OpenSSH sk-ecdsa/webauthn-sk signatures include extra fields after the
 * inner signature string, e.g.:
 *   string sig_alg, string ecdsa_sig, byte flags, uint32 counter, ...
 *
 * For certificate authentication, the signature algorithm in the signature
 * field must be the BASE key type (e.g., "ssh-ed25519"), not the certificate
 * type (e.g., "ssh-ed25519-cert-v01@openssh.com"). ssh2's original authPK
 * incorrectly uses the certificate type, causing USERAUTH_FAILURE.
 *
 * Without this patch, sshd will reject with "parse packet: invalid format"
 * or signature verification failure.
 */

const Protocol = require("ssh2/lib/protocol/Protocol.js");
const { parseKey } = require("ssh2/lib/protocol/keyParser.js");
const { MESSAGE } = require("ssh2/lib/protocol/constants.js");
const { sendPacket, writeUInt32BE, convertSignature } = require("ssh2/lib/protocol/utils.js");

// Simple logger for debugging
const fs = require("node:fs");
const path = require("node:path");
const logFile = path.join(require("os").tmpdir(), "netcatty-ssh2patch.log");
const log = (msg, data) => {
  const line = `[${new Date().toISOString()}] ${msg} ${data ? JSON.stringify(data) : ""}\n`;
  try { fs.appendFileSync(logFile, line); } catch {}
  console.log("[ssh2Patch]", msg, data || "");
};

const PATCH_GUARD = "__netcattySsh2SkAuthPkPatchApplied";
if (!globalThis[PATCH_GUARD]) {
  globalThis[PATCH_GUARD] = true;

  const originalAuthPK = Protocol.prototype.authPK;

  // Only patch algorithms we intentionally support (OpenSSH PROTOCOL.u2f).
  const SK_SIG_ALGOS = new Set([
    "sk-ecdsa-sha2-nistp256@openssh.com",
    "webauthn-sk-ecdsa-sha2-nistp256@openssh.com",
  ]);

  // Certificate type regex - matches *-cert-v01@openssh.com
  const CERT_TYPE_REGEX = /-cert-v0[01]@openssh\.com$/i;

  // Convert certificate type to base key type for signature algorithm
  // e.g., "ssh-ed25519-cert-v01@openssh.com" -> "ssh-ed25519"
  function certTypeToBaseType(certType) {
    return certType.replace(CERT_TYPE_REGEX, "");
  }

  Protocol.prototype.authPK = function authPK(username, pubKey, keyAlgo, cbSign) {
    if (this._server) throw new Error("Client-only method called in server mode");

    if (typeof keyAlgo === "function") {
      cbSign = keyAlgo;
      keyAlgo = undefined;
    }

    // Preserve original behavior for the "check" packet
    if (!cbSign) return originalAuthPK.call(this, username, pubKey, keyAlgo);

    const parsedKey = parseKey(pubKey);
    if (parsedKey instanceof Error) throw new Error("Invalid key");

    const keyType = parsedKey.type;
    const pubKeyBlob = parsedKey.getPublicSSH();
    if (!keyAlgo) keyAlgo = keyType;

    const isCertificate = CERT_TYPE_REGEX.test(keyAlgo);
    const isSkAlgo = SK_SIG_ALGOS.has(keyAlgo);

    log("authPK called", {
      keyAlgo,
      keyType,
      isCertificate,
      isSkAlgo,
    });

    // Use original implementation for non-SK, non-certificate algorithms
    if (!isSkAlgo && !isCertificate) {
      return originalAuthPK.call(this, username, parsedKey, keyAlgo, cbSign);
    }

    // For certificates, the signature algorithm must be the base key type
    const sigAlgo = isCertificate ? certTypeToBaseType(keyAlgo) : keyAlgo;
    const sigAlgoLen = Buffer.byteLength(sigAlgo);

    const userLen = Buffer.byteLength(username);
    const algoLen = Buffer.byteLength(keyAlgo);
    const pubKeyLen = pubKeyBlob.length;
    const sessionID = this._kex.sessionID;
    const sesLen = sessionID.length;

    // Data to be signed = string(sessionID) || USERAUTH_REQUEST fields (up to pubkey).
    const signData = Buffer.allocUnsafe(
      4 + sesLen
        + 1 + 4 + userLen
        + 4 + 14
        + 4 + 9
        + 1
        + 4 + algoLen
        + 4 + pubKeyLen
    );

    let p = 0;
    writeUInt32BE(signData, sesLen, p);
    signData.set(sessionID, p += 4);
    p += sesLen;

    signData[p] = MESSAGE.USERAUTH_REQUEST;

    writeUInt32BE(signData, userLen, ++p);
    signData.utf8Write(username, p += 4, userLen);

    writeUInt32BE(signData, 14, p += userLen);
    signData.utf8Write("ssh-connection", p += 4, 14);

    writeUInt32BE(signData, 9, p += 14);
    signData.utf8Write("publickey", p += 4, 9);

    signData[p += 9] = 1;

    writeUInt32BE(signData, algoLen, ++p);
    signData.utf8Write(keyAlgo, p += 4, algoLen);

    writeUInt32BE(signData, pubKeyLen, p += algoLen);
    signData.set(pubKeyBlob, p += 4);

    cbSign(signData, (signatureTail) => {
      // For OpenSSH SK signature algorithms, the signature field payload is:
      //   string sig_alg || <tail>
      // where <tail> begins with string(ecdsa_signature) and includes extra fields
      // (flags/counter/origin/clientData/extensions).
      //
      // For certificate authentication:
      //   string sig_alg (BASE key type, not cert type) || string sig_blob
      if (!Buffer.isBuffer(signatureTail)) signatureTail = Buffer.from(signatureTail);

      let sigBlob = signatureTail;
      
      // For certificate (non-SK) types, we need to convert the signature format
      // and use the base key type's signature format
      if (isCertificate && !isSkAlgo) {
        // Convert signature for ECDSA/DSS types
        const baseType = sigAlgo;
        if (baseType === "ssh-dss" || /^ecdsa-sha2-nistp\d+$/i.test(baseType)) {
          const converted = convertSignature(signatureTail, baseType);
          if (converted) sigBlob = converted;
        }
      }

      const sigBlobLen = sigBlob.length;
      // For SK algorithms, signatureTail contains the full signature tail (ecdsa_sig + flags + counter + ...)
      // For certificates, sigBlob is just the signature bytes
      const sigPayloadLen = isSkAlgo 
        ? 4 + sigAlgoLen + sigBlobLen  // SK: string(sig_alg) || tail
        : 4 + sigAlgoLen + 4 + sigBlobLen;  // Cert: string(sig_alg) || string(sig_blob)

      const payloadLen =
        1 + 4 + userLen
          + 4 + 14
          + 4 + 9
          + 1
          + 4 + algoLen
          + 4 + pubKeyLen
          + 4 + sigPayloadLen;

      p = this._packetRW.write.allocStart;
      const packet = this._packetRW.write.alloc(payloadLen);

      packet[p] = MESSAGE.USERAUTH_REQUEST;

      writeUInt32BE(packet, userLen, ++p);
      packet.utf8Write(username, p += 4, userLen);

      writeUInt32BE(packet, 14, p += userLen);
      packet.utf8Write("ssh-connection", p += 4, 14);

      writeUInt32BE(packet, 9, p += 14);
      packet.utf8Write("publickey", p += 4, 9);

      packet[p += 9] = 1;

      writeUInt32BE(packet, algoLen, ++p);
      packet.utf8Write(keyAlgo, p += 4, algoLen);

      writeUInt32BE(packet, pubKeyLen, p += algoLen);
      packet.set(pubKeyBlob, p += 4);

      // signature: string(sig_payload)
      writeUInt32BE(packet, sigPayloadLen, p += pubKeyLen);

      // sig_payload: string(sig_alg) || signature data
      // Use sigAlgo (base type for certs) instead of keyAlgo (cert type)
      log("Building signature field", {
        keyAlgo,
        sigAlgo,
        sigAlgoLen,
        sigBlobLen,
        isSkAlgo,
        isCertificate,
      });

      writeUInt32BE(packet, sigAlgoLen, p += 4);
      packet.utf8Write(sigAlgo, p += 4, sigAlgoLen);
      
      if (isSkAlgo) {
        // SK: signature tail directly follows sig_alg
        packet.set(sigBlob, p += sigAlgoLen);
      } else {
        // Standard/Cert: string(sig_blob) - length-prefixed signature bytes
        writeUInt32BE(packet, sigBlobLen, p += sigAlgoLen);
        packet.set(sigBlob, p += 4);
      }

      this._authsQueue.push("publickey");
      this._debug && this._debug("Outbound: Sending USERAUTH_REQUEST (publickey)");
      sendPacket(this, this._packetRW.write.finalize(packet));
    });
  };
}

