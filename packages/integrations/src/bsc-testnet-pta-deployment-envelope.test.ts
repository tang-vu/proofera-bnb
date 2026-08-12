import { describe, expect, it, vi } from "vitest";

import {
  BSC_TESTNET_PTA_DEPLOYMENT_DATA_BYTES,
  BSC_TESTNET_PTA_DEPLOYMENT_DATA_KECCAK256,
  BSC_TESTNET_PTA_DEPLOYMENT_DATA_SHA256,
  BSC_TESTNET_PTA_DEPLOYMENT_ENVELOPE_HASH_DOMAIN,
  BSC_TESTNET_PTA_DEPLOYMENT_OPERATION,
  BSC_TESTNET_PTA_RPC_ENDPOINT_ID,
  BSC_TESTNET_PTA_RPC_ORIGIN,
  BSC_TESTNET_PTA_RUNTIME_BYTES,
  BSC_TESTNET_PTA_RUNTIME_KECCAK256,
  BSC_TESTNET_PTA_RUNTIME_SHA256,
  buildBscTestnetPtaDeploymentEnvelope
} from "./bsc-testnet-pta-deployment-envelope";

const DEPLOYMENT_DATA =
  "0x608060405234801561001057600080fd5b50604051610b63380380610b6383398101604081905261002f9161026d565b6040518060400160405280601381526020017f50726f6f664572612054657374204173736574000000000000000000000000008152506040518060400160405280600381526020016250544160e81b81525081600390816100909190610349565b50600461009d8282610349565b505050606146146100c857604051631874ab9360e31b81524660048201526024015b60405180910390fd5b6001600160a01b0381166100ef5760405163abf250d160e01b815260040160405180910390fd5b6101038169d3c21bcecceda1000000610109565b50610432565b6001600160a01b0382166101335760405163ec442f0560e01b8152600060048201526024016100bf565b61013f60008383610143565b5050565b6001600160a01b03831661016e578060026000828254610163919061040b565b909155506101e09050565b6001600160a01b038316600090815260208190526040902054818110156101c15760405163391434e360e21b81526001600160a01b038516600482015260248101829052604481018390526064016100bf565b6001600160a01b03841660009081526020819052604090209082900390555b6001600160a01b0382166101fc5760028054829003905561021b565b6001600160a01b03821660009081526020819052604090208054820190555b816001600160a01b0316836001600160a01b03167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef8360405161026091815260200190565b60405180910390a3505050565b60006020828403121561027f57600080fd5b81516001600160a01b038116811461029657600080fd5b9392505050565b634e487b7160e01b600052604160045260246000fd5b600181811c908216806102c757607f821691505b6020821081036102e757634e487b7160e01b600052602260045260246000fd5b50919050565b601f821115610344578282111561034457806000526020600020601f840160051c602085101561031b575060005b90810190601f840160051c0360005b818110156103405760008382015560010161032a565b5050505b505050565b81516001600160401b038111156103625761036261029d565b6103768161037084546102b3565b846102ed565b6020601f8211600181146103aa57600083156103925750848201515b600019600385901b1c1916600184901b178455610404565b600084815260208120601f198516915b828110156103da57878501518255602094850194600190920191016103ba565b50848210156103f85786840151600019600387901b60f8161c191681555b505060018360011b0184555b5050505050565b8082018082111561042c57634e487b7160e01b600052601160045260246000fd5b92915050565b610722806104416000396000f3fe608060405234801561001057600080fd5b50600436106100935760003560e01c8063313ce56711610066578063313ce567146100fe57806370a082311461010d57806395d89b4114610136578063a9059cbb1461013e578063dd62ed3e1461015157600080fd5b806306fdde0314610098578063095ea7b3146100b657806318160ddd146100d957806323b872dd146100eb575b600080fd5b6100a061018a565b6040516100ad919061056b565b60405180910390f35b6100c96100c43660046105d5565b61021c565b60405190151581526020016100ad565b6002545b6040519081526020016100ad565b6100c96100f93660046105ff565b610236565b604051601281526020016100ad565b6100dd61011b36600461063c565b6001600160a01b031660009081526020819052604090205490565b6100a061025a565b6100c961014c3660046105d5565b610269565b6100dd61015f36600461065e565b6001600160a01b03918216600090815260016020908152604080832093909416825291909152205490565b60606003805461019990610691565b80601f01602080910402602001604051908101604052809291908181526020018280546101c590610691565b80156102125780601f106101e757610100808354040283529160200191610212565b820191906000526020600020905b8154815290600101906020018083116101f557829003601f168201915b5050505050905090565b60003361022a818585610277565b60019150505b92915050565b600033610244858285610289565b61024f85858561030d565b506001949350505050565b60606004805461019990610691565b60003361022a81858561030d565b610284838383600161036c565b505050565b6001600160a01b0383811660009081526001602090815260408083209386168352929052205460001981101561030757818110156102f857604051637dc7a0d960e11b81526001600160a01b038416600482015260248101829052604481018390526064015b60405180910390fd5b6103078484848403600061036c565b50505050565b6001600160a01b03831661033757604051634b637e8f60e11b8152600060048201526024016102ef565b6001600160a01b0382166103615760405163ec442f0560e01b8152600060048201526024016102ef565b610284838383610441565b6001600160a01b0384166103965760405163e602df0560e01b8152600060048201526024016102ef565b6001600160a01b0383166103c057604051634a1406b160e11b8152600060048201526024016102ef565b6001600160a01b038085166000908152600160209081526040808320938716835292905220829055801561030757826001600160a01b0316846001600160a01b03167f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b9258460405161043391815260200190565b60405180910390a350505050565b6001600160a01b03831661046c57806002600082825461046191906106cb565b909155506104de9050565b6001600160a01b038316600090815260208190526040902054818110156104bf5760405163391434e360e21b81526001600160a01b038516600482015260248101829052604481018390526064016102ef565b6001600160a01b03841660009081526020819052604090209082900390555b6001600160a01b0382166104fa57600280548290039055610519565b6001600160a01b03821660009081526020819052604090208054820190555b816001600160a01b0316836001600160a01b03167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef8360405161055e91815260200190565b60405180910390a3505050565b602081526000825180602084015260005b81811015610599576020818601810151604086840101520161057c565b506000604082850101526040601f19601f83011684010191505092915050565b80356001600160a01b03811681146105d057600080fd5b919050565b600080604083850312156105e857600080fd5b6105f1836105b9565b946020939093013593505050565b60008060006060848603121561061457600080fd5b61061d846105b9565b925061062b602085016105b9565b929592945050506040919091013590565b60006020828403121561064e57600080fd5b610657826105b9565b9392505050565b6000806040838503121561067157600080fd5b61067a836105b9565b9150610688602084016105b9565b90509250929050565b600181811c908216806106a557607f821691505b6020821081036106c557634e487b7160e01b600052602260045260246000fd5b50919050565b8082018082111561023057634e487b7160e01b600052601160045260246000fdfea264697066735822122013017bb97c05c5145fc715c95b8a5850bcf1f7b92711232a73f678ede8ade93364736f6c63430008240033000000000000000000000000997cd959798f7c925076eaeff5855c5c2c1e5a49";
