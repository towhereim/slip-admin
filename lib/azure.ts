// Azure Service SAS (blob-scoped) 생성 — Node 20+ 의 Web Crypto(globalThis.crypto)
// 로 HMAC-SHA256 서명한다. @azure/storage-blob SDK 없이 string-to-sign 을 직접
// 구성한다. 모바일 앱의 supabase/functions/_shared/azureSas.ts 를 Node 로 포팅했다.
//
// AZURE_* 환경변수가 하나라도 없으면 generateReadSasUrl 은 null 을 반환한다.
// 호출측(상세 페이지)은 null 이면 placeholder 를 렌더하고 크래시하지 않는다.
import "server-only";

const SIGNED_VERSION = "2022-11-02";

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function hmacSha256Base64(
  keyB64: string,
  message: string,
): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    base64ToBytes(keyB64) as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(message),
  );
  return bytesToBase64(new Uint8Array(sig));
}

// Azure 는 밀리초 없는 ISO-8601 을 원한다. 예: 2026-07-13T12:00:00Z
function isoNoMillis(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

// 경로 세그먼트는 URL 인코딩하되 슬래시는 구분자로 남긴다.
function encodeBlobPathForUrl(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

export interface AzureConfig {
  account: string;
  key: string;
  container: string;
}

// 세 값이 모두 있어야 설정으로 간주. 하나라도 없으면 null.
function readAzureConfig(): AzureConfig | null {
  const account = process.env.AZURE_STORAGE_ACCOUNT;
  const key = process.env.AZURE_STORAGE_KEY;
  const container = process.env.AZURE_BLOB_CONTAINER;
  if (!account || !key || !container) return null;
  return { account, key, container };
}

export function isAzureConfigured(): boolean {
  return readAzureConfig() !== null;
}

/**
 * blobPath 에 대한 짧은 수명의 읽기 전용 SAS URL 을 만든다.
 * AZURE_* 환경변수가 없으면 null 을 반환한다(호출측에서 placeholder 처리).
 */
export async function generateReadSasUrl(
  blobPath: string,
  expiryMinutes = 10,
): Promise<string | null> {
  const cfg = readAzureConfig();
  if (!cfg || !blobPath) return null;

  const { account, key, container } = cfg;

  const now = new Date();
  const start = new Date(now.getTime() - 5 * 60 * 1000); // 5분 clock-skew 여유
  const expiry = new Date(now.getTime() + expiryMinutes * 60 * 1000);

  const signedStart = isoNoMillis(start);
  const signedExpiry = isoNoMillis(expiry);
  const signedProtocol = "https";
  const signedResource = "b"; // blob
  const permissions = "r"; // read

  // canonicalizedResource = /blob/{account}/{container}/{blobName} (raw)
  const canonicalizedResource = `/blob/${account}/${container}/${blobPath}`;

  const stringToSign = [
    permissions,
    signedStart,
    signedExpiry,
    canonicalizedResource,
    "", // signedIdentifier
    "", // signedIP
    signedProtocol,
    SIGNED_VERSION,
    signedResource,
    "", // signedSnapshotTime
    "", // signedEncryptionScope
    "", // rscc
    "", // rscd
    "", // rsce
    "", // rscl
    "", // rsct
  ].join("\n");

  const signature = await hmacSha256Base64(key, stringToSign);

  const qs = new URLSearchParams();
  qs.set("sv", SIGNED_VERSION);
  qs.set("sr", signedResource);
  qs.set("st", signedStart);
  qs.set("se", signedExpiry);
  qs.set("sp", permissions);
  qs.set("spr", signedProtocol);
  qs.set("sig", signature);

  return `https://${account}.blob.core.windows.net/${container}/${encodeBlobPathForUrl(
    blobPath,
  )}?${qs.toString()}`;
}
