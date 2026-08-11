import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { open, lstat, readFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFile = promisify(execFileCallback);
const scriptPath = fileURLToPath(import.meta.url);
export const repositoryRoot = resolve(dirname(scriptPath), "..");
export const maximumTextFileBytes = 2_000_000;

const maximumGitOutputBytes = 32 * 1024 * 1024;
const maximumReportedFindings = 200;
const knownBinaryExtensions = new Set([
  ".7z",
  ".avif",
  ".br",
  ".eot",
  ".gif",
  ".gz",
  ".ico",
  ".jpeg",
  ".jpg",
  ".mov",
  ".mp3",
  ".mp4",
  ".ogg",
  ".otf",
  ".pdf",
  ".png",
  ".tar",
  ".tgz",
  ".ttf",
  ".wasm",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
  ".zip"
]);

const exactSafeLiterals = new Set([
  "change-me",
  "dummy",
  "example",
  "fixture",
  "not-a-secret",
  "placeholder",
  "redacted"
]);
const exactSafeUrlPasswords = new Set(["password", "placeholder", "redacted", "secret"]);
const fixtureAnnotationPattern = /proofera-secret-fixture-sha256=([a-f0-9]{64})/;
const fixtureAnnotationPath = "packages/integrations/src/8004scan.test.ts";
const sensitiveIdentifierFragments = [
  "accesstoken",
  "apikey",
  "authtoken",
  "clientsecret",
  "databaseurl",
  "keystorepassword",
  "mnemonic",
  "privatekey",
  "rpcurl",
  "seedphrase",
  "sessionsecret",
  "sessionsigner",
  "signerkey",
  "signerprivate",
  "walletpassword"
];

const publicPrefix = ["NEXT", "PUBLIC"].join("_") + "_";
const publicSensitiveSuffixes = [
  "API_KEY",
  "CREDENTIAL",
  "MNEMONIC",
  "PASSWORD",
  "PRIVATE_KEY",
  "RPC_URL",
  "SECRET",
  "SEED",
  "SESSION_SIGNER",
  "SIGNER",
  "TOKEN"
];
const publicSecretVariablePattern = new RegExp(
  `\\b${publicPrefix}[A-Z0-9_]*(?:${publicSensitiveSuffixes.join("|")})[A-Z0-9_]*\\b`,
  "g"
);
const privateKeyHeaderPattern =
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g;
const structuredCredentialPatterns = [
  /\bsk-(?:proj|svcacct)-[A-Za-z0-9_-]{20,}\b/g,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  /\bAIza[0-9A-Za-z_-]{35}\b/g,
  /\b(?:sk|rk)_live_[0-9A-Za-z]{16,}\b/g,
  /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/g,
  /\bnpm_[0-9A-Za-z]{20,}\b/g,
  /\bvercel_blob_rw_[0-9A-Za-z_-]{20,}\b/g
];
const literalAssignmentPattern =
  /["']?([A-Za-z_$][A-Za-z0-9_$.-]{1,100})["']?(?:\s*:\s*[A-Za-z_$][A-Za-z0-9_$<>,.[\]| ]{0,120})?\s*[:=]\s*(["'`])([^"'`\r\n]{1,4096})\2/g;
