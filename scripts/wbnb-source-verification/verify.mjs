import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const SOURCE_UNIT = "browser/WBNB.sol";

// These exact UTF-8 bytes (LF, no BOM, no final newline) are authenticated by
// the complete creation- and runtime-bytecode matches recorded in the evidence.
const SOURCE = [
  "pragma solidity ^0.4.18;",
  "",
  "contract WBNB {",
  '    string public name     = "Wrapped BNB";',
  '    string public symbol   = "WBNB";',
  "    uint8  public decimals = 18;",
  "",
  "    event  Approval(address indexed src, address indexed guy, uint wad);",
  "    event  Transfer(address indexed src, address indexed dst, uint wad);",
  "    event  Deposit(address indexed dst, uint wad);",
  "    event  Withdrawal(address indexed src, uint wad);",
  "",
  "    mapping (address => uint)                       public  balanceOf;",
  "    mapping (address => mapping (address => uint))  public  allowance;",
  "",
  "    function() public payable {",
  "        deposit();",
  "    }",
  "    function deposit() public payable {",
  "        balanceOf[msg.sender] += msg.value;",
  "        Deposit(msg.sender, msg.value);",
  "    }",
  "    function withdraw(uint wad) public {",
  "        require(balanceOf[msg.sender] >= wad);",
  "        balanceOf[msg.sender] -= wad;",
  "        msg.sender.transfer(wad);",
  "        Withdrawal(msg.sender, wad);",
  "    }",
  "",
  "    function totalSupply() public view returns (uint) {",
  "        return this.balance;",
  "    }",
  "",
  "    function approve(address guy, uint wad) public returns (bool) {",
  "        allowance[msg.sender][guy] = wad;",
  "        Approval(msg.sender, guy, wad);",
  "        return true;",
  "    }",
  "",
  "    function transfer(address dst, uint wad) public returns (bool) {",
  "        return transferFrom(msg.sender, dst, wad);",
  "    }",
  "",
  "    function transferFrom(address src, address dst, uint wad)",
  "    public",
  "    returns (bool)",
  "    {",
  "        require(balanceOf[src] >= wad);",
  "",
  "        if (src != msg.sender && allowance[src][msg.sender] != uint(-1)) {",
  "            require(allowance[src][msg.sender] >= wad);",
  "            allowance[src][msg.sender] -= wad;",
  "        }",
  "",
  "        balanceOf[src] -= wad;",
  "        balanceOf[dst] += wad;",
  "",
  "        Transfer(src, dst, wad);",
  "",
  "        return true;",
  "    }",
  "}"
].join("\n");

const EXPECTED = Object.freeze({
  compilerVersion: "0.4.18+commit.9cf6e910.Windows.msvc",
  sourceBytes: 1793,
  sourceSha256: "5d5321f1058680235574f06826be8ab853d89538013c3144bb8f4ee32995d874",
  sourceKeccak256: "0x6326feb0f89a7f5ba361a5abddae54f27e05657df4c260fda95c58f8ec80b6ae",
  sourceUrl: "bzzr://86685f918a03aa41ea97245fb3fd2f7ce44cc1fb3532e5d1ecbb738dae8dad27",
  metadataJsonBytes: 3203,
  metadataJsonSha256: "89ac26ab3eeba7f16f8b9872060e3cb509e13f4ffe801903f6a28513954cac6f",
  creationBytes: 3504,
  creationSha256: "1dd38a19dbc4ea04b114ee330b75aba1ccea7cccd4886a0a37e0e1d11aba696a",
  creationKeccak256: "0x7886a1cddc4249cd03bf41ce3f46b412732d7d7fd6e34a4a274a903df81f3594",
  runtimeBytes: 3124,
  runtimeSha256: "e96eee25c3a063ffcfbe4ae2aa2c44e5c99ddf236adb7828676f6fd7f8605742",
  runtimeKeccak256: "0xb7d84205eaaf83ce7b3940c6beaad6d22790255e34a9a2b486aa8cdfff118fe6",
  metadataHex:
    "a165627a7a72305820bcf3db16903185450bc04cb54da92f216e96710cce101fd2b4b47d5b70dc11e00029"
});

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function parseCompilerOutput(output) {
  const creation = /Binary:\s*([0-9a-fA-F]+)/u.exec(output)?.[1];
  const runtime = /Binary of the runtime part:\s*([0-9a-fA-F]+)/u.exec(output)?.[1];
  const metadataJson = /Metadata:\s*(\{.*\})/su.exec(output)?.[1]?.trim();

  if (!creation || !runtime || !metadataJson) {
    throw new Error(
      "solc output did not contain creation bytecode, runtime bytecode, and metadata"
    );
  }

  return {
    creation: Buffer.from(creation, "hex"),
    metadata: JSON.parse(metadataJson),
    metadataJson,
    runtime: Buffer.from(runtime, "hex")
  };
}