const RUNTIME_PREFIX = "608060405234801561001057600080fd5b5060043610610093";
const runtimeStart = DEPLOYMENT_DATA.indexOf(RUNTIME_PREFIX, 2 + RUNTIME_PREFIX.length);
if (runtimeStart < 0) throw new Error("Reviewed runtime fixture was not found.");
const SIMULATION_RETURN_DATA = `0x${DEPLOYMENT_DATA.slice(
  runtimeStart,
  runtimeStart + BSC_TESTNET_PTA_RUNTIME_BYTES * 2
)}`;

const NOW = "2026-08-12T10:00:20.000Z";

function validInput() {
  return {
    schemaVersion: 1,
    operation: BSC_TESTNET_PTA_DEPLOYMENT_OPERATION,
    deploymentData: DEPLOYMENT_DATA,
    rpc: {
      endpointId: BSC_TESTNET_PTA_RPC_ENDPOINT_ID,
      endpointOrigin: BSC_TESTNET_PTA_RPC_ORIGIN,
      observedAt: "2026-08-12T10:00:10.000Z",
      chainId: "97",
      blockNumber: "124634953",
      blockHash: `0x${"12".repeat(32)}`,
      blockTimestamp: "1786528800",
      blockGasLimit: "140000000",
      latestNonce: "0",
      pendingNonce: "0",
      signerCode: "0x",
      predictedContractAddress: "0x4ed64525d6fB06b7dA926C683CBD809632C9B4Cc",
      predictedContractCode: "0x",
      predictedContractNonce: "0",
      balanceWei: "1000000000000000",
      simulationReturnData: SIMULATION_RETURN_DATA,
      gasEstimate: "500000",
      feeModel: "legacy_gas_price",
      gasPriceWei: "100000000"
    },
    policy: {
      expiresAt: "2026-08-12T10:03:00.000Z",
      gasLimitMarginBps: "2000",
      maximumGasLimit: "800000",
      maximumGasPriceWei: "1000000000",
      maximumTotalCostWei: "1000000000000000"
    }
  };
}

