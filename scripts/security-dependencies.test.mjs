import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

// Resolve through Expo's consumers, not a potentially unrelated root copy.
const mobileRequire = createRequire(new URL("../artifacts/mobile/package.json", import.meta.url));
const expoRequire = createRequire(mobileRequire.resolve("expo/package.json"));
const cliRequire = createRequire(expoRequire.resolve("@expo/cli/package.json"));
const signingRequire = createRequire(cliRequire.resolve("@expo/code-signing-certificates"));
const forge = cliRequire("node-forge");
const { privateKey: privatePem } = generateKeyPairSync("rsa", {
  modulusLength: 1024,
  publicExponent: 3,
  privateKeyEncoding: { type: "pkcs1", format: "pem" },
  publicKeyEncoding: { type: "pkcs1", format: "pem" },
});
const privateKey = forge.pki.privateKeyFromPem(privatePem);
const publicKey = forge.pki.rsa.setPublicKey(privateKey.n, privateKey.e);

function digestInfoSignature({ parameters = true, extra = [] } = {}) {
  const { asn1, md, oids, pki } = forge;
  const digest = md.sha256.create().update("security regression").digest().getBytes();
  const algorithm = [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(oids.sha256).getBytes()),
  ];
  if (parameters) {
    algorithm.push(asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, ""));
  }
  algorithm.push(...extra);
  const info = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, algorithm),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, digest),
  ]);
  // Sign a deliberately controlled DigestInfo, with valid PKCS#1 v1.5 padding.
  const signature = pki.rsa.encrypt(asn1.toDer(info).getBytes(), privateKey, 0x01);
  return { digest, signature };
}

test("all Expo signing consumers use the same patched forge", () => {
  assert.equal(signingRequire.resolve("node-forge"), cliRequire.resolve("node-forge"));
  assert.equal(signingRequire("node-forge"), forge);
  const lock = readFileSync(new URL("../pnpm-lock.yaml", import.meta.url), "utf8");
  assert.match(lock, /node-forge@1\.4\.0:\s+hash: [a-f0-9]+\s+path: patches\/node-forge@1\.4\.0\.patch/);
});

for (const parameters of [true, false]) {
  test(`valid SHA-256 signatures remain accepted (NULL parameters: ${parameters})`, () => {
    const { digest, signature } = digestInfoSignature({ parameters });
    assert.equal(publicKey.verify(digest, signature), true);
    assert.equal(publicKey.verify("incorrect digest", signature), false);
  });
}

for (const type of [forge.asn1.Type.OCTETSTRING, forge.asn1.Type.NULL, forge.asn1.Type.SEQUENCE]) {
  test(`GHSA-86w9-cpqp-85rv: reject extra nested DigestAlgorithm child ${type}`, () => {
    const constructed = type === forge.asn1.Type.SEQUENCE;
    const extra = [forge.asn1.create(forge.asn1.Class.UNIVERSAL, type, constructed, constructed ? [] : "")];
    const { digest, signature } = digestInfoSignature({ extra });
    assert.throws(
      () => publicKey.verify(digest, signature),
      /does not contain a valid RSASSA-PKCS1-v1_5 DigestInfo/,
    );
  });
}

test("regular signing and RSA-PSS remain compatible", () => {
  const digest = forge.md.sha256.create().update("standard signing");
  assert.equal(publicKey.verify(digest.digest().getBytes(), privateKey.sign(digest)), true);
  const pss = forge.pss.create({
    md: forge.md.sha256.create(),
    mgf: forge.mgf.mgf1.create(forge.md.sha256.create()),
    saltLength: 16,
  });
  assert.equal(publicKey.verify(digest.digest().getBytes(), privateKey.sign(digest, pss), pss), true);
});

test("Expo's minimatch consumer retains brace expansion behavior and rejects deep nesting", () => {
  const metroFileMapRequire = createRequire(
    cliRequire.resolve("@expo/metro-file-map/package.json"),
  );
  const micromatchRequire = createRequire(
    metroFileMapRequire.resolve("micromatch/package.json"),
  );
  const minimatch = createRequire(cliRequire.resolve("glob"))("minimatch");
  const braces = micromatchRequire("braces");
  assert.deepEqual(minimatch.braceExpand("file-{a,b}.js"), ["file-a.js", "file-b.js"]);
  assert.equal(minimatch.minimatch("file-a.js", "file-{a,b}.js"), true);
  assert.deepEqual(braces("{a,{b,c}}"), ["(a|(b|c))"]);
  assert.deepEqual(braces.expand("{a,{b,c}}"), ["a", "b", "c"]);
  const deeplyNested = `${"{".repeat(101)}x${"}".repeat(101)}`;
  assert.throws(() => braces(deeplyNested), /exceeds max depth/);
  assert.throws(() => braces.expand(deeplyNested), /exceeds max depth/);
});

test("Orval's AJV consumer retains URI reference resolution", () => {
  const specRequire = createRequire(new URL("../lib/api-spec/package.json", import.meta.url));
  const orvalRequire = createRequire(specRequire.resolve("orval"));
  const parserRequire = createRequire(orvalRequire.resolve("@scalar/openapi-parser"));
  const Ajv = parserRequire("ajv");
  const ajvRequire = createRequire(parserRequire.resolve("ajv"));
  assert.equal(ajvRequire("fast-uri/package.json").version, "3.1.8");
  const ajv = new Ajv();
  ajv.addSchema({ $id: "https://example.com/schemas/value", type: "string" });
  const validate = ajv.compile({
    $id: "https://example.com/schemas/parent",
    $ref: "value",
  });
  assert.equal(validate("valid string"), true);
  assert.equal(validate(123), false);
});