function scanOpcodes(bytecode) {
  const counts = new Map();
  const push4 = new Set();

  for (let offset = 0; offset < bytecode.length; offset += 1) {
    const opcode = bytecode[offset];
    counts.set(opcode, (counts.get(opcode) ?? 0) + 1);

    if (opcode === 0x63 && offset + 4 < bytecode.length) {
      push4.add(`0x${bytecode.subarray(offset + 1, offset + 5).toString("hex")}`);
    }

    if (opcode >= 0x60 && opcode <= 0x7f) {
      offset += opcode - 0x5f;
    }
  }

  return {
    sstore: counts.get(0x55) ?? 0,
    call: counts.get(0xf1) ?? 0,
    callcode: counts.get(0xf2) ?? 0,
    delegatecall: counts.get(0xf4) ?? 0,
    create: counts.get(0xf0) ?? 0,
    create2: counts.get(0xf5) ?? 0,
    selfdestruct: counts.get(0xff) ?? 0,
    push4: [...push4]
  };
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

if (process.argv.includes("--help")) {
  console.log("Usage: node verify.mjs --solc <official-solc-0.4.18.exe>");
  process.exit(0);
}

const solcPath = argumentValue("--solc");
if (!solcPath) {
  throw new Error("--solc is required; use the official 0.4.18 Windows binary");
}

const taskDirectory = mkdtempSync(join(tmpdir(), "proofera-wbnb-source-"));
const sourceDirectory = join(taskDirectory, "browser");
const sourcePath = join(sourceDirectory, "WBNB.sol");
const failures = [];

try {
  if (!basename(taskDirectory).startsWith("proofera-wbnb-source-")) {
    throw new Error("refusing to use an unexpected temporary directory");
  }

  mkdirSync(sourceDirectory);
  writeFileSync(sourcePath, SOURCE, { encoding: "utf8", flag: "wx" });

  const version = spawnSync(resolve(solcPath), ["--version"], {
    encoding: "utf8",
    windowsHide: true
  });
  if (version.status !== 0) {
    throw new Error(`solc --version failed: ${version.stderr.trim()}`);
  }

  const versionOutput = `${version.stdout}${version.stderr}`;
  const compile = spawnSync(
    resolve(solcPath),
    ["--bin", "--bin-runtime", "--metadata", SOURCE_UNIT],
    {
      cwd: taskDirectory,
      encoding: "utf8",
      windowsHide: true
    }
  );
  if (compile.status !== 0) {
    throw new Error(`solc compilation failed: ${compile.stderr.trim()}`);
  }

  const source = Buffer.from(SOURCE, "utf8");
  const {
    creation,
    metadata: metadataDocument,
    metadataJson,
    runtime
  } = parseCompilerOutput(`${compile.stdout}${compile.stderr}`);
  const metadataLength = runtime.readUInt16BE(runtime.length - 2) + 2;
  const executable = runtime.subarray(0, runtime.length - metadataLength);
  const metadata = runtime.subarray(runtime.length - metadataLength);
  const opcodes = scanOpcodes(executable);

  const checks = {
    compilerVersion: versionOutput.includes(EXPECTED.compilerVersion),
    sourceBytes: source.length === EXPECTED.sourceBytes,
    sourceSha256: sha256(source) === EXPECTED.sourceSha256,
    sourceHasNoBom: !source.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])),
    sourceHasNoFinalNewline: source.at(-1) !== 0x0a && source.at(-1) !== 0x0d,
    metadataJsonBytes: Buffer.byteLength(metadataJson, "utf8") === EXPECTED.metadataJsonBytes,
    metadataJsonSha256: sha256(Buffer.from(metadataJson, "utf8")) === EXPECTED.metadataJsonSha256,
    metadataCompiler: metadataDocument.compiler?.version === "0.4.18+commit.9cf6e910",
    metadataSource:
      metadataDocument.sources?.[SOURCE_UNIT]?.keccak256 === EXPECTED.sourceKeccak256 &&
      metadataDocument.sources?.[SOURCE_UNIT]?.urls?.length === 1 &&
      metadataDocument.sources[SOURCE_UNIT].urls[0] === EXPECTED.sourceUrl,
    metadataTarget: metadataDocument.settings?.compilationTarget?.[SOURCE_UNIT] === "WBNB",
    metadataOptimizer:
      metadataDocument.settings?.optimizer?.enabled === false &&
      metadataDocument.settings?.optimizer?.runs === 200,
    metadataLibraries: Object.keys(metadataDocument.settings?.libraries ?? {}).length === 0,
    metadataRemappings: metadataDocument.settings?.remappings?.length === 0,
    creationBytes: creation.length === EXPECTED.creationBytes,
    creationSha256: sha256(creation) === EXPECTED.creationSha256,
    runtimeBytes: runtime.length === EXPECTED.runtimeBytes,
    runtimeSha256: sha256(runtime) === EXPECTED.runtimeSha256,
    metadata: metadata.toString("hex") === EXPECTED.metadataHex,
    noDelegatecall: opcodes.delegatecall === 0,
    noCallcode: opcodes.callcode === 0,
    noCreate: opcodes.create === 0 && opcodes.create2 === 0,
    noSelfdestruct: opcodes.selfdestruct === 0
  };

  for (const [name, passed] of Object.entries(checks)) {
    if (!passed) failures.push(name);
  }

  console.log(
    JSON.stringify(
      {
        pass: failures.length === 0,
        failures,
        sourceUnit: SOURCE_UNIT,
        compiler: versionOutput.trim().split(/\r?\n/u),
        source: {
          bytes: source.length,
          sha256: `0x${sha256(source)}`,
          utf8: true,
          newline: "LF",
          bom: false,
          finalNewline: false
        },
        creation: {
          bytes: creation.length,
          sha256: `0x${sha256(creation)}`,
          expectedDeployedKeccak256: EXPECTED.creationKeccak256
        },
        compilerInput: {
          sourceUnit: SOURCE_UNIT,
          sourceKeccak256: metadataDocument.sources[SOURCE_UNIT].keccak256,
          sourceUrls: metadataDocument.sources[SOURCE_UNIT].urls,
          compilationTarget: metadataDocument.settings.compilationTarget,
          optimizer: metadataDocument.settings.optimizer,
          libraries: metadataDocument.settings.libraries,
          remappings: metadataDocument.settings.remappings,
          metadataJsonBytes: Buffer.byteLength(metadataJson, "utf8"),
          metadataJsonSha256: `0x${sha256(Buffer.from(metadataJson, "utf8"))}`
        },
        runtime: {
          bytes: runtime.length,
          sha256: `0x${sha256(runtime)}`,
          expectedDeployedKeccak256: EXPECTED.runtimeKeccak256,
          metadataBytes: metadata.length,
          metadataHex: `0x${metadata.toString("hex")}`,
          executableBytes: executable.length,
          opcodes
        }
      },
      null,
      2
    )
  );

  if (failures.length > 0) process.exitCode = 1;
} finally {
  try {
    unlinkSync(sourcePath);
  } catch {}
  try {
    rmdirSync(sourceDirectory);
  } catch {}
  try {
    rmdirSync(taskDirectory);
  } catch {}
}