function clock(at = NOW) {
  return { asOf: () => new Date(at) };
}

function issueCodes(result: ReturnType<typeof buildBscTestnetPtaDeploymentEnvelope>) {
  return result.issues.map(({ code }) => code);
}

describe("BSC testnet PTA deployment envelope", () => {
  it("pins reviewed creation/runtime bytes and emits a deterministic deeply frozen envelope", () => {
    expect((DEPLOYMENT_DATA.length - 2) / 2).toBe(BSC_TESTNET_PTA_DEPLOYMENT_DATA_BYTES);
    expect((SIMULATION_RETURN_DATA.length - 2) / 2).toBe(BSC_TESTNET_PTA_RUNTIME_BYTES);

    const first = buildBscTestnetPtaDeploymentEnvelope(validInput(), clock());
    const second = buildBscTestnetPtaDeploymentEnvelope(validInput(), clock());

    expect(first.status).toBe("validated");
    expect(first).toEqual(second);
    if (first.status !== "validated") throw new Error("Expected a validated fixture.");
    expect(first.signingReady).toBe(false);
    expect(first.envelopeValid).toBe(true);
    expect(first.boundary.rpcProvenanceAuthenticated).toBe(false);
    expect(first.boundary.signingAuthorized).toBe(false);
    expect(first.envelope.hashDomain).toBe(BSC_TESTNET_PTA_DEPLOYMENT_ENVELOPE_HASH_DOMAIN);
    expect(first.envelope.envelopeHash).toBe(
      "0x7b0a566c9656e978de31a3ffc5f0f498f10c0395109db7e5ce482989f1bb75ff"
    );
    expect(first.envelope.deployment).toMatchObject({
      deploymentDataSha256: BSC_TESTNET_PTA_DEPLOYMENT_DATA_SHA256,
      deploymentDataKeccak256: BSC_TESTNET_PTA_DEPLOYMENT_DATA_KECCAK256,
      runtimeSha256: BSC_TESTNET_PTA_RUNTIME_SHA256,
      runtimeKeccak256: BSC_TESTNET_PTA_RUNTIME_KECCAK256,
      from: "0x997cD959798F7c925076eaeFF5855C5C2c1e5A49",
      recipient: "0x997cD959798F7c925076eaeFF5855C5C2c1e5A49",
      to: null,
      predictedContractAddress: "0x4ed64525d6fB06b7dA926C683CBD809632C9B4Cc"
    });
    expect(first.finances).toEqual({
      balanceWei: "1000000000000000",
      gasEstimate: "500000",
      gasLimitMarginBps: "2000",
      gasLimit: "600000",
      gasPriceWei: "100000000",
      maximumCostWei: "60000000000000"
    });
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.envelope)).toBe(true);
    expect(Object.isFrozen(first.envelope.transaction)).toBe(true);
    expect(() => JSON.stringify(first)).not.toThrow();
    expect(Object.values(first.finances).every((value) => typeof value === "string")).toBe(true);
    expect(first.boundary).toEqual({
      scope: "exact_bsc_testnet_pta_deployment_envelope_only",
      rpcProvenanceAuthenticated: false,
      rpcReadPerformed: false,
      secretRead: false,
      signerCreated: false,
      signatureCreated: false,
      transactionSubmitted: false,
      blockchainWritePerformed: false,
      executionAuthorized: false,
      signingAuthorized: false
    });
  });

  it("blocks the current zero-balance observation with raw string finances", () => {
    const input = validInput();
    input.rpc.balanceWei = "0";
    const result = buildBscTestnetPtaDeploymentEnvelope(input, clock());

    expect(result.status).toBe("blocked");
    expect(result.signingReady).toBe(false);
    expect(result.envelope).toBeNull();
    expect(issueCodes(result)).toContain("INSUFFICIENT_BALANCE");
    expect(result.finances).toMatchObject({
      balanceWei: "0",
      maximumCostWei: "60000000000000"
    });
  });

  it.each([
    [
      "stale observation",
      (input: ReturnType<typeof validInput>) => (input.rpc.observedAt = "2026-08-12T09:57:00.000Z"),
      "OBSERVATION_STALE"
    ],
    [
      "future observation",
      (input: ReturnType<typeof validInput>) => (input.rpc.observedAt = "2026-08-12T10:00:21.000Z"),
      "OBSERVATION_FROM_FUTURE"
    ],
    [
      "nonce drift",
      (input: ReturnType<typeof validInput>) => (input.rpc.pendingNonce = "1"),
      "NONCE_DRIFT"
    ],
    [
      "used deployer nonce",
      (input: ReturnType<typeof validInput>) => {
        input.rpc.latestNonce = "1";
        input.rpc.pendingNonce = "1";
      },
      "DEPLOYER_NONCE_ALREADY_USED"
    ],
    [
      "target collision",
      (input: ReturnType<typeof validInput>) => (input.rpc.predictedContractCode = "0x00"),
      "TARGET_CODE_PRESENT"
    ],
    [
      "target history",
      (input: ReturnType<typeof validInput>) => (input.rpc.predictedContractNonce = "1"),
      "TARGET_NONCE_NONZERO"
    ],
    [
      "signer code",
      (input: ReturnType<typeof validInput>) => (input.rpc.signerCode = "0x00"),
      "SIGNER_CODE_PRESENT"
    ],
    [
      "gas cap",
      (input: ReturnType<typeof validInput>) => (input.policy.maximumGasLimit = "599999"),
      "GAS_LIMIT_EXCEEDS_POLICY"
    ],
    [
      "block gas",
      (input: ReturnType<typeof validInput>) => (input.rpc.blockGasLimit = "599999"),
      "GAS_LIMIT_EXCEEDS_BLOCK"
    ],
    [
      "gas price",
      (input: ReturnType<typeof validInput>) => (input.rpc.gasPriceWei = "1000000001"),
      "GAS_PRICE_EXCEEDS_POLICY"
    ],
    [
      "total cost",
      (input: ReturnType<typeof validInput>) =>
        (input.policy.maximumTotalCostWei = "59999999999999"),
      "TOTAL_COST_EXCEEDS_POLICY"
    ],
    [
      "expired",
      (input: ReturnType<typeof validInput>) =>
        (input.policy.expiresAt = "2026-08-12T10:00:20.000Z"),
      "ENVELOPE_EXPIRED"
    ]
  ])("fails closed for %s", (_name, mutate, expectedCode) => {
    const input = validInput();
    mutate(input);
    const result = buildBscTestnetPtaDeploymentEnvelope(input, clock());
    expect(result.status).toBe("blocked");
    expect(issueCodes(result)).toContain(expectedCode);
  });

  it("blocks bytecode and simulation tampering by both reviewed digests", () => {
    const dataInput = validInput();
    dataInput.deploymentData = `${DEPLOYMENT_DATA.slice(0, -1)}8`;
    expect(issueCodes(buildBscTestnetPtaDeploymentEnvelope(dataInput, clock()))).toEqual(
      expect.arrayContaining(["DEPLOYMENT_DATA_SHA256_MISMATCH", "DEPLOYMENT_DATA_KECCAK_MISMATCH"])
    );

    const runtimeInput = validInput();
    runtimeInput.rpc.simulationReturnData = `${SIMULATION_RETURN_DATA.slice(0, -1)}8`;
    expect(issueCodes(buildBscTestnetPtaDeploymentEnvelope(runtimeInput, clock()))).toEqual(
      expect.arrayContaining(["SIMULATION_SHA256_MISMATCH", "SIMULATION_KECCAK_MISMATCH"])
    );
  });

  it("rejects noncanonical finance, extra fee fields, accessors, proxies, and invalid clocks", () => {
    const noncanonical = validInput();
    noncanonical.rpc.balanceWei = "01";
    expect(issueCodes(buildBscTestnetPtaDeploymentEnvelope(noncanonical, clock()))).toContain(
      "BALANCE_INVALID"
    );

    const extraFee = validInput() as ReturnType<typeof validInput> & {
      rpc: { maxFeePerGas: string };
    };
    extraFee.rpc.maxFeePerGas = "1";
    expect(issueCodes(buildBscTestnetPtaDeploymentEnvelope(extraFee, clock()))).toEqual([
      "INPUT_INVALID"
    ]);

    const accessor = validInput();
    const getter = vi.fn(() => "97");
    Object.defineProperty(accessor.rpc, "chainId", { enumerable: true, get: getter });
    expect(issueCodes(buildBscTestnetPtaDeploymentEnvelope(accessor, clock()))).toEqual([
      "INPUT_INVALID"
    ]);
    expect(getter).not.toHaveBeenCalled();

    const proxy = new Proxy(validInput(), {});
    expect(issueCodes(buildBscTestnetPtaDeploymentEnvelope(proxy, clock()))).toEqual([
      "INPUT_INVALID"
    ]);
    let applyTrapCalls = 0;
    const proxiedClock = new Proxy(() => new Date(NOW), {
      apply: () => {
        applyTrapCalls += 1;
        return new Date(NOW);
      }
    });
    expect(
      issueCodes(buildBscTestnetPtaDeploymentEnvelope(validInput(), { asOf: proxiedClock }))
    ).toEqual(["OPTIONS_INVALID"]);
    expect(applyTrapCalls).toBe(0);
    let datePrototypeTrapCalls = 0;
    const proxiedDate = new Proxy(new Date(NOW), {
      getPrototypeOf: () => {
        datePrototypeTrapCalls += 1;
        return Date.prototype;
      }
    });
    expect(
      issueCodes(buildBscTestnetPtaDeploymentEnvelope(validInput(), { asOf: () => proxiedDate }))
    ).toEqual(["CLOCK_INVALID"]);
    expect(datePrototypeTrapCalls).toBe(0);
    expect(
      issueCodes(buildBscTestnetPtaDeploymentEnvelope(validInput(), { asOf: () => "now" }))
    ).toEqual(["CLOCK_INVALID"]);
  });
});
