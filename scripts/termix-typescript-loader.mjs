import { access, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve as resolvePath, sep } from "node:path";
import { fileURLToPath } from "node:url";

import typescript from "typescript";

const LOADER_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = resolvePath(dirname(LOADER_PATH), "..");
const EXACT_ENTRYPOINT = resolvePath(REPOSITORY_ROOT, "scripts/run-termix-venus-health-agent.ts");
const BENCHMARK_SOURCE_DIRECTORY = resolvePath(REPOSITORY_ROOT, "packages/benchmarks/src");
const RELATIVE_WITHOUT_EXTENSION = /^(?:\.\.?\/).+[^./]$/u;
const RELATIVE_JAVASCRIPT = /^(?:\.\.?\/).+\.js$/u;

function isWithin(parent, candidate) {
  const local = relative(parent, candidate);
  return local === "" || (!local.startsWith(`..${sep}`) && local !== ".." && !isAbsolute(local));
}

function isAdmittedTypeScript(path) {
  return path === EXACT_ENTRYPOINT || isWithin(BENCHMARK_SOURCE_DIRECTORY, path);
}

async function resolveTypeScriptCandidate(specifier, parentURL) {
  if (!parentURL?.startsWith("file:")) return null;
  const mapped = RELATIVE_JAVASCRIPT.test(specifier)
    ? `${specifier.slice(0, -3)}.ts`
    : RELATIVE_WITHOUT_EXTENSION.test(specifier)
      ? `${specifier}.ts`
      : null;
  if (mapped === null) return null;
  const candidate = new URL(mapped, parentURL);
  try {
    await access(fileURLToPath(candidate));
    return candidate.href;
  } catch {
    return null;
  }
}

export async function resolve(specifier, context, nextResolve) {
  const candidate = await resolveTypeScriptCandidate(specifier, context.parentURL);
  if (candidate !== null) return nextResolve(candidate, context);
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (!url.startsWith("file:") || !url.endsWith(".ts")) return nextLoad(url, context);
  const requestedPath = fileURLToPath(url);
  const canonicalPath = await realpath(requestedPath);
  if (
    resolvePath(requestedPath) !== resolvePath(canonicalPath) ||
    !isAdmittedTypeScript(canonicalPath)
  ) {
    throw new Error("Untrusted TermiX TypeScript module resolution.");
  }
  const source = await readFile(canonicalPath, "utf8");
  const transformed = typescript.transpileModule(source, {
    compilerOptions: {
      module: typescript.ModuleKind.ESNext,
      target: typescript.ScriptTarget.ES2023,
      verbatimModuleSyntax: true
    },
    fileName: canonicalPath,
    reportDiagnostics: false
  });
  return { format: "module", shortCircuit: true, source: transformed.outputText };
}