const unquotedAssignmentPattern = /^[\t ]*([A-Z][A-Z0-9_]*)[\t ]*=[\t ]*([^\s#][^#\r\n]*)$/gm;
const credentialUrlPattern =
  /\b(?:https?|postgres(?:ql)?|mysql|redis):\/\/[^\s/:@]+:[^\s/@]+@[^\s]+/gi;

function compareStrings(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function normalizeRepositoryPath(path) {
  return path.startsWith("./") ? path.slice(2) : path;
}

function splitNullDelimited(output) {
  if (output.includes("\uFFFD")) {
    throw new Error("Git returned a repository path that is not valid UTF-8");
  }
  return output
    .split("\0")
    .filter((path) => path.length > 0)
    .map(normalizeRepositoryPath);
}

function isEnvironmentExample(path) {
  return normalizeRepositoryPath(path).toLowerCase() === ".env.example";
}

export function isForbiddenSecretPath(repositoryPath) {
  const path = normalizeRepositoryPath(repositoryPath);
  const segments = path.toLowerCase().split("/");
  const basename = segments.at(-1) ?? "";
  if (segments.includes(".studio") || segments.includes("wallets")) return true;
  if (basename.startsWith(".env") && !isEnvironmentExample(path)) return true;
  if (basename.endsWith(".pem") || basename.endsWith(".key")) return true;
  return basename.includes("keystore");
}

function isWithinWorkspace(workspace, absolutePath) {
  const local = relative(workspace, absolutePath);
  return local === "" || (!local.startsWith(`..${sep}`) && local !== ".." && !isAbsolute(local));
}

async function gitFileList(workspace, args, gitBinary) {
  const { stdout } = await execFile(gitBinary, ["-C", workspace, "ls-files", ...args, "-z"], {
    encoding: "utf8",
    maxBuffer: maximumGitOutputBytes,
    windowsHide: true
  });
  return splitNullDelimited(stdout);
}

async function enumerateGitCandidates(workspace, gitBinary) {
  const [trackedPaths, untrackedPaths] = await Promise.all([
    gitFileList(workspace, ["--cached"], gitBinary),
    gitFileList(workspace, ["--others", "--exclude-standard"], gitBinary)
  ]);
  const tracked = new Set(trackedPaths);
  const allPaths = [...new Set([...trackedPaths, ...untrackedPaths])].sort(compareStrings);
  return allPaths.map((path) => ({ path, tracked: tracked.has(path) }));
}

async function enumerateFallbackCandidates(workspace) {
  // Without Git there is no trustworthy way to distinguish ignored local key
  // material from publishable candidates. Fail closed without walking or
  // opening any workspace file; the caller records git-unavailable-fallback.
  void workspace;
  return [];
}

function isMissingCommand(error) {
  return typeof error === "object" && error !== null && error.code === "ENOENT";
}

async function enumerateCandidates(workspace, gitBinary) {
  try {
    return { candidates: await enumerateGitCandidates(workspace, gitBinary), source: "git" };
  } catch (error) {
    if (!isMissingCommand(error)) throw error;
    return { candidates: await enumerateFallbackCandidates(workspace), source: "fallback" };
  }
}

function lineNumber(content, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (content.charCodeAt(index) === 10) line += 1;
  }
  return line;
}

function normalizedIdentifier(identifier) {
  return identifier.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

function isSensitiveIdentifier(identifier) {
  const normalized = normalizedIdentifier(identifier);
  return sensitiveIdentifierFragments.some((fragment) => normalized.includes(fragment));
}

function isSafeLiteral(value) {
  const trimmed = value.trim();
  if (exactSafeLiterals.has(trimmed.toLowerCase())) return true;
  if (/^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/.test(trimmed)) return true;
  try {
    const url = new URL(trimmed);
    return (
      url.username === "" &&
      url.password === "" &&
      (url.hostname === "localhost" ||
        url.hostname === "127.0.0.1" ||
        url.hostname.endsWith(".example") ||
        url.hostname.endsWith(".invalid"))
    );
  } catch {
    return false;
  }
}

function isCredentialFreeRootRpcUrl(identifier, value) {
  if (!normalizedIdentifier(identifier).includes("rpcurl")) return false;
  try {
    const url = new URL(value.trim());
    const pathSegments = url.pathname.split("/").filter((segment) => segment.length > 0);
    const pathContainsCredentialLikeSegment = pathSegments.some(
      (segment) =>
        segment.length >= 24 &&
        (/^[a-f0-9]+$/i.test(segment) ||
          (/^[A-Za-z0-9_-]+$/.test(segment) && /[A-Za-z]/.test(segment) && /[0-9]/.test(segment)))
    );
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === "" &&
      !pathContainsCredentialLikeSegment
    );
  } catch {
    return false;
  }
}

function hasExactFixtureAnnotation(path, content, offset, value) {
  if (path !== fixtureAnnotationPath) return false;
  const lineStart = content.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
  const previousLineEnd = Math.max(0, lineStart - 1);
  const previousLineStart = content.lastIndexOf("\n", Math.max(0, previousLineEnd - 1)) + 1;
  const secondPreviousLineEnd = Math.max(0, previousLineStart - 1);
  const secondPreviousLineStart =
    content.lastIndexOf("\n", Math.max(0, secondPreviousLineEnd - 1)) + 1;
  const currentLineEnd = content.indexOf("\n", offset);
  const annotationArea = content.slice(
    secondPreviousLineStart,
    currentLineEnd === -1 ? content.length : currentLineEnd
  );
  const expectedDigest = fixtureAnnotationPattern.exec(annotationArea)?.[1];
  if (expectedDigest === undefined) return false;
  return createHash("sha256").update(value).digest("hex") === expectedDigest;
}

function isSafeCredentialUrl(value) {
  try {
    const url = new URL(value);
    return exactSafeUrlPasswords.has(decodeURIComponent(url.password).toLowerCase());
  } catch {
    return false;
  }
}

function inspectContent(path, content, environmentExample, addFinding) {
  publicSecretVariablePattern.lastIndex = 0;
  for (const match of content.matchAll(publicSecretVariablePattern)) {
    addFinding(path, lineNumber(content, match.index ?? 0), "public-secret-variable-name");
  }

  privateKeyHeaderPattern.lastIndex = 0;
  for (const match of content.matchAll(privateKeyHeaderPattern)) {
    addFinding(path, lineNumber(content, match.index ?? 0), "private-key-material");
  }

  for (const pattern of structuredCredentialPatterns) {
    pattern.lastIndex = 0;
    for (const match of content.matchAll(pattern)) {
      addFinding(path, lineNumber(content, match.index ?? 0), "structured-credential");
    }
  }

  literalAssignmentPattern.lastIndex = 0;
  for (const match of content.matchAll(literalAssignmentPattern)) {
    const identifier = match[1] ?? "";
    const value = match[3] ?? "";
    if (
      isSensitiveIdentifier(identifier) &&
      value.trim().length >= 16 &&
      !isSafeLiteral(value) &&
      !isCredentialFreeRootRpcUrl(identifier, value) &&
      !hasExactFixtureAnnotation(path, content, match.index ?? 0, value)
    ) {
      addFinding(path, lineNumber(content, match.index ?? 0), "literal-credential-assignment");
    }
  }

  unquotedAssignmentPattern.lastIndex = 0;
  for (const match of content.matchAll(unquotedAssignmentPattern)) {
    const identifier = match[1] ?? "";
    const value = match[2] ?? "";
    if (isSensitiveIdentifier(identifier) && value.trim().length >= 16 && !isSafeLiteral(value)) {
      addFinding(path, lineNumber(content, match.index ?? 0), "unquoted-credential-assignment");
    }
  }

  credentialUrlPattern.lastIndex = 0;
  for (const match of content.matchAll(credentialUrlPattern)) {
    if (!isSafeCredentialUrl(match[0])) {
      addFinding(path, lineNumber(content, match.index ?? 0), "credential-bearing-url");
    }
  }

  if (environmentExample) {
    for (const [index, line] of content.split(/\r?\n/).entries()) {
      const assignment = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
      if (assignment === null) continue;
      const name = assignment[1] ?? "";
      const value = assignment[2] ?? "";
      if (isSensitiveIdentifier(name) && value.trim() !== "") {
        addFinding(path, index + 1, "non-empty-secret-example");
      }
    }
  }
}

function isBinaryBuffer(buffer) {
  if (buffer.includes(0)) return true;
  let controlBytes = 0;
  for (const byte of buffer) {
    if (byte < 9 || (byte > 13 && byte < 32)) controlBytes += 1;
  }
  if (buffer.length > 0 && controlBytes / buffer.length > 0.05) return true;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return false;
  } catch {
    return true;
  }
}

async function readPrefix(absolutePath, length) {
  const handle = await open(absolutePath, "r");
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export async function scanRepository({
  workspace = repositoryRoot,
  gitBinary = "git",
  onRead = () => {}
} = {}) {
  const absoluteWorkspace = resolve(workspace);
  const { candidates, source } = await enumerateCandidates(absoluteWorkspace, gitBinary);
  const findings = [];
  const findingKeys = new Set();
  const addFinding = (path, line, rule) => {
    const key = `${path}\0${line}\0${rule}`;
    if (findingKeys.has(key)) return;
    findingKeys.add(key);
    findings.push({ line, path, rule });
  };

  if (source === "fallback") {
    addFinding("<scanner>", 0, "git-unavailable-fallback");
  }

  for (const candidate of candidates) {
    const repositoryPath = normalizeRepositoryPath(candidate.path);
    if (isForbiddenSecretPath(repositoryPath)) {
      addFinding(repositoryPath, 0, "forbidden-secret-path");
      continue;
    }

    const absolutePath = resolve(absoluteWorkspace, repositoryPath);
    if (!isWithinWorkspace(absoluteWorkspace, absolutePath)) {
      addFinding(repositoryPath, 0, "path-outside-workspace");
      continue;
    }

    let metadata;
    try {
      metadata = await lstat(absolutePath);
    } catch (error) {
      if (typeof error === "object" && error !== null && error.code === "ENOENT") continue;
      throw error;
    }
    if (metadata.isSymbolicLink()) {
      addFinding(repositoryPath, 0, "symbolic-link-not-scanned");
      continue;
    }
    if (!metadata.isFile()) continue;

    if (metadata.size > maximumTextFileBytes) {
      onRead(repositoryPath);
      const prefix = await readPrefix(absolutePath, 8_192);
      if (isBinaryBuffer(prefix)) {
        if (!knownBinaryExtensions.has(extname(repositoryPath).toLowerCase())) {
          addFinding(repositoryPath, 0, "unexpected-binary-file");
        }
      } else {
        addFinding(repositoryPath, 0, "oversized-text-file");
      }
      continue;
    }

    onRead(repositoryPath);
    const buffer = await readFile(absolutePath);
    if (isBinaryBuffer(buffer)) {
      if (!knownBinaryExtensions.has(extname(repositoryPath).toLowerCase())) {
        addFinding(repositoryPath, 0, "unexpected-binary-file");
      }
      continue;
    }
    const content = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    inspectContent(repositoryPath, content, isEnvironmentExample(repositoryPath), addFinding);
  }

  findings.sort(
    (left, right) =>
      compareStrings(left.path, right.path) ||
      left.line - right.line ||
      compareStrings(left.rule, right.rule)
  );
  return { candidateCount: candidates.length, findings, source };
}

function sanitizedPath(path) {
  return path
    .replace(
      /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g,
      (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`
    )
    .slice(0, 500);
}

export function formatScanReport(result) {
  const visibleFindings = result.findings.slice(0, maximumReportedFindings);
  const lines = visibleFindings.map((finding) =>
    JSON.stringify({
      line: finding.line,
      path: sanitizedPath(finding.path),
      rule: finding.rule
    })
  );
  if (result.findings.length > visibleFindings.length) {
    lines.push(
      JSON.stringify({
        omittedFindings: result.findings.length - visibleFindings.length,
        rule: "finding-output-capped"
      })
    );
  }
  lines.push(
    `Secret-boundary scan failed with ${result.findings.length} finding(s) across ${result.candidateCount} candidate file(s).`
  );
  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const result = await scanRepository();
    if (result.findings.length > 0) {
      process.stderr.write(formatScanReport(result));
      process.exitCode = 1;
      return;
    }
    process.stdout.write(
      `Secret-boundary scan passed across ${result.candidateCount} Git-selected candidate file(s); ignored local files were not enumerated or opened.\n`
    );
  } catch {
    process.stderr.write(
      `${JSON.stringify({ line: 0, path: "<scanner>", rule: "scanner-error" })}\n`
    );
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) await main();
