import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { link, lstat, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, win32 } from "node:path";

import { describe, expect, it, vi } from "vitest";
import { keccak256, serializeTransaction, type Hex } from "viem";
import type * as ViemModule from "viem";

vi.mock("server-only", () => ({}));
vi.mock("viem", async (importOriginal) => {
  const original = await importOriginal<typeof ViemModule>();
  return {
    ...original,
    recoverTransactionAddress: vi.fn(async () => "0x997cD959798F7c925076eaeFF5855C5C2c1e5A49")
  };
});

import {
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_1_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_2_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_TRANSITION_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_TRANSITION_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_TRANSITION_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_TRANSITION_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_CLAIM_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_TRANSITION_RAW_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
  BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_CLAIM_RAW_SHA256,
  createBscTestnetPtaWbnbPoolLocalJournalCore,
  deriveBscTestnetPtaWbnbPoolAuthorizationReceiptSha256,
  deriveBscTestnetPtaWbnbPoolFailedBeforeWorkerOutcomeDigest,
  deriveBscTestnetPtaWbnbPoolNoEffectProofDigest,
  openExistingWindowsBscTestnetPtaWbnbPoolActiveLocalJournalAtSyntheticDirectoryForTests,
  openExistingWindowsBscTestnetPtaWbnbPoolLocalJournalAtSyntheticDirectoryForTests,
  type BscTestnetPtaWbnbPoolLegacyClaimRequestForTests,
  type BscTestnetPtaWbnbPoolLocalJournalPorts,
  type BscTestnetPtaWbnbPoolNoEffectProof
} from "./bsc-testnet-pta-wbnb-pool-local-journal.server";
import { runPinnedPowerShellForInternalUse } from "./bsc-testnet-deployer-custody-windows.server";
import {
  BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA
} from "./bsc-testnet-pta-wbnb-pool-initialization";
import {
  BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID,
  BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION,
  BSC_TESTNET_PTA_WBNB_POOL_SIGNING_WORKER_OPERATION,
  buildBscTestnetPtaWbnbPoolExactSigningTransaction,
  buildBscTestnetPtaWbnbPoolSigningWorkerRequest,
  type BscTestnetPtaWbnbPoolValidatedSigningIntent
} from "./bsc-testnet-pta-wbnb-pool-one-shot-protocol";

const NOW = "2026-08-13T10:00:30.000Z";
const LEGACY_CLAIM_RECORD =
  '{"schemaVersion":"bsc_testnet_pta_wbnb_pool_local_journal_v1","kind":"claim","claimId":"pta-wbnb-pool-e6c943aa33e600bfc1770ee654ee6b00","operationKey":"0xe6c943aa33e600bfc1770ee654ee6b00bf6dbcc7cc1702c58bd1caa64dadb9cc","envelopeHash":"0xeaf31374f49546dc2d02f351cf5872b9460b57fabaf94f39189411f45772d869","authorizationReceiptSha256":"0x3a69c8469b0a5f3bc2397975437969aec6ac144880992c3acae15a51d426c1b3","signingHash":"0xc1fde3400b68f5870d8f19d253fd58e9529a4aa440cecf4c3c1bf0de85f3efdc","serializedUnsignedSha256":"0x0ffa2338744fbb372a0b41df9551326c7de216e5381d4887dbbb29861880e76e","reviewerApprovalDigest":"0x330786388229f20ac735e394e0705395fcf130f1e241e11ab1080bf9e1d961f3","ownerAuthorizationDigest":"0xda498ee67ef685b6b47b7e3e2749db234c4951f6c9b15e376e18e7659d4188af","releaseCommit":"336af2967286795dc7703fff85034c71b8e84b5c","runtimeManifestSha256":"0xa1cda6fcf00f8a7d2b9a679cfb9b3fc28aa60674dae89c7dbfc032bdbcff5bdd","recordedAt":"2026-08-14T14:12:04.474Z","gasLimit":"5983857","gasPriceWei":"100000000","maxCostWei":"598385700000000","authorizedAt":"2026-08-14T14:11:35.280Z","expiresAt":"2026-08-14T14:12:20.280Z"}\n';
const GENERATION_2_CLAIM_RECORD =
  '{"schemaVersion":"bsc_testnet_pta_wbnb_pool_local_journal_v2","kind":"claim","claimId":"pta-wbnb-pool-v2-58ab6f4b063b04a653cde168749e817e","operationKey":"0xe6c943aa33e600bfc1770ee654ee6b00bf6dbcc7cc1702c58bd1caa64dadb9cc","envelopeHash":"0x8e42cd087f55c3170bc4a5a455d4d74210af50f43a490025fae6f49779c4fb26","authorizationReceiptSha256":"0xff316f05bb644f8d6d44e508b86df9ea0db5f2ed1fbd5e55d08a816a2988258e","signingHash":"0xc1fde3400b68f5870d8f19d253fd58e9529a4aa440cecf4c3c1bf0de85f3efdc","serializedUnsignedSha256":"0x0ffa2338744fbb372a0b41df9551326c7de216e5381d4887dbbb29861880e76e","reviewerApprovalDigest":"0xd86933ee4a0a0a1660d825891d913e5d4da64d6773ef3f6fa273b028414a4161","ownerAuthorizationDigest":"0x4b6a0ba2b66f7d23241275981110baf54a235672865c8d22f921224f2a7e2716","releaseCommit":"655187f2b425c40839803950257e1d5a5c4f8d98","runtimeManifestSha256":"0xcc84febaa634346f638917ff5028e938f15e7b0ea01808051d7a010773581f64","generation":2,"predecessorState":"superseded_before_worker","predecessorFenceSha256":"0xbad89be85b34b1a6ada3aae25e3ccc04e79aefe46d4d51d2eb6e45400413aacc","attemptId":"0xff3cce626f05350bb9444aea07427e222bcc9f66e1bcfb35b797662188369a8e","recordedAt":"2026-08-15T01:43:22.469Z","gasLimit":"5983857","gasPriceWei":"100000000","maxCostWei":"598385700000000","authorizedAt":"2026-08-15T01:43:00.368Z","expiresAt":"2026-08-15T01:43:45.368Z"}\n';
const GENERATION_3_CLAIM_RECORD =
  '{"schemaVersion":"bsc_testnet_pta_wbnb_pool_local_journal_v3","kind":"claim","claimId":"pta-wbnb-pool-v3-cb3500e0247904b5dd71015570e6223c","operationKey":"0xe6c943aa33e600bfc1770ee654ee6b00bf6dbcc7cc1702c58bd1caa64dadb9cc","envelopeHash":"0x27a121784045ddd993fb451e838ed2982cc712bf5d6ab0c2a5ea8dcc8e7d1453","authorizationReceiptSha256":"0x3ae64925ad893a0c8a8a55412b58190c7c6223df6f2eac01d2ddbeaaca37296b","signingHash":"0xc1fde3400b68f5870d8f19d253fd58e9529a4aa440cecf4c3c1bf0de85f3efdc","serializedUnsignedSha256":"0x0ffa2338744fbb372a0b41df9551326c7de216e5381d4887dbbb29861880e76e","reviewerApprovalDigest":"0xc9d53633002f4a7649887517200110786c1301bd88348950b14c5e5419c647b6","ownerAuthorizationDigest":"0xe88ce77940a0ec31de29324aee31a78a9e6dd716456e738eb454236a3f7f8447","releaseCommit":"71bf9e7adfda69c9c57929b79d4ef62aaa0d92d5","runtimeManifestSha256":"0x507733bd14aba266cdb9f9d650638914b5c7f51b32b240523ad3558c2fd25069","generation":3,"predecessorState":"superseded_before_worker","predecessorFenceSha256":"0x50a27df83195bb1d4f3ba7c072f5909c7bda7600efff75e82f286a74fe0ee89e","attemptId":"0x40954c0cfc5e7c501833089c37f47852c2437bdf53606c6cc70ced85e5148fd4","recordedAt":"2026-08-15T05:41:04.444Z","gasLimit":"5983857","gasPriceWei":"100000000","maxCostWei":"598385700000000","authorizedAt":"2026-08-15T05:40:41.889Z","expiresAt":"2026-08-15T05:41:26.889Z"}\n';
const GENERATION_4_CLAIM_RECORD =
  '{"schemaVersion":"bsc_testnet_pta_wbnb_pool_local_journal_v4","kind":"claim","claimId":"pta-wbnb-pool-v4-84710a91f011bbc04106bbef4f3e9fc9","operationKey":"0xe6c943aa33e600bfc1770ee654ee6b00bf6dbcc7cc1702c58bd1caa64dadb9cc","envelopeHash":"0xbed286a4d6fe682aeb089870307b816937d330fd9cbd19d51228b488d64be6b1","authorizationReceiptSha256":"0x6d314ccfed3756f6805cede55d381e794f444fde54e4d4c3082f56a5912e364b","signingHash":"0xc1fde3400b68f5870d8f19d253fd58e9529a4aa440cecf4c3c1bf0de85f3efdc","serializedUnsignedSha256":"0x0ffa2338744fbb372a0b41df9551326c7de216e5381d4887dbbb29861880e76e","reviewerApprovalDigest":"0x1e59f4323f9136f1d2376ab249eda2b0cb46e053b5dec6f7e765976ce2614ede","ownerAuthorizationDigest":"0x222743c8b632da4294a26cdd6c5a21149c7651807fec9be48d61864939e3ead2","releaseCommit":"d160530e3d5b18f1a82665a604a3fd25a19338de","runtimeManifestSha256":"0x5b61083d27e794e00f24f708ba7f1ad029a4a8fe509adc8c2394d8bde23a9fbc","generation":4,"predecessorState":"superseded_before_worker","predecessorFenceSha256":"0x9fa84a9cf79373dd1ccfd5217bb0159cb6e97f6821489d9a1afbc0c5df258f2e","attemptId":"0xc55caf41d8822860e080a208644e0d21f63b823bb2ee3dee64c31d0484c13819","recordedAt":"2026-08-15T15:28:03.350Z","gasLimit":"5983857","gasPriceWei":"100000000","maxCostWei":"598385700000000","authorizedAt":"2026-08-15T15:27:53.774Z","expiresAt":"2026-08-15T15:28:53.774Z"}\n';
const GENERATION_4_TERMINAL_RECORD =
  '{"schemaVersion":"bsc_testnet_pta_wbnb_pool_local_journal_v4","kind":"failed_before_worker","claimId":"pta-wbnb-pool-v4-84710a91f011bbc04106bbef4f3e9fc9","operationKey":"0xe6c943aa33e600bfc1770ee654ee6b00bf6dbcc7cc1702c58bd1caa64dadb9cc","envelopeHash":"0xbed286a4d6fe682aeb089870307b816937d330fd9cbd19d51228b488d64be6b1","authorizationReceiptSha256":"0x6d314ccfed3756f6805cede55d381e794f444fde54e4d4c3082f56a5912e364b","signingHash":"0xc1fde3400b68f5870d8f19d253fd58e9529a4aa440cecf4c3c1bf0de85f3efdc","serializedUnsignedSha256":"0x0ffa2338744fbb372a0b41df9551326c7de216e5381d4887dbbb29861880e76e","reviewerApprovalDigest":"0x1e59f4323f9136f1d2376ab249eda2b0cb46e053b5dec6f7e765976ce2614ede","ownerAuthorizationDigest":"0x222743c8b632da4294a26cdd6c5a21149c7651807fec9be48d61864939e3ead2","releaseCommit":"d160530e3d5b18f1a82665a604a3fd25a19338de","runtimeManifestSha256":"0x5b61083d27e794e00f24f708ba7f1ad029a4a8fe509adc8c2394d8bde23a9fbc","generation":4,"predecessorState":"superseded_before_worker","predecessorFenceSha256":"0x9fa84a9cf79373dd1ccfd5217bb0159cb6e97f6821489d9a1afbc0c5df258f2e","attemptId":"0xc55caf41d8822860e080a208644e0d21f63b823bb2ee3dee64c31d0484c13819","recordedAt":"2026-08-15T15:28:10.968Z","phase":"post_claim_recheck","issueCode":"POST_CLAIM_RECHECK_OUTCOME_UNKNOWN","outcomeDigest":"0x23468d2bf83c3b855334c077890c866c59955a44c42c83f2e32af4a5ef73ad06"}\n';
const GENERATION_5_CLAIM_RECORD =
  '{"schemaVersion":"bsc_testnet_pta_wbnb_pool_local_journal_v5","kind":"claim","claimId":"pta-wbnb-pool-v5-291bb85f036ecc3971344c4390649d61","operationKey":"0xe6c943aa33e600bfc1770ee654ee6b00bf6dbcc7cc1702c58bd1caa64dadb9cc","envelopeHash":"0xff96825f7e22467ef692548d22ef3ed3aa392eeaec7f1396b4ccdeba1e36d43c","authorizationReceiptSha256":"0x838c1700667578398a2a8cb31e508c677fdecb1243002a96a82caf3c5e521a0c","signingHash":"0xb3af96cfee896dbeadb5fb144b44cd0237007a0f5365f6c929238e06292aa3e1","serializedUnsignedSha256":"0x561ce21b43f81088edc3a267b3fd982b2291c773b26ced908a564a25dd44d6ec","reviewerApprovalDigest":"0x0c38c7752719a55c40624989dfb7b2adae65c3ba2403f61e9948435e773c4841","ownerAuthorizationDigest":"0x16ffb042e7bae818be1aba9ca7b5e3e795ddf084dd80d6d4d3e6231c4967f3dc","releaseCommit":"e8f3f5b56a5a423094a77a679462f71baa7d6069","runtimeManifestSha256":"0xfa2fffc0e211904c830aa963eaddda20543c66ecbeb750680fa790a409e05418","generation":5,"predecessorState":"failed_before_worker","predecessorTerminalRawSha256":"0x2e0570423b1217f1dab6fa8cdb91a0a75b2d78023bacc611a6c81017d0033bab","attemptId":"0x81edb062fff3165780e4e04bcfc4da63c152f08c34ce0937127c04d07b7a32a0","recordedAt":"2026-08-25T02:42:47.382Z","gasLimit":"5983857","gasPriceWei":"100000000","maxCostWei":"598385700000000","authorizedAt":"2026-08-25T02:42:30.185Z","expiresAt":"2026-08-25T02:44:30.185Z"}\n';
const GENERATION_5_TERMINAL_RECORD =
  '{"schemaVersion":"bsc_testnet_pta_wbnb_pool_local_journal_v5","kind":"failed_before_worker","claimId":"pta-wbnb-pool-v5-291bb85f036ecc3971344c4390649d61","operationKey":"0xe6c943aa33e600bfc1770ee654ee6b00bf6dbcc7cc1702c58bd1caa64dadb9cc","envelopeHash":"0xff96825f7e22467ef692548d22ef3ed3aa392eeaec7f1396b4ccdeba1e36d43c","authorizationReceiptSha256":"0x838c1700667578398a2a8cb31e508c677fdecb1243002a96a82caf3c5e521a0c","signingHash":"0xb3af96cfee896dbeadb5fb144b44cd0237007a0f5365f6c929238e06292aa3e1","serializedUnsignedSha256":"0x561ce21b43f81088edc3a267b3fd982b2291c773b26ced908a564a25dd44d6ec","reviewerApprovalDigest":"0x0c38c7752719a55c40624989dfb7b2adae65c3ba2403f61e9948435e773c4841","ownerAuthorizationDigest":"0x16ffb042e7bae818be1aba9ca7b5e3e795ddf084dd80d6d4d3e6231c4967f3dc","releaseCommit":"e8f3f5b56a5a423094a77a679462f71baa7d6069","runtimeManifestSha256":"0xfa2fffc0e211904c830aa963eaddda20543c66ecbeb750680fa790a409e05418","generation":5,"predecessorState":"failed_before_worker","predecessorTerminalRawSha256":"0x2e0570423b1217f1dab6fa8cdb91a0a75b2d78023bacc611a6c81017d0033bab","attemptId":"0x81edb062fff3165780e4e04bcfc4da63c152f08c34ce0937127c04d07b7a32a0","recordedAt":"2026-08-25T02:42:57.981Z","phase":"post_claim_recheck","issueCode":"POST_CLAIM_RECHECK_OUTCOME_UNKNOWN","outcomeDigest":"0x7db76f9069e2d46d674eaccb2c7453489e8b80ca1940288b49ac7da46196a93a"}\n';
const GENERATION_6_CLAIM_RECORD =
  '{"schemaVersion":"bsc_testnet_pta_wbnb_pool_local_journal_v6","kind":"claim","claimId":"pta-wbnb-pool-v6-fddfa6da6d9e1f48220a551386ac9789","operationKey":"0xe6c943aa33e600bfc1770ee654ee6b00bf6dbcc7cc1702c58bd1caa64dadb9cc","envelopeHash":"0x747733735d59f9975f4b9fb5e2fdc9b60a3a004939b5c22c9bab0e53578c484a","authorizationReceiptSha256":"0xfe30898509b19790497b27890bdd2a3c5918f66c39f6a4c1a07b8f39f244feb0","signingHash":"0xb3af96cfee896dbeadb5fb144b44cd0237007a0f5365f6c929238e06292aa3e1","serializedUnsignedSha256":"0x561ce21b43f81088edc3a267b3fd982b2291c773b26ced908a564a25dd44d6ec","reviewerApprovalDigest":"0x8c06dfcfba7136ed8b3d14915a1f40af38b85eab593330b986f00f516d89328a","ownerAuthorizationDigest":"0xa944f0eabf121ab5093ee9634756ac68c54d66a47517e28ebcb3596a8ef7a287","releaseCommit":"1655d39db63a636e7c66a007046c06eab65c55f1","runtimeManifestSha256":"0xc34022bb89478052075a70d43017dfaaee44092cf72b3505bbbac1a56ea3256a","generation":6,"predecessorState":"failed_before_worker","predecessorTerminalRawSha256":"0x39a6295f3f816cb5bba6c8c3be11982bcafa45847608e1150de950738217c8c9","attemptId":"0x29017850ccf109d2082edcdf62cacf96a41a71820ffebe0365eb896b388fb26d","recordedAt":"2026-08-25T13:09:48.685Z","gasLimit":"5983857","gasPriceWei":"100000000","maxCostWei":"598385700000000","authorizedAt":"2026-08-25T13:09:32.576Z","expiresAt":"2026-08-25T13:11:32.576Z"}\n';
const GENERATION_6_TERMINAL_RECORD =
  '{"schemaVersion":"bsc_testnet_pta_wbnb_pool_local_journal_v6","kind":"failed_before_worker","claimId":"pta-wbnb-pool-v6-fddfa6da6d9e1f48220a551386ac9789","operationKey":"0xe6c943aa33e600bfc1770ee654ee6b00bf6dbcc7cc1702c58bd1caa64dadb9cc","envelopeHash":"0x747733735d59f9975f4b9fb5e2fdc9b60a3a004939b5c22c9bab0e53578c484a","authorizationReceiptSha256":"0xfe30898509b19790497b27890bdd2a3c5918f66c39f6a4c1a07b8f39f244feb0","signingHash":"0xb3af96cfee896dbeadb5fb144b44cd0237007a0f5365f6c929238e06292aa3e1","serializedUnsignedSha256":"0x561ce21b43f81088edc3a267b3fd982b2291c773b26ced908a564a25dd44d6ec","reviewerApprovalDigest":"0x8c06dfcfba7136ed8b3d14915a1f40af38b85eab593330b986f00f516d89328a","ownerAuthorizationDigest":"0xa944f0eabf121ab5093ee9634756ac68c54d66a47517e28ebcb3596a8ef7a287","releaseCommit":"1655d39db63a636e7c66a007046c06eab65c55f1","runtimeManifestSha256":"0xc34022bb89478052075a70d43017dfaaee44092cf72b3505bbbac1a56ea3256a","generation":6,"predecessorState":"failed_before_worker","predecessorTerminalRawSha256":"0x39a6295f3f816cb5bba6c8c3be11982bcafa45847608e1150de950738217c8c9","attemptId":"0x29017850ccf109d2082edcdf62cacf96a41a71820ffebe0365eb896b388fb26d","recordedAt":"2026-08-25T13:09:55.563Z","phase":"post_claim_recheck","issueCode":"POST_CLAIM_RECHECK_OUTCOME_UNKNOWN","outcomeDigest":"0xfbece16f72e4ed39317a2ff6ad56933448150e8f8f9f3a86df8f77f793219f73"}\n';
const GENERATION_7_CLAIM_RECORD =
  '{"schemaVersion":"bsc_testnet_pta_wbnb_pool_local_journal_v7","kind":"claim","claimId":"pta-wbnb-pool-v7-47434105c656d6768c0cde4568aad44f","operationKey":"0xe6c943aa33e600bfc1770ee654ee6b00bf6dbcc7cc1702c58bd1caa64dadb9cc","envelopeHash":"0x1804e85a618e68168dce6608c33f809838b1e3c1843dfecfe604030ed5213643","authorizationReceiptSha256":"0xf81c5d3203b8fb5fd88479178971a4fc8da050cb71e34a8089ce8d94c58da4d0","signingHash":"0xb3af96cfee896dbeadb5fb144b44cd0237007a0f5365f6c929238e06292aa3e1","serializedUnsignedSha256":"0x561ce21b43f81088edc3a267b3fd982b2291c773b26ced908a564a25dd44d6ec","reviewerApprovalDigest":"0x0556c26e1cc7e9cf5525fe21a596c03baea0967feddd67b9fe1dd6bc00a2c5db","ownerAuthorizationDigest":"0x48c4ba9fe535d8d49163e0e6fc041e077c896a77c60abb820a9f53c47e5fc4b0","releaseCommit":"dbd4950e62b469379dc9fc877668d247b38b6f93","runtimeManifestSha256":"0xd42a5e8eb1251289edbae9383d2ec4a36dd4f668a608665d03dd50fff074ee67","generation":7,"predecessorState":"failed_before_worker","predecessorTerminalRawSha256":"0x4a64cc2ef48529e271152004e31dfb7d35511d0a5691815838849c831638d6f7","attemptId":"0xec3ae4a15cb7c8c8ca957d1e8b9ea6f179acf23abf5119a6e12ef0a1403521a5","recordedAt":"2026-08-25T15:02:45.894Z","gasLimit":"5983857","gasPriceWei":"100000000","maxCostWei":"598385700000000","authorizedAt":"2026-08-25T15:02:28.723Z","expiresAt":"2026-08-25T15:04:28.723Z"}\n';
const GENERATION_7_TERMINAL_RECORD =
  '{"schemaVersion":"bsc_testnet_pta_wbnb_pool_local_journal_v7","kind":"failed_before_worker","claimId":"pta-wbnb-pool-v7-47434105c656d6768c0cde4568aad44f","operationKey":"0xe6c943aa33e600bfc1770ee654ee6b00bf6dbcc7cc1702c58bd1caa64dadb9cc","envelopeHash":"0x1804e85a618e68168dce6608c33f809838b1e3c1843dfecfe604030ed5213643","authorizationReceiptSha256":"0xf81c5d3203b8fb5fd88479178971a4fc8da050cb71e34a8089ce8d94c58da4d0","signingHash":"0xb3af96cfee896dbeadb5fb144b44cd0237007a0f5365f6c929238e06292aa3e1","serializedUnsignedSha256":"0x561ce21b43f81088edc3a267b3fd982b2291c773b26ced908a564a25dd44d6ec","reviewerApprovalDigest":"0x0556c26e1cc7e9cf5525fe21a596c03baea0967feddd67b9fe1dd6bc00a2c5db","ownerAuthorizationDigest":"0x48c4ba9fe535d8d49163e0e6fc041e077c896a77c60abb820a9f53c47e5fc4b0","releaseCommit":"dbd4950e62b469379dc9fc877668d247b38b6f93","runtimeManifestSha256":"0xd42a5e8eb1251289edbae9383d2ec4a36dd4f668a608665d03dd50fff074ee67","generation":7,"predecessorState":"failed_before_worker","predecessorTerminalRawSha256":"0x4a64cc2ef48529e271152004e31dfb7d35511d0a5691815838849c831638d6f7","attemptId":"0xec3ae4a15cb7c8c8ca957d1e8b9ea6f179acf23abf5119a6e12ef0a1403521a5","recordedAt":"2026-08-25T15:02:52.810Z","phase":"post_claim_recheck","issueCode":"POST_CLAIM_RECHECK_OUTCOME_UNKNOWN","outcomeDigest":"0x62e2b9de9aecc9fd7a1377bb1f9c23ee2ad8e8c34ed04ecdeb289340e694514b"}\n';
const GENERATION_8_CLAIM_RECORD =
  '{"schemaVersion":"bsc_testnet_pta_wbnb_pool_local_journal_v8","kind":"claim","claimId":"pta-wbnb-pool-v8-23b6548d4d51891d83e27146b10ec79c","operationKey":"0xe6c943aa33e600bfc1770ee654ee6b00bf6dbcc7cc1702c58bd1caa64dadb9cc","envelopeHash":"0x41c926d396af39bb780b77e2296bc9c9855b86570be34d7ca6b8d6bfd34ff935","authorizationReceiptSha256":"0x3ff45d6924e0e5b98b97cea98e6f0d6b1326b47c0ad0a113e855582269c7dc39","signingHash":"0xb3af96cfee896dbeadb5fb144b44cd0237007a0f5365f6c929238e06292aa3e1","serializedUnsignedSha256":"0x561ce21b43f81088edc3a267b3fd982b2291c773b26ced908a564a25dd44d6ec","reviewerApprovalDigest":"0xdf663922da6e931a5089092572dfc27d9a45f3203f0739ee0907270e643f5940","ownerAuthorizationDigest":"0x0a25545803a2959f84f0eda57ecf3b221b91dbfbca98ea2f81fbfbc1f10b339a","releaseCommit":"08f0357f1281c2289a1a0db9637e8fb082cb6900","runtimeManifestSha256":"0xe32a1dac70d52b095eb56a86bc1d49000faf9e17b0db5fab875c9bc9d0016a25","generation":8,"predecessorState":"failed_before_worker","predecessorTerminalRawSha256":"0x97bb22de4f86b517af0b517f6765d77896da7881708da6589d17703790abc3dc","attemptId":"0x56f61dd8b5b9de59659a1abbe1cb406c9fba77c8f30fc67716a5137363f99cff","recordedAt":"2026-08-26T02:10:56.694Z","gasLimit":"5983857","gasPriceWei":"100000000","maxCostWei":"598385700000000","authorizedAt":"2026-08-26T02:10:39.527Z","expiresAt":"2026-08-26T02:12:39.527Z"}\n';
const GENERATION_8_TERMINAL_RECORD =
  '{"schemaVersion":"bsc_testnet_pta_wbnb_pool_local_journal_v8","kind":"failed_before_worker","claimId":"pta-wbnb-pool-v8-23b6548d4d51891d83e27146b10ec79c","operationKey":"0xe6c943aa33e600bfc1770ee654ee6b00bf6dbcc7cc1702c58bd1caa64dadb9cc","envelopeHash":"0x41c926d396af39bb780b77e2296bc9c9855b86570be34d7ca6b8d6bfd34ff935","authorizationReceiptSha256":"0x3ff45d6924e0e5b98b97cea98e6f0d6b1326b47c0ad0a113e855582269c7dc39","signingHash":"0xb3af96cfee896dbeadb5fb144b44cd0237007a0f5365f6c929238e06292aa3e1","serializedUnsignedSha256":"0x561ce21b43f81088edc3a267b3fd982b2291c773b26ced908a564a25dd44d6ec","reviewerApprovalDigest":"0xdf663922da6e931a5089092572dfc27d9a45f3203f0739ee0907270e643f5940","ownerAuthorizationDigest":"0x0a25545803a2959f84f0eda57ecf3b221b91dbfbca98ea2f81fbfbc1f10b339a","releaseCommit":"08f0357f1281c2289a1a0db9637e8fb082cb6900","runtimeManifestSha256":"0xe32a1dac70d52b095eb56a86bc1d49000faf9e17b0db5fab875c9bc9d0016a25","generation":8,"predecessorState":"failed_before_worker","predecessorTerminalRawSha256":"0x97bb22de4f86b517af0b517f6765d77896da7881708da6589d17703790abc3dc","attemptId":"0x56f61dd8b5b9de59659a1abbe1cb406c9fba77c8f30fc67716a5137363f99cff","recordedAt":"2026-08-26T02:11:04.528Z","phase":"post_claim_recheck","issueCode":"GAS_POLICY_VIOLATION","outcomeDigest":"0x15b8bd2046fdac833c932d21deea39e7901bb97398622ad03e7625167e19d469"}\n';
const SOURCE = readFileSync(
  new URL("./bsc-testnet-pta-wbnb-pool-local-journal.server.ts", import.meta.url),
  "utf8"
);

it("admits the immutable generation-3 directory through the fixed Windows path allowlist", () => {
  expect(SOURCE).toContain("subdirectory !== GENERATION_3_JOURNAL_SUBDIRECTORY &&");
  expect(SOURCE).toContain("readOnlyFixedJournalDirectory(GENERATION_3_JOURNAL_SUBDIRECTORY)");
});

const hex32 = (byte: string): Hex => `0x${byte.repeat(64)}` as Hex;

const PROTECT_SYNTHETIC_PATH_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
  $path = ([Console]::In.ReadToEnd() | ConvertFrom-Json).path
  $current = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
  $item = Get-Item -LiteralPath $path -Force
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'reparse' }
  $existingAcl = Get-Acl -LiteralPath $item.FullName
  $existingOwner = try {
    ([System.Security.Principal.SecurityIdentifier]::new($existingAcl.Owner)).Value
  } catch {
    ([System.Security.Principal.NTAccount]::new($existingAcl.Owner)).Translate([System.Security.Principal.SecurityIdentifier]).Value
  }
  if ($existingOwner -ne $current.Value) { throw 'owner' }
  if ($item.PSIsContainer) {
    $inherit = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
    $acl = [System.Security.AccessControl.DirectorySecurity]::new()
    $acl.SetAccessRuleProtection($true, $false)
    [void]$acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($current,[System.Security.AccessControl.FileSystemRights]::FullControl,$inherit,[System.Security.AccessControl.PropagationFlags]::None,[System.Security.AccessControl.AccessControlType]::Allow))
    [IO.Directory]::SetAccessControl($item.FullName, $acl)
  } else {
    $acl = [System.Security.AccessControl.FileSecurity]::new()
    $acl.SetAccessRuleProtection($true, $false)
    [void]$acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($current,[System.Security.AccessControl.FileSystemRights]::FullControl,[System.Security.AccessControl.AccessControlType]::Allow))
    [IO.File]::SetAccessControl($item.FullName, $acl)
  }
  [Console]::Out.Write('{"ok":true}')
} catch { exit 73 }
`;

const SNAPSHOT_SYNTHETIC_ACL_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
  $path = ([Console]::In.ReadToEnd() | ConvertFrom-Json).path
  $acl = Get-Acl -LiteralPath $path
  [Console]::Out.Write((@{ owner = $acl.Owner; sddl = $acl.Sddl } | ConvertTo-Json -Compress))
} catch { exit 74 }
`;

async function syntheticPowerShell(script: string, path: string): Promise<string> {
  const input = Buffer.from(JSON.stringify({ path }), "utf8");
  let output: Buffer | null = null;
  try {
    output = (
      await runPinnedPowerShellForInternalUse(script, input, 4_096, new AbortController().signal)
    ).output;
    return new TextDecoder("utf-8", { fatal: true }).decode(output);
  } finally {
    input.fill(0);
    output?.fill(0);
  }
}

async function protectSynthetic(path: string): Promise<void> {
  expect(await syntheticPowerShell(PROTECT_SYNTHETIC_PATH_SCRIPT, path)).toBe('{"ok":true}');
}

async function createSyntheticDirectory(): Promise<string> {
  const directory = win32.normalize(await mkdtemp(join(tmpdir(), "proofera-local-journal-test-")));
  await protectSynthetic(directory);
  return directory;
}

async function cleanupSyntheticDirectory(directory: string): Promise<void> {
  const normalized = win32.normalize(directory);
  if (dirname(normalized).toLowerCase() !== win32.normalize(tmpdir()).toLowerCase()) {
    throw new Error("Synthetic journal cleanup escaped the OS temporary directory.");
  }
  await rm(normalized, { force: true, recursive: true });
}

async function snapshotSyntheticTree(directory: string): Promise<unknown> {
  const names = (await readdir(directory)).sort();
  const paths = [directory, ...names.map((name) => win32.join(directory, name))];
  const snapshots = [];
  for (const path of paths) {
    const metadata = await lstat(path, { bigint: true });
    snapshots.push(
      Object.freeze({
        path,
        mode: metadata.mode.toString(),
        size: metadata.size.toString(),
        nlink: metadata.nlink.toString(),
        mtimeNs: metadata.mtimeNs.toString(),
        ctimeNs: metadata.ctimeNs.toString(),
        birthtimeNs: metadata.birthtimeNs.toString(),
        acl: await syntheticPowerShell(SNAPSHOT_SYNTHETIC_ACL_SCRIPT, path)
      })
    );
  }
  return Object.freeze({ names: Object.freeze(names), snapshots: Object.freeze(snapshots) });
}

function exactTransaction() {
  const transaction = buildBscTestnetPtaWbnbPoolExactSigningTransaction({
    gasLimit: "1000000",
    gasPriceWei: "100000000",
    sourceEnvelopeHash: hex32("1")
  });
  if (transaction === null) throw new TypeError("invalid exact transaction fixture");
  return transaction;
}

function unsignedSha256(transaction: ReturnType<typeof exactTransaction>): Hex {
  return `0x${createHash("sha256")
    .update(Buffer.from(transaction.serializedUnsignedTransaction.slice(2), "hex"))
    .digest("hex")}`;
}

function claim(
  overrides: Partial<
    BscTestnetPtaWbnbPoolLegacyClaimRequestForTests & {
      generation: 9;
      predecessorState: "failed_before_worker";
      predecessorTerminalRawSha256: Hex;
      attemptId: Hex;
    }
  > = {}
) {
  const transaction = exactTransaction();
  const body = {
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    envelopeHash: hex32("1"),
    signingHash: transaction.signingHash,
    serializedUnsignedSha256: unsignedSha256(transaction),
    gasLimit: transaction.gasLimit,
    gasPriceWei: transaction.gasPriceWei,
    maxCostWei: transaction.maximumCostWei,
    reviewerApprovalDigest: hex32("4"),
    ownerAuthorizationDigest: hex32("5"),
    releaseCommit: "6".repeat(40),
    runtimeManifestSha256: hex32("7"),
    authorizedAt: "2026-08-13T10:00:00.000Z",
    expiresAt: "2026-08-13T10:01:00.000Z",
    ...overrides
  };
  return Object.freeze({
    ...body,
    authorizationReceiptSha256: deriveBscTestnetPtaWbnbPoolAuthorizationReceiptSha256(body)
  });
}

function workerExchange(request: BscTestnetPtaWbnbPoolLegacyClaimRequestForTests, token: Hex) {
  const recovery = Object.freeze({
    generation: BSC_TESTNET_PTA_WBNB_POOL_RECOVERY_GENERATION,
    predecessorState: "failed_before_worker" as const,
    predecessorTerminalRawSha256: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_TRANSITION_RAW_SHA256,
    attemptId: hex32("a")
  });
  const intent = Object.freeze({
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    envelopeHash: request.envelopeHash,
    reviewerApprovalDigest: request.reviewerApprovalDigest,
    ownerAuthorizationDigest: request.ownerAuthorizationDigest,
    claimId: binding(request).claimId,
    journalClaimToken: token,
    releaseCommit: request.releaseCommit,
    runtimeManifestSha256: request.runtimeManifestSha256,
    authenticatedAt: NOW,
    expiresAt: request.expiresAt,
    recovery,
    transaction: exactTransaction()
  }) satisfies BscTestnetPtaWbnbPoolValidatedSigningIntent;
  const workerRequest = buildBscTestnetPtaWbnbPoolSigningWorkerRequest(intent);
  const signedTransaction = serializeTransaction(
    {
      type: "legacy",
      chainId: 97,
      nonce: 9,
      gasPrice: BigInt(workerRequest.transaction.gasPriceWei),
      gas: BigInt(workerRequest.transaction.gasLimit),
      to: BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
      value: 0n,
      data: BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA
    },
    { r: "0x01", s: "0x02", v: 229n }
  );
  return Object.freeze({
    workerRequest,
    workerResponse: Object.freeze({
      schemaVersion: 9 as const,
      operation: BSC_TESTNET_PTA_WBNB_POOL_SIGNING_WORKER_OPERATION,
      status: "signed" as const,
      oneShotIntentId: BSC_TESTNET_PTA_WBNB_POOL_ONE_SHOT_INTENT_ID,
      operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
      claimId: workerRequest.claimId,
      journalClaimToken: token,
      releaseCommit: request.releaseCommit,
      runtimeManifestSha256: request.runtimeManifestSha256,
      requestHash: workerRequest.requestHash,
      signingHash: workerRequest.transaction.signingHash,
      signedTransaction,
      transactionHash: keccak256(signedTransaction)
    })
  });
}

function memoryPorts(initial: Readonly<Record<string, string>> = {}, now = NOW) {
  const files = new Map(Object.entries(initial));
  const calls: string[] = [];
  const ports: BscTestnetPtaWbnbPoolLocalJournalPorts = Object.freeze({
    now: () => new Date(now),
    listNames: async () => Object.freeze([...files.keys()].sort()),
    readBounded: async (name: string) => files.get(name) ?? null,
    createExclusive: async (name: string, content: string) => {
      calls.push(name);
      if (files.has(name)) return "exists" as const;
      files.set(name, content);
      return "created" as const;
    },
    createExclusiveFenceFromFactory: async (name: string, contentFactory: () => string) => {
      calls.push(name);
      if (files.has(name)) return "exists" as const;
      files.set(name, "");
      files.set(name, contentFactory());
      return "created" as const;
    },
    assertSecure: async (names: readonly string[]) =>
      Object.freeze({
        verified: true as const,
        ownerSid: "S-1-5-21-1",
        accessRulesProtected: true as const,
        currentUserOnlyFullControl: true as const,
        checkedPaths: names.length + 1
      })
  });
  return { ports, files, calls };
}

function exactNoEffectProof(
  overrides: Partial<BscTestnetPtaWbnbPoolNoEffectProof> = {}
): BscTestnetPtaWbnbPoolNoEffectProof {
  return Object.freeze({
    schemaVersion: 1,
    kind: "exact_fixed_dual_rpc_no_onchain_effect_after_claim_v1",
    operationKey: BSC_TESTNET_PTA_WBNB_POOL_OPERATION_KEY,
    envelopeHash: hex32("b"),
    observedAt: "2026-08-14T14:12:21.000Z",
    finalizedBlockNumber: "1",
    finalizedBlockHash: hex32("c"),
    finalizedBlockTimestamp: "1",
    latestNonce: "1",
    pendingNonce: "1",
    pendingPool: "0x0000000000000000000000000000000000000000",
    candidateCode: "0x",
    candidateNonce: "0",
    providerAgreementVerified: true,
    allRuntimeIdentitiesVerified: true,
    allEip1967SlotsZero: true,
    allProtocolBindingsVerified: true,
    feeTierVerified: true,
    simulationReturnPool: "0x30b07e82d7181a53Ae2EA98Cd08b6733Ffd831aE",
    submissionJournalPresence: "absent",
    ...overrides
  });
}

function binding(
  request: Pick<
    BscTestnetPtaWbnbPoolLegacyClaimRequestForTests,
    | "operationKey"
    | "envelopeHash"
    | "authorizationReceiptSha256"
    | "signingHash"
    | "serializedUnsignedSha256"
    | "reviewerApprovalDigest"
    | "ownerAuthorizationDigest"
    | "releaseCommit"
    | "runtimeManifestSha256"
  >
) {
  return {
    claimId: `pta-wbnb-pool-${request.operationKey.slice(2, 34)}`,
    operationKey: request.operationKey,
    envelopeHash: request.envelopeHash,
    authorizationReceiptSha256: request.authorizationReceiptSha256,
    signingHash: request.signingHash,
    serializedUnsignedSha256: request.serializedUnsignedSha256,
    reviewerApprovalDigest: request.reviewerApprovalDigest,
    ownerAuthorizationDigest: request.ownerAuthorizationDigest,
    releaseCommit: request.releaseCommit,
    runtimeManifestSha256: request.runtimeManifestSha256
  };
}

type DrivenStatus = "claimed" | "worker_authorized" | "worker_started" | "signed_committed";

async function driveTo(target: DrivenStatus) {
  const memory = memoryPorts();
  const journal = createBscTestnetPtaWbnbPoolLocalJournalCore(memory.ports);
  const request = claim();
  const exact = binding(request);
  const token = hex32("8");
  const exchange = workerExchange(request, token);
  const requestHash = exchange.workerRequest.requestHash;
  const serializedTransaction = exchange.workerResponse.signedTransaction;
  const transactionHash = exchange.workerResponse.transactionHash;
  await journal.claimExactInitialization(request);
  if (target !== "claimed") {
    await journal.authorizeWorker({
      ...exact,
      workerRequestHash: requestHash,
      authorizationTokenDigest: keccak256(token)
    });
  }
  if (target !== "claimed" && target !== "worker_authorized") {
    await journal.startWorker({
      ...exact,
      workerRequestHash: requestHash,
      authorizationToken: token
    });
  }
  if (target !== "claimed" && target !== "worker_authorized" && target !== "worker_started") {
    await journal.commitWorkerSignedTransaction(exchange.workerRequest, exchange.workerResponse);
  }
  return {
    memory,
    journal,
    request,
    exact,
    token,
    requestHash,
    workerRequest: exchange.workerRequest,
    workerResponse: exchange.workerResponse,
    serializedTransaction,
    transactionHash
  };
}

describe("PTA/WBNB pool local append-only journal", () => {
  it("retains exact generation-4 terminal bytes as immutable history", async () => {
    expect(Buffer.byteLength(GENERATION_4_CLAIM_RECORD, "utf8")).toBe(1_362);
    expect(Buffer.byteLength(GENERATION_4_TERMINAL_RECORD, "utf8")).toBe(1_381);
    expect(`0x${createHash("sha256").update(GENERATION_4_CLAIM_RECORD).digest("hex")}`).toBe(
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_CLAIM_RAW_SHA256
    );
    expect(`0x${createHash("sha256").update(GENERATION_4_TERMINAL_RECORD).digest("hex")}`).toBe(
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_TRANSITION_RAW_SHA256
    );
    const exact = createBscTestnetPtaWbnbPoolLocalJournalCore(
      memoryPorts({
        "01-claim.v4.json": GENERATION_4_CLAIM_RECORD,
        "02-transition.v4.json": GENERATION_4_TERMINAL_RECORD
      }).ports,
      4
    );
    await expect(exact.readStrictRecoveryState()).resolves.toMatchObject({
      status: "failed_before_worker",
      generation: 4,
      predecessorState: "superseded_before_worker",
      predecessorFenceSha256: "0x9fa84a9cf79373dd1ccfd5217bb0159cb6e97f6821489d9a1afbc0c5df258f2e"
    });
    await expect(exact.readExactTerminalRecoveryBinding()).resolves.toBeNull();

    for (const [name, changed] of [
      ["01-claim.v4.json", GENERATION_4_CLAIM_RECORD.replace("d160530", "e160530")],
      ["02-transition.v4.json", GENERATION_4_TERMINAL_RECORD.replace("23468d2b", "33468d2b")]
    ] as const) {
      const contaminated = createBscTestnetPtaWbnbPoolLocalJournalCore(
        memoryPorts({
          "01-claim.v4.json": name === "01-claim.v4.json" ? changed : GENERATION_4_CLAIM_RECORD,
          "02-transition.v4.json":
            name === "02-transition.v4.json" ? changed : GENERATION_4_TERMINAL_RECORD
        }).ports,
        4
      );
      await expect(contaminated.readStrictRecoveryState()).resolves.toBeNull();
      await expect(contaminated.readExactTerminalRecoveryBinding()).resolves.toBeNull();
    }
  });

  it("retains only the exact generation-5 failed-before-worker historical bytes", async () => {
    expect(Buffer.byteLength(GENERATION_5_CLAIM_RECORD, "utf8")).toBe(1_364);
    expect(Buffer.byteLength(GENERATION_5_TERMINAL_RECORD, "utf8")).toBe(1_383);
    expect(`0x${createHash("sha256").update(GENERATION_5_CLAIM_RECORD).digest("hex")}`).toBe(
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_CLAIM_RAW_SHA256
    );
    expect(`0x${createHash("sha256").update(GENERATION_5_TERMINAL_RECORD).digest("hex")}`).toBe(
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_TRANSITION_RAW_SHA256
    );
    const exact = createBscTestnetPtaWbnbPoolLocalJournalCore(
      memoryPorts({
        "01-claim.v5.json": GENERATION_5_CLAIM_RECORD,
        "02-transition.v5.json": GENERATION_5_TERMINAL_RECORD
      }).ports,
      5
    );
    await expect(exact.readStrictRecoveryState()).resolves.toMatchObject({
      status: "failed_before_worker",
      generation: 5,
      predecessorState: "failed_before_worker",
      predecessorTerminalRawSha256: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_4_TRANSITION_RAW_SHA256
    });
    await expect(exact.readExactTerminalRecoveryBinding()).resolves.toBeNull();
    for (const [name, changed] of [
      ["01-claim.v5.json", GENERATION_5_CLAIM_RECORD.replace("e8f3f5b", "f8f3f5b")],
      ["02-transition.v5.json", GENERATION_5_TERMINAL_RECORD.replace("7db76f90", "8db76f90")]
    ] as const) {
      const contaminated = createBscTestnetPtaWbnbPoolLocalJournalCore(
        memoryPorts({
          "01-claim.v5.json": name === "01-claim.v5.json" ? changed : GENERATION_5_CLAIM_RECORD,
          "02-transition.v5.json":
            name === "02-transition.v5.json" ? changed : GENERATION_5_TERMINAL_RECORD
        }).ports,
        5
      );
      await expect(contaminated.readStrictRecoveryState()).resolves.toBeNull();
      await expect(contaminated.readExactTerminalRecoveryBinding()).resolves.toBeNull();
    }
  });

  it("opens only the exact generation-6 failed-before-worker predecessor terminal bytes", async () => {
    expect(Buffer.byteLength(GENERATION_6_CLAIM_RECORD, "utf8")).toBe(1_364);
    expect(Buffer.byteLength(GENERATION_6_TERMINAL_RECORD, "utf8")).toBe(1_383);
    expect(`0x${createHash("sha256").update(GENERATION_6_CLAIM_RECORD).digest("hex")}`).toBe(
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_CLAIM_RAW_SHA256
    );
    expect(`0x${createHash("sha256").update(GENERATION_6_TERMINAL_RECORD).digest("hex")}`).toBe(
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_TRANSITION_RAW_SHA256
    );
    const exact = createBscTestnetPtaWbnbPoolLocalJournalCore(
      memoryPorts({
        "01-claim.v6.json": GENERATION_6_CLAIM_RECORD,
        "02-transition.v6.json": GENERATION_6_TERMINAL_RECORD
      }).ports,
      6
    );
    await expect(exact.readStrictRecoveryState()).resolves.toMatchObject({
      status: "failed_before_worker",
      generation: 6,
      predecessorState: "failed_before_worker",
      predecessorTerminalRawSha256: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_5_TRANSITION_RAW_SHA256
    });
    await expect(exact.readExactTerminalRecoveryBinding()).resolves.toBeNull();
    for (const [name, changed] of [
      ["01-claim.v6.json", GENERATION_6_CLAIM_RECORD.replace("1655d39", "2655d39")],
      ["02-transition.v6.json", GENERATION_6_TERMINAL_RECORD.replace("fbece16f", "abece16f")]
    ] as const) {
      const contaminated = createBscTestnetPtaWbnbPoolLocalJournalCore(
        memoryPorts({
          "01-claim.v6.json": name === "01-claim.v6.json" ? changed : GENERATION_6_CLAIM_RECORD,
          "02-transition.v6.json":
            name === "02-transition.v6.json" ? changed : GENERATION_6_TERMINAL_RECORD
        }).ports,
        6
      );
      await expect(contaminated.readStrictRecoveryState()).resolves.toBeNull();
      await expect(contaminated.readExactTerminalRecoveryBinding()).resolves.toBeNull();
    }
  });

  it("retains only the exact generation-7 failed-before-worker historical bytes", async () => {
    expect(Buffer.byteLength(GENERATION_7_CLAIM_RECORD, "utf8")).toBe(1_364);
    expect(Buffer.byteLength(GENERATION_7_TERMINAL_RECORD, "utf8")).toBe(1_383);
    expect(`0x${createHash("sha256").update(GENERATION_7_CLAIM_RECORD).digest("hex")}`).toBe(
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_CLAIM_RAW_SHA256
    );
    expect(`0x${createHash("sha256").update(GENERATION_7_TERMINAL_RECORD).digest("hex")}`).toBe(
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_TRANSITION_RAW_SHA256
    );
    const exact = createBscTestnetPtaWbnbPoolLocalJournalCore(
      memoryPorts({
        "01-claim.v7.json": GENERATION_7_CLAIM_RECORD,
        "02-transition.v7.json": GENERATION_7_TERMINAL_RECORD
      }).ports,
      7
    );
    await expect(exact.readStrictRecoveryState()).resolves.toMatchObject({
      status: "failed_before_worker",
      generation: 7,
      predecessorState: "failed_before_worker",
      predecessorTerminalRawSha256: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_6_TRANSITION_RAW_SHA256
    });
    await expect(exact.readExactTerminalRecoveryBinding()).resolves.toBeNull();
    for (const [name, changed] of [
      ["01-claim.v7.json", GENERATION_7_CLAIM_RECORD.replace("dbd4950", "cbd4950")],
      ["02-transition.v7.json", GENERATION_7_TERMINAL_RECORD.replace("62e2b9de", "72e2b9de")]
    ] as const) {
      const contaminated = createBscTestnetPtaWbnbPoolLocalJournalCore(
        memoryPorts({
          "01-claim.v7.json": name === "01-claim.v7.json" ? changed : GENERATION_7_CLAIM_RECORD,
          "02-transition.v7.json":
            name === "02-transition.v7.json" ? changed : GENERATION_7_TERMINAL_RECORD
        }).ports,
        7
      );
      await expect(contaminated.readStrictRecoveryState()).resolves.toBeNull();
      await expect(contaminated.readExactTerminalRecoveryBinding()).resolves.toBeNull();
    }
  });

  it("opens only the exact generation-8 GAS_POLICY_VIOLATION predecessor terminal bytes", async () => {
    expect(Buffer.byteLength(GENERATION_8_CLAIM_RECORD, "utf8")).toBe(1_364);
    expect(Buffer.byteLength(GENERATION_8_TERMINAL_RECORD, "utf8")).toBe(1_369);
    expect(`0x${createHash("sha256").update(GENERATION_8_CLAIM_RECORD).digest("hex")}`).toBe(
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_CLAIM_RAW_SHA256
    );
    expect(`0x${createHash("sha256").update(GENERATION_8_TERMINAL_RECORD).digest("hex")}`).toBe(
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_TRANSITION_RAW_SHA256
    );
    const exact = createBscTestnetPtaWbnbPoolLocalJournalCore(
      memoryPorts({
        "01-claim.v8.json": GENERATION_8_CLAIM_RECORD,
        "02-transition.v8.json": GENERATION_8_TERMINAL_RECORD
      }).ports,
      8
    );
    await expect(exact.readStrictRecoveryState()).resolves.toMatchObject({
      status: "failed_before_worker",
      generation: 8,
      predecessorState: "failed_before_worker",
      predecessorTerminalRawSha256: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_TRANSITION_RAW_SHA256
    });
    await expect(exact.readExactTerminalRecoveryBinding()).resolves.toMatchObject({
      status: "failed_before_worker",
      generation: 8,
      predecessorClaimRawSha256: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_CLAIM_RAW_SHA256,
      predecessorTerminalRawSha256: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_TRANSITION_RAW_SHA256,
      inheritedPredecessorTerminalRawSha256:
        BSC_TESTNET_PTA_WBNB_POOL_GENERATION_7_TRANSITION_RAW_SHA256,
      phase: "post_claim_recheck",
      issueCode: "GAS_POLICY_VIOLATION",
      workerAuthorizationOutcome: "not_attempted",
      workerStartOutcome: "not_attempted",
      signatureOutcome: "not_attempted"
    });
    for (const [name, changed] of [
      ["01-claim.v8.json", GENERATION_8_CLAIM_RECORD.replace("08f0357", "18f0357")],
      ["02-transition.v8.json", GENERATION_8_TERMINAL_RECORD.replace("15b8bd20", "25b8bd20")]
    ] as const) {
      const contaminated = createBscTestnetPtaWbnbPoolLocalJournalCore(
        memoryPorts({
          "01-claim.v8.json": name === "01-claim.v8.json" ? changed : GENERATION_8_CLAIM_RECORD,
          "02-transition.v8.json":
            name === "02-transition.v8.json" ? changed : GENERATION_8_TERMINAL_RECORD
        }).ports,
        8
      );
      await expect(contaminated.readStrictRecoveryState()).resolves.toBeNull();
      await expect(contaminated.readExactTerminalRecoveryBinding()).resolves.toBeNull();
    }
  });

  it("fences only the exact incident claim after expiry and makes the predecessor terminal", async () => {
    expect(Buffer.byteLength(LEGACY_CLAIM_RECORD, "utf8")).toBe(1_123);
    expect(`0x${createHash("sha256").update(LEGACY_CLAIM_RECORD, "utf8").digest("hex")}`).toBe(
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_1_CLAIM_RAW_SHA256
    );

    const memory = memoryPorts(
      { "01-claim.v1.json": LEGACY_CLAIM_RECORD },
      "2026-08-14T14:12:22.000Z"
    );
    const journal = createBscTestnetPtaWbnbPoolLocalJournalCore(memory.ports, 1);
    const candidate = await journal.readClaimOnlyRecoveryCandidate();
    expect(candidate).toMatchObject({
      status: "claimed",
      predecessorClaimRawSha256: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_1_CLAIM_RAW_SHA256,
      predecessorAuthorizationExpiresAt: "2026-08-14T14:12:20.280Z"
    });
    if (candidate === null) throw new TypeError("exact incident fixture was not recognized");
    const proof = exactNoEffectProof();
    const proofDigest = deriveBscTestnetPtaWbnbPoolNoEffectProofDigest(proof);
    const fence = await journal.fenceClaimBeforeWorker(
      Object.freeze({
        expectedPredecessorClaimRawSha256: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_1_CLAIM_RAW_SHA256,
        proof
      })
    );
    expect(fence).toMatchObject({
      status: "superseded_before_worker",
      terminalCode: "POST_CLAIM_RECHECK_OUTCOME_UNKNOWN",
      workerAuthorizationOutcome: "not_attempted",
      workerStartOutcome: "not_attempted",
      signatureOutcome: "not_attempted",
      submissionOutcome: "not_attempted",
      submissionJournalState: "exact_empty",
      predecessorClaimRawSha256: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_1_CLAIM_RAW_SHA256,
      noEffectProofDigest: proofDigest,
      noEffectEnvelopeHash: proof.envelopeHash,
      noEffectObservedAt: proof.observedAt,
      fenceRecordedAt: "2026-08-14T14:12:22.000Z"
    });
    await expect(journal.readClaimOnlyRecoveryCandidate()).resolves.toBeNull();
    await expect(
      journal.authorizeWorker({
        ...binding(candidate),
        workerRequestHash: hex32("d"),
        authorizationTokenDigest: hex32("e")
      })
    ).rejects.toThrow("STATE_MISMATCH");
    await expect(
      journal.recordUnknownOutcome({ ...binding(candidate), outcomeDigest: hex32("f") })
    ).rejects.toThrow("STATE_MISMATCH");
    expect(memory.files.size).toBe(2);
    await expect(journal.readStrictRecoveryState()).resolves.toMatchObject({
      status: "superseded_before_worker",
      supersessionFence: fence
    });
  });

  it("preserves and fences the exact generation-2 incident bytes", async () => {
    expect(Buffer.byteLength(GENERATION_2_CLAIM_RECORD, "utf8")).toBe(1_362);
    expect(
      `0x${createHash("sha256").update(GENERATION_2_CLAIM_RECORD, "utf8").digest("hex")}`
    ).toBe(BSC_TESTNET_PTA_WBNB_POOL_GENERATION_2_CLAIM_RAW_SHA256);

    const memory = memoryPorts(
      { "01-claim.v2.json": GENERATION_2_CLAIM_RECORD },
      "2026-08-15T01:43:47.000Z"
    );
    const journal = createBscTestnetPtaWbnbPoolLocalJournalCore(memory.ports, 2);
    const candidate = await journal.readClaimOnlyRecoveryCandidate();
    expect(candidate).toMatchObject({
      status: "claimed",
      predecessorClaimRawSha256: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_2_CLAIM_RAW_SHA256,
      predecessorClaimRecordedAt: "2026-08-15T01:43:22.469Z",
      predecessorAuthorizationExpiresAt: "2026-08-15T01:43:45.368Z"
    });
    if (candidate === null) throw new TypeError("exact generation-2 incident was not recognized");

    const proof = exactNoEffectProof({ observedAt: "2026-08-15T01:43:46.000Z" });
    const fence = await journal.fenceClaimBeforeWorker(
      Object.freeze({
        expectedPredecessorClaimRawSha256: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_2_CLAIM_RAW_SHA256,
        proof
      })
    );
    expect(fence).toMatchObject({
      status: "superseded_before_worker",
      predecessorClaimRawSha256: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_2_CLAIM_RAW_SHA256,
      submissionJournalState: "exact_empty",
      workerAuthorizationOutcome: "not_attempted",
      workerStartOutcome: "not_attempted",
      signatureOutcome: "not_attempted",
      submissionOutcome: "not_attempted"
    });
    expect(memory.calls).toEqual(["02-transition.v2.json"]);
    await expect(journal.readStrictRecoveryState()).resolves.toMatchObject({
      status: "superseded_before_worker",
      generation: 2,
      supersessionFence: fence
    });
    await expect(journal.readClaimOnlyRecoveryCandidate()).resolves.toBeNull();
  });

  it("pins and fences the exact generation-3 predecessor without changing its inherited gen2 fence", async () => {
    expect(Buffer.byteLength(GENERATION_3_CLAIM_RECORD, "utf8")).toBe(1_362);
    expect(
      `0x${createHash("sha256").update(GENERATION_3_CLAIM_RECORD, "utf8").digest("hex")}`
    ).toBe(BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3_CLAIM_RAW_SHA256);
    expect(BSC_TESTNET_PTA_WBNB_POOL_PREDECESSOR_CLAIM_RAW_SHA256).toBe(
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_CLAIM_RAW_SHA256
    );
    const memory = memoryPorts(
      { "01-claim.v3.json": GENERATION_3_CLAIM_RECORD },
      "2026-08-15T05:41:28.000Z"
    );
    const journal = createBscTestnetPtaWbnbPoolLocalJournalCore(memory.ports, 3);
    const candidate = await journal.readClaimOnlyRecoveryCandidate();
    expect(candidate).toMatchObject({
      status: "claimed",
      generation: 3,
      predecessorFenceSha256: "0x50a27df83195bb1d4f3ba7c072f5909c7bda7600efff75e82f286a74fe0ee89e",
      predecessorClaimRawSha256: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3_CLAIM_RAW_SHA256
    });
    if (candidate === null) throw new TypeError("exact generation-3 claim was not recognized");
    const proof = exactNoEffectProof({ observedAt: "2026-08-15T05:41:27.000Z" });
    const fence = await journal.fenceClaimBeforeWorker(
      Object.freeze({
        expectedPredecessorClaimRawSha256: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_3_CLAIM_RAW_SHA256,
        proof
      })
    );
    expect(memory.calls).toEqual(["02-transition.v3.json"]);
    expect(memory.files.get("02-transition.v3.json")).toContain(
      '"schemaVersion":"bsc_testnet_pta_wbnb_pool_pre_worker_supersession_fence_v3"'
    );
    expect(memory.files.get("02-transition.v3.json")).toContain(
      '"ancestorFenceSha256":"0x50a27df83195bb1d4f3ba7c072f5909c7bda7600efff75e82f286a74fe0ee89e"'
    );
    expect(fence.predecessorFenceSha256).not.toBe(candidate.predecessorFenceSha256);
    await expect(journal.readStrictRecoveryState()).resolves.toMatchObject({
      status: "superseded_before_worker",
      generation: 3,
      supersessionFence: fence
    });
  });

  it("lets a stale worker authorization win slot 2 only by permanently blocking supersession", async () => {
    const memory = memoryPorts(
      { "01-claim.v1.json": LEGACY_CLAIM_RECORD },
      "2026-08-14T14:12:22.000Z"
    );
    const journal = createBscTestnetPtaWbnbPoolLocalJournalCore(memory.ports, 1);
    const candidate = await journal.readClaimOnlyRecoveryCandidate();
    if (candidate === null) throw new TypeError("exact incident fixture was not recognized");
    await journal.authorizeWorker({
      ...binding(candidate),
      workerRequestHash: hex32("d"),
      authorizationTokenDigest: hex32("e")
    });
    await expect(
      journal.fenceClaimBeforeWorker(
        Object.freeze({
          expectedPredecessorClaimRawSha256:
            BSC_TESTNET_PTA_WBNB_POOL_GENERATION_1_CLAIM_RAW_SHA256,
          proof: exactNoEffectProof()
        })
      )
    ).rejects.toThrow("PERMANENTLY_BLOCKED");
    await expect(journal.readState()).resolves.toMatchObject({ status: "worker_authorized" });
    expect(memory.calls).toEqual(["02-transition.v1.json"]);
  });

  it("aborts the current fence caller on O_EXCL exists even when retained bytes are exact", async () => {
    const memory = memoryPorts(
      { "01-claim.v1.json": LEGACY_CLAIM_RECORD },
      "2026-08-14T14:12:22.000Z"
    );
    const racingPorts: BscTestnetPtaWbnbPoolLocalJournalPorts = Object.freeze({
      ...memory.ports,
      createExclusiveFenceFromFactory: async (name: string, contentFactory: () => string) => {
        if (name !== "02-transition.v1.json") throw new TypeError("unexpected slot");
        memory.files.set(name, contentFactory());
        return "exists" as const;
      }
    });
    const journal = createBscTestnetPtaWbnbPoolLocalJournalCore(racingPorts, 1);
    await expect(
      journal.fenceClaimBeforeWorker(
        Object.freeze({
          expectedPredecessorClaimRawSha256:
            BSC_TESTNET_PTA_WBNB_POOL_GENERATION_1_CLAIM_RAW_SHA256,
          proof: exactNoEffectProof()
        })
      )
    ).rejects.toThrow("OUTCOME_UNKNOWN");
    await expect(journal.readStrictRecoveryState()).resolves.toMatchObject({
      status: "superseded_before_worker"
    });
  });

  it("rejects an already-stale proof before reserving slot 2", async () => {
    const memory = memoryPorts(
      { "01-claim.v1.json": LEGACY_CLAIM_RECORD },
      "2026-08-14T14:12:22.000Z"
    );
    let stalled = false;
    const createFence = vi.fn(memory.ports.createExclusiveFenceFromFactory);
    const staleBeforeReservation: BscTestnetPtaWbnbPoolLocalJournalPorts = Object.freeze({
      ...memory.ports,
      now: () => new Date(stalled ? "2026-08-14T14:14:21.001Z" : "2026-08-14T14:12:22.000Z"),
      assertSecure: async (names: readonly string[]) => {
        const result = await memory.ports.assertSecure(names);
        // Simulates the strict snapshot/ACL read completing only after snapshot A has become stale.
        stalled = true;
        return result;
      },
      createExclusiveFenceFromFactory: createFence
    });
    const journal = createBscTestnetPtaWbnbPoolLocalJournalCore(staleBeforeReservation, 1);

    await expect(
      journal.fenceClaimBeforeWorker(
        Object.freeze({
          expectedPredecessorClaimRawSha256:
            BSC_TESTNET_PTA_WBNB_POOL_GENERATION_1_CLAIM_RAW_SHA256,
          proof: exactNoEffectProof()
        })
      )
    ).rejects.toThrow("PROOF_INVALID");
    expect(createFence).not.toHaveBeenCalled();
    expect(memory.files.has("02-transition.v1.json")).toBe(false);
    expect(memory.calls).toEqual([]);
    await expect(journal.readStrictRecoveryState()).resolves.toMatchObject({ status: "claimed" });
    await expect(journal.readClaimOnlyRecoveryCandidate()).resolves.not.toBeNull();
  });

  it("rechecks proof age after O_EXCL reservation and blocks a stale resumed proof", async () => {
    const memory = memoryPorts(
      { "01-claim.v1.json": LEGACY_CLAIM_RECORD },
      "2026-08-14T14:12:22.000Z"
    );
    let reserved = false;
    let clockCalls = 0;
    const stalledBeforeReservation: BscTestnetPtaWbnbPoolLocalJournalPorts = Object.freeze({
      ...memory.ports,
      now: () => {
        clockCalls += 1;
        return new Date(reserved ? "2026-08-14T14:14:21.001Z" : "2026-08-14T14:12:22.000Z");
      },
      createExclusiveFenceFromFactory: async (name: string, contentFactory: () => string) => {
        if (name !== "02-transition.v1.json") throw new TypeError("unexpected slot");
        memory.calls.push(name);
        if (memory.files.has(name)) return "exists" as const;
        // Simulates a process suspended after the precheck but before the kernel reservation. The
        // decisive fence time is recaptured after this point, so stale proof bytes cannot survive.
        reserved = true;
        memory.files.set(name, "");
        memory.files.set(name, contentFactory());
        return "created" as const;
      }
    });
    const journal = createBscTestnetPtaWbnbPoolLocalJournalCore(stalledBeforeReservation, 1);
    const request = Object.freeze({
      expectedPredecessorClaimRawSha256: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_1_CLAIM_RAW_SHA256,
      proof: exactNoEffectProof()
    });

    await expect(journal.fenceClaimBeforeWorker(request)).rejects.toThrow("PROOF_INVALID");
    expect(clockCalls).toBe(2);
    expect(memory.files.has("02-transition.v1.json")).toBe(true);
    expect(memory.files.get("02-transition.v1.json")).toBe("");
    expect(memory.calls).toEqual(["02-transition.v1.json"]);
    await expect(journal.readStrictRecoveryState()).resolves.toBeNull();
    const restarted = createBscTestnetPtaWbnbPoolLocalJournalCore(memory.ports, 1);
    await expect(restarted.readStrictRecoveryState()).resolves.toBeNull();
  });

  it("leaves a crash after O_EXCL reservation as a strict restart block", async () => {
    const memory = memoryPorts(
      { "01-claim.v1.json": LEGACY_CLAIM_RECORD },
      "2026-08-14T14:12:22.000Z"
    );
    const crashAfterReservation: BscTestnetPtaWbnbPoolLocalJournalPorts = Object.freeze({
      ...memory.ports,
      createExclusiveFenceFromFactory: async (name: string) => {
        if (name !== "02-transition.v1.json") throw new TypeError("unexpected slot");
        memory.calls.push(name);
        memory.files.set(name, "");
        throw new Error("synthetic-crash-after-reservation");
      }
    });
    const journal = createBscTestnetPtaWbnbPoolLocalJournalCore(crashAfterReservation, 1);

    await expect(
      journal.fenceClaimBeforeWorker(
        Object.freeze({
          expectedPredecessorClaimRawSha256:
            BSC_TESTNET_PTA_WBNB_POOL_GENERATION_1_CLAIM_RAW_SHA256,
          proof: exactNoEffectProof()
        })
      )
    ).rejects.toThrow("synthetic-crash-after-reservation");
    expect(memory.files.get("02-transition.v1.json")).toBe("");
    expect(memory.calls).toEqual(["02-transition.v1.json"]);
    const restarted = createBscTestnetPtaWbnbPoolLocalJournalCore(memory.ports, 1);
    await expect(restarted.readStrictRecoveryState()).resolves.toBeNull();
    await expect(restarted.readClaimOnlyRecoveryCandidate()).resolves.toBeNull();
  });

  it("rejects noncanonical, stale, pre-expiry, or unbounded no-effect proof fields", async () => {
    const invalidProofs = [
      exactNoEffectProof({ observedAt: "2026-08-14T14:12:20.000Z" }),
      exactNoEffectProof({ candidateNonce: "1" as "0" }),
      exactNoEffectProof({ submissionJournalPresence: "present" as "absent" }),
      exactNoEffectProof({ finalizedBlockNumber: "18446744073709551616" }),
      exactNoEffectProof({ finalizedBlockTimestamp: "9999999999999999999" })
    ];
    for (const proof of invalidProofs) {
      const memory = memoryPorts(
        { "01-claim.v1.json": LEGACY_CLAIM_RECORD },
        "2026-08-14T14:12:22.000Z"
      );
      const journal = createBscTestnetPtaWbnbPoolLocalJournalCore(memory.ports, 1);
      await expect(
        journal.fenceClaimBeforeWorker(
          Object.freeze({
            expectedPredecessorClaimRawSha256:
              BSC_TESTNET_PTA_WBNB_POOL_GENERATION_1_CLAIM_RAW_SHA256,
            proof
          })
        )
      ).rejects.toThrow();
      expect(memory.files.size).toBe(1);
    }
  });

  it("uses a distinct active generation-9 schema, receipt domain, recovery binding, and claim id", async () => {
    const recovery = Object.freeze({
      generation: 9 as const,
      predecessorState: "failed_before_worker" as const,
      predecessorTerminalRawSha256: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_TRANSITION_RAW_SHA256,
      attemptId: hex32("a")
    });
    const request = claim(recovery);
    const memory = memoryPorts();
    const journal = createBscTestnetPtaWbnbPoolLocalJournalCore(memory.ports, 9);
    const result = await journal.claimExactInitialization(request);
    expect(result).toMatchObject({ status: "claimed" });
    expect(result.claimId).toMatch(/^pta-wbnb-pool-v9-[0-9a-f]{32}$/u);
    expect(result.claimId).not.toBe(binding(claim()).claimId);
    expect(request.authorizationReceiptSha256).not.toBe(claim().authorizationReceiptSha256);
    expect(memory.files.get("01-claim.v9.json")).toContain(
      '"schemaVersion":"bsc_testnet_pta_wbnb_pool_local_journal_v9"'
    );
    await expect(journal.readState()).resolves.toMatchObject({
      status: "claimed",
      generation: 9,
      predecessorState: recovery.predecessorState,
      predecessorTerminalRawSha256: recovery.predecessorTerminalRawSha256,
      attemptId: recovery.attemptId
    });
    await expect(
      createBscTestnetPtaWbnbPoolLocalJournalCore(memoryPorts().ports, 9).claimExactInitialization(
        claim()
      )
    ).rejects.toThrow("INPUT_INVALID");
    await expect(
      createBscTestnetPtaWbnbPoolLocalJournalCore(memoryPorts().ports, 1).claimExactInitialization(
        request
      )
    ).rejects.toThrow("INPUT_INVALID");

    const changedAttempt = await createBscTestnetPtaWbnbPoolLocalJournalCore(
      memoryPorts().ports,
      9
    ).claimExactInitialization(claim({ ...recovery, attemptId: hex32("b") }));
    expect(changedAttempt.claimId).not.toBe(result.claimId);
    await expect(
      createBscTestnetPtaWbnbPoolLocalJournalCore(memoryPorts().ports, 9).claimExactInitialization(
        claim({ ...recovery, predecessorTerminalRawSha256: hex32("c") })
      )
    ).rejects.toThrow("INPUT_INVALID");
  });

  it("durably terminalizes a known post-claim failure in active slot 2 before worker authorization", async () => {
    const recovery = Object.freeze({
      generation: 9 as const,
      predecessorState: "failed_before_worker" as const,
      predecessorTerminalRawSha256: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_TRANSITION_RAW_SHA256,
      attemptId: hex32("a")
    });
    const request = claim(recovery);
    const memory = memoryPorts();
    const journal = createBscTestnetPtaWbnbPoolLocalJournalCore(memory.ports, 9);
    const claimed = await journal.claimExactInitialization(request);
    const outcomeDigest = deriveBscTestnetPtaWbnbPoolFailedBeforeWorkerOutcomeDigest(
      Object.freeze({
        phase: "post_claim_recheck",
        issueCode: "EXECUTION_AUTHORITY_EXPIRED",
        evidenceDigest: hex32("b")
      })
    );
    if (outcomeDigest === null) throw new TypeError("diagnostic digest fixture failed");
    const exactBinding = {
      ...binding(request),
      claimId: claimed.claimId,
      ...recovery
    };
    await expect(
      journal.failBeforeWorker(
        Object.freeze({
          ...exactBinding,
          phase: "post_claim_recheck" as const,
          issueCode: "EXECUTION_AUTHORITY_EXPIRED" as const,
          outcomeDigest
        })
      )
    ).resolves.toEqual({ status: "failed_before_worker" });
    expect(memory.calls).toEqual(["01-claim.v9.json", "02-transition.v9.json"]);
    expect(memory.files.get("02-transition.v9.json")).toContain('"kind":"failed_before_worker"');
    await expect(journal.readStrictRecoveryState()).resolves.toMatchObject({
      status: "failed_before_worker",
      generation: 9,
      serializedTransaction: null,
      transactionHash: null
    });
    await expect(
      journal.authorizeWorker({
        ...exactBinding,
        workerRequestHash: hex32("c"),
        authorizationTokenDigest: hex32("d")
      })
    ).rejects.toThrow("STATE_MISMATCH");
    await expect(
      createBscTestnetPtaWbnbPoolLocalJournalCore(memory.ports, 9).readStrictRecoveryState()
    ).resolves.toMatchObject({ status: "failed_before_worker" });
  });

  it("claims once and returns every immutable recovery binding", async () => {
    const memory = memoryPorts();
    const journal = createBscTestnetPtaWbnbPoolLocalJournalCore(memory.ports);
    const request = claim();
    await expect(journal.claimExactInitialization(request)).resolves.toMatchObject({
      status: "claimed",
      claimId: binding(request).claimId
    });
    await expect(journal.readState()).resolves.toEqual({
      status: "claimed",
      ...binding(request),
      generation: 1,
      predecessorState: null,
      predecessorFenceSha256: null,
      predecessorTerminalRawSha256: null,
      attemptId: null,
      gasLimit: request.gasLimit,
      gasPriceWei: request.gasPriceWei,
      maxCostWei: request.maxCostWei,
      authorizedAt: request.authorizedAt,
      expiresAt: request.expiresAt,
      serializedTransaction: null,
      transactionHash: null,
      supersessionFence: null
    });
    await expect(journal.claimExactInitialization(request)).resolves.toMatchObject({
      status: "already_claimed",
      state: "claimed"
    });
    expect(memory.calls).toEqual(["01-claim.v1.json"]);
  });

  it("collapses concurrent claims to exactly one exclusive winner", async () => {
    const memory = memoryPorts();
    const journal = createBscTestnetPtaWbnbPoolLocalJournalCore(memory.ports);
    const outcomes = await Promise.all([
      journal.claimExactInitialization(claim()),
      journal.claimExactInitialization(claim())
    ]);
    expect(outcomes.map((result) => result.status).sort()).toEqual(["already_claimed", "claimed"]);
    expect(memory.files.size).toBe(1);
  });

  it("allows one winner among sixteen concurrent claim, authorize, and start attempts", async () => {
    const memory = memoryPorts();
    const journal = createBscTestnetPtaWbnbPoolLocalJournalCore(memory.ports);
    const request = claim();
    const exact = binding(request);
    const token = hex32("8");
    const requestHash = hex32("9");
    const claims = await Promise.all(
      Array.from({ length: 16 }, () => journal.claimExactInitialization(request))
    );
    expect(claims.filter((result) => result.status === "claimed")).toHaveLength(1);

    const authorizations = await Promise.allSettled(
      Array.from({ length: 16 }, () =>
        journal.authorizeWorker({
          ...exact,
          workerRequestHash: requestHash,
          authorizationTokenDigest: keccak256(token)
        })
      )
    );
    expect(authorizations.filter((result) => result.status === "fulfilled")).toHaveLength(1);

    const starts = await Promise.allSettled(
      Array.from({ length: 16 }, () =>
        journal.startWorker({
          ...exact,
          workerRequestHash: requestHash,
          authorizationToken: token
        })
      )
    );
    expect(starts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    await expect(journal.readState()).resolves.toMatchObject({ status: "worker_started" });
    expect(memory.files.size).toBe(3);
  });

  it("accepts only protocol-validated worker bytes and never self-asserts receipt success", async () => {
    const memory = memoryPorts();
    const journal = createBscTestnetPtaWbnbPoolLocalJournalCore(memory.ports);
    const request = claim();
    const exact = binding(request);
    const token = hex32("8");
    const exchange = workerExchange(request, token);
    const requestHash = exchange.workerRequest.requestHash;
    const raw = exchange.workerResponse.signedTransaction;
    const transactionHash = exchange.workerResponse.transactionHash;
    await journal.claimExactInitialization(request);
    await journal.authorizeWorker({
      ...exact,
      workerRequestHash: requestHash,
      authorizationTokenDigest: keccak256(token)
    });
    await expect(
      journal.startWorker({
        ...exact,
        workerRequestHash: requestHash,
        authorizationToken: hex32("a")
      })
    ).rejects.toThrow("WORKER_AUTHORIZATION_INVALID");
    await journal.startWorker({
      ...exact,
      workerRequestHash: requestHash,
      authorizationToken: token
    });
    await expect(
      journal.commitWorkerSignedTransaction(exchange.workerRequest, {
        ...exchange.workerResponse,
        signedTransaction: "0x01",
        transactionHash: keccak256("0x01")
      })
    ).rejects.toThrow("INPUT_INVALID");
    await journal.commitWorkerSignedTransaction(exchange.workerRequest, exchange.workerResponse);
    const writesAfterCommit = memory.calls.length;
    await expect(
      journal.commitWorkerSignedTransaction(exchange.workerRequest, exchange.workerResponse)
    ).resolves.toEqual({ status: "signed_committed" });
    expect(memory.calls).toHaveLength(writesAfterCommit);
    await expect(journal.readState()).resolves.toMatchObject({
      status: "signed_committed",
      serializedTransaction: raw,
      transactionHash
    });
    expect(journal).not.toHaveProperty("commitSignedTransaction");
    expect(journal).not.toHaveProperty("confirmSuccess");
    expect(journal).not.toHaveProperty("confirmReverted");
    expect(journal).not.toHaveProperty("startSubmission");
    expect(journal).not.toHaveProperty("acknowledgeBroadcast");
  });

  it("accepts exact signed replay only and rejects changed signed bytes after commit", async () => {
    const fixture = await driveTo("signed_committed");
    const writes = fixture.memory.calls.length;
    await expect(
      fixture.journal.commitWorkerSignedTransaction(fixture.workerRequest, fixture.workerResponse)
    ).resolves.toEqual({ status: "signed_committed" });
    expect(fixture.memory.calls).toHaveLength(writes);
    const changed = "0x02" as Hex;
    await expect(
      fixture.journal.commitWorkerSignedTransaction(fixture.workerRequest, {
        ...fixture.workerResponse,
        signedTransaction: changed,
        transactionHash: keccak256(changed)
      })
    ).rejects.toThrow("INPUT_INVALID");
    expect(fixture.memory.calls).toHaveLength(writes);
  });

  it("fails closed on malformed, missing-slot, extra-file and cross-bound retained records", async () => {
    const source = memoryPorts();
    const journal = createBscTestnetPtaWbnbPoolLocalJournalCore(source.ports);
    const request = claim();
    await journal.claimExactInitialization(request);
    const claimContent = source.files.get("01-claim.v1.json");
    expect(claimContent).toBeDefined();
    if (claimContent === undefined) throw new TypeError("missing retained claim fixture");

    for (const initial of [
      { "01-claim.v1.json": "{bad" },
      { "02-transition.v1.json": claimContent },
      { "01-claim.v1.json": claimContent, "03-transition.v1.json": claimContent },
      { "01-claim.v1.json": claimContent, "unexpected.txt": "x" }
    ]) {
      const broken = createBscTestnetPtaWbnbPoolLocalJournalCore(memoryPorts(initial).ports);
      await expect(broken.readState()).resolves.toMatchObject({ status: "unknown_outcome" });
    }

    const authorized = await driveTo("worker_authorized");
    const transitionContent = authorized.memory.files.get("02-transition.v1.json");
    expect(transitionContent).toBeDefined();
    if (transitionContent === undefined) throw new TypeError("missing transition fixture");
    const transition = JSON.parse(transitionContent) as Record<string, unknown>;
    transition.envelopeHash = hex32("f");
    authorized.memory.files.set("02-transition.v1.json", `${JSON.stringify(transition)}\n`);
    await expect(authorized.journal.readState()).resolves.toMatchObject({
      status: "unknown_outcome"
    });
  });

  it("rejects mutation of every retained cross-binding field", async () => {
    const base = claim();
    const exact = binding(base);
    const mutations: Array<Partial<typeof exact>> = [
      { claimId: `pta-wbnb-pool-${"f".repeat(32)}` },
      { operationKey: hex32("f") },
      { envelopeHash: hex32("f") },
      { authorizationReceiptSha256: hex32("f") },
      { signingHash: hex32("f") },
      { serializedUnsignedSha256: hex32("f") },
      { reviewerApprovalDigest: hex32("f") },
      { ownerAuthorizationDigest: hex32("f") },
      { releaseCommit: "f".repeat(40) },
      { runtimeManifestSha256: hex32("f") }
    ];
    for (const mutation of mutations) {
      const memory = memoryPorts();
      const journal = createBscTestnetPtaWbnbPoolLocalJournalCore(memory.ports);
      await journal.claimExactInitialization(base);
      await expect(
        journal.authorizeWorker({
          ...exact,
          ...mutation,
          workerRequestHash: hex32("9"),
          authorizationTokenDigest: hex32("8")
        })
      ).rejects.toThrow();
      expect(memory.files.size).toBe(1);
    }
  });

  it("makes failure and unknown outcomes terminal without overwrite or retry", async () => {
    for (const terminal of ["failure", "unknown"] as const) {
      const memory = memoryPorts();
      const journal = createBscTestnetPtaWbnbPoolLocalJournalCore(memory.ports);
      const request = claim();
      const exact = binding(request);
      await journal.claimExactInitialization(request);
      if (terminal === "failure") {
        await journal.failBeforeSubmission({ ...exact, outcomeDigest: hex32("d") });
        await expect(journal.readState()).resolves.toMatchObject({
          status: "failed_before_submission"
        });
      } else {
        await journal.recordUnknownOutcome({ ...exact, outcomeDigest: hex32("e") });
        await expect(journal.readState()).resolves.toMatchObject({ status: "unknown_outcome" });
      }
      await expect(
        journal.authorizeWorker({
          ...exact,
          workerRequestHash: hex32("9"),
          authorizationTokenDigest: hex32("8")
        })
      ).rejects.toThrow("STATE_MISMATCH");
    }
  });

  it("records conservative terminal outcomes without claiming submission or receipt evidence", async () => {
    for (const status of [
      "claimed",
      "worker_authorized",
      "worker_started",
      "signed_committed"
    ] as const) {
      const fixture = await driveTo(status);
      await fixture.journal.failBeforeSubmission({
        ...fixture.exact,
        outcomeDigest: hex32("d"),
        ...(status === "signed_committed"
          ? {
              serializedTransaction: fixture.serializedTransaction,
              transactionHash: fixture.transactionHash
            }
          : {})
      });
      await expect(fixture.journal.readState()).resolves.toMatchObject({
        status: "failed_before_submission"
      });
    }
    for (const status of [
      "claimed",
      "worker_authorized",
      "worker_started",
      "signed_committed"
    ] as const) {
      const fixture = await driveTo(status);
      await fixture.journal.recordUnknownOutcome({
        ...fixture.exact,
        outcomeDigest: hex32("e"),
        ...(status === "signed_committed"
          ? {
              serializedTransaction: fixture.serializedTransaction,
              transactionHash: fixture.transactionHash
            }
          : {})
      });
      await expect(fixture.journal.readState()).resolves.toMatchObject({
        status: "unknown_outcome",
        transactionHash: status === "signed_committed" ? fixture.transactionHash : null
      });
    }
  });

  it("blocks a direct second worker start without creating another slot", async () => {
    const fixture = await driveTo("worker_started");
    const writes = fixture.memory.calls.length;
    await expect(
      fixture.journal.startWorker({
        ...fixture.exact,
        workerRequestHash: fixture.requestHash,
        authorizationToken: fixture.token
      })
    ).rejects.toThrow("STATE_MISMATCH");
    expect(fixture.memory.calls).toHaveLength(writes);
  });

  it("rejects expired/self-authenticated claims, cap drift, proxies and insecure metadata", async () => {
    const journal = createBscTestnetPtaWbnbPoolLocalJournalCore(memoryPorts().ports);
    const selfDigest = hex32("4");
    for (const request of [
      claim({ expiresAt: NOW }),
      claim({ expiresAt: "2026-08-13T10:02:00.001Z" }),
      claim({ expiresAt: "2026-08-13T10:05:00.000Z" }),
      claim({ authorizedAt: "2026-08-13T10:00:40.000Z", expiresAt: "2026-08-13T10:00:35.000Z" }),
      claim({ reviewerApprovalDigest: selfDigest, ownerAuthorizationDigest: selfDigest }),
      claim({ maxCostWei: "999" }),
      claim({ gasLimit: "6000001" })
    ]) {
      await expect(journal.claimExactInitialization(request)).rejects.toThrow("INPUT_INVALID");
    }

    let trapCalls = 0;
    const proxy = new Proxy(claim(), {
      get() {
        trapCalls += 1;
        throw new Error("trap");
      }
    });
    await expect(journal.claimExactInitialization(proxy)).rejects.toThrow("INPUT_INVALID");
    expect(trapCalls).toBe(0);

    const insecure = memoryPorts();
    const insecureJournal = createBscTestnetPtaWbnbPoolLocalJournalCore({
      ...insecure.ports,
      assertSecure: async () => ({
        verified: true,
        ownerSid: "S-1-5-21-1",
        accessRulesProtected: false,
        currentUserOnlyFullControl: true,
        checkedPaths: 1
      })
    });
    await expect(insecureJournal.readState()).resolves.toMatchObject({
      status: "unknown_outcome"
    });
  });

  it("keeps the Windows adapter fixed, env-free, and validates ancestors before ACL mutation", () => {
    expect(SOURCE).not.toContain("process.env");
    expect(SOURCE).toContain("GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)");
    expect(SOURCE).toContain('"bsc-testnet-pta-wbnb-pool-v1"');
    expect(SOURCE).toContain('"bsc-testnet-pta-wbnb-pool-v2"');
    expect(SOURCE).not.toContain(".SetOwner(");
    const validation = SOURCE.indexOf(
      "# All ancestors have been validated before the first ACL mutation."
    );
    const ownerValidation = SOURCE.indexOf("$existingDirectoryOwner -ne $current.Value");
    const directoryAclWrite = SOURCE.indexOf("[IO.Directory]::SetAccessControl($cursor");
    expect(validation).toBeGreaterThan(0);
    expect(ownerValidation).toBeGreaterThan(validation);
    expect(directoryAclWrite).toBeGreaterThan(ownerValidation);
    expect(directoryAclWrite).toBeGreaterThan(validation);
    expect(SOURCE).toContain('await open(path, "wx", 0o600)');
    expect(SOURCE).toContain("await handle.sync()");
    expect(SOURCE).toContain("retained.nlink !== 1n");
    expect(SOURCE).toContain("before.ctimeNs !== after.ctimeNs");
    expect(SOURCE).toContain("before.birthtimeNs !== after.birthtimeNs");
    expect(SOURCE).toContain("before.mode !== after.mode");
    expect(SOURCE).toContain("before.nlink !== after.nlink");
    expect(SOURCE).toContain("after.nlink !== 1n");
    const readOnlyStart = SOURCE.indexOf("const LOCAL_APPLICATION_DATA_READ_ONLY_PROBE_SCRIPT");
    const provisioningStart = SOURCE.indexOf("const LOCAL_APPLICATION_DATA_PROBE_SCRIPT");
    const readOnlyScript = SOURCE.slice(readOnlyStart, provisioningStart);
    const protectRecordStart = SOURCE.indexOf("const PROTECT_RECORD_SCRIPT");
    const provisioningScript = SOURCE.slice(provisioningStart, protectRecordStart);
    expect(readOnlyStart).toBeGreaterThan(0);
    expect(provisioningStart).toBeGreaterThan(readOnlyStart);
    expect(protectRecordStart).toBeGreaterThan(provisioningStart);
    expect(readOnlyScript).not.toMatch(/New-Item|SetAccessControl|Remove-Item/u);
    expect(provisioningScript).toContain("01-claim.v9.json");
    expect(provisioningScript).not.toContain("01-claim.v1.json");
  });
});

describe.runIf(process.platform === "win32")("read-only Windows signing recovery probe", () => {
  it("exposes narrow generation-specific restart facades and accepts active v9 slots", async () => {
    const legacyDirectory = await createSyntheticDirectory();
    const activeDirectory = await createSyntheticDirectory();
    try {
      const legacyPath = win32.join(legacyDirectory, "01-claim.v1.json");
      await writeFile(legacyPath, LEGACY_CLAIM_RECORD, { encoding: "utf8", flag: "wx" });
      await protectSynthetic(legacyPath);
      const legacy =
        await openExistingWindowsBscTestnetPtaWbnbPoolLocalJournalAtSyntheticDirectoryForTests(
          legacyDirectory
        );
      expect(legacy.status).toBe("opened");
      if (legacy.status !== "opened") throw new TypeError("legacy fixture did not open");
      expect(Object.keys(legacy.journal).sort()).toEqual(
        [
          "fenceClaimBeforeWorker",
          "readClaimOnlyRecoveryCandidate",
          "readState",
          "readStrictRecoveryState"
        ].sort()
      );
      expect("authorizeWorker" in legacy.journal).toBe(false);
      expect("claimExactInitialization" in legacy.journal).toBe(false);

      const recovery = Object.freeze({
        generation: 9 as const,
        predecessorState: "failed_before_worker" as const,
        predecessorTerminalRawSha256: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_8_TRANSITION_RAW_SHA256,
        attemptId: hex32("a")
      });
      const activeMemory = memoryPorts();
      await createBscTestnetPtaWbnbPoolLocalJournalCore(
        activeMemory.ports,
        9
      ).claimExactInitialization(claim(recovery));
      const activeContent = activeMemory.files.get("01-claim.v9.json");
      if (activeContent === undefined) throw new TypeError("active v9 fixture was not created");
      const activePath = win32.join(activeDirectory, "01-claim.v9.json");
      await writeFile(activePath, activeContent, { encoding: "utf8", flag: "wx" });
      await protectSynthetic(activePath);
      const active =
        await openExistingWindowsBscTestnetPtaWbnbPoolActiveLocalJournalAtSyntheticDirectoryForTests(
          activeDirectory
        );
      expect(active.status).toBe("opened");
      if (active.status !== "opened") throw new TypeError("active fixture did not open");
      expect(active.state).toMatchObject({ status: "claimed", generation: 9 });
      expect(Object.keys(active.journal).sort()).toEqual(
        ["readState", "readStrictRecoveryState"].sort()
      );
      expect("claimExactInitialization" in active.journal).toBe(false);
      expect("authorizeWorker" in active.journal).toBe(false);
    } finally {
      await cleanupSyntheticDirectory(legacyDirectory);
      await cleanupSyntheticDirectory(activeDirectory);
    }
  }, 45_000);

  it("reports an empty existing directory without changing bytes, metadata, or ACL", async () => {
    const directory = await createSyntheticDirectory();
    try {
      const before = await snapshotSyntheticTree(directory);
      await expect(
        openExistingWindowsBscTestnetPtaWbnbPoolLocalJournalAtSyntheticDirectoryForTests(directory)
      ).resolves.toMatchObject({ status: "absent", state: { status: "empty" } });
      expect(await snapshotSyntheticTree(directory)).toEqual(before);
    } finally {
      await cleanupSyntheticDirectory(directory);
    }
  }, 30_000);

  it("blocks partial/mismatched files and hard links without changing retained state", async () => {
    for (const names of [["01-claim.v1.json"], ["02-transition.v1.json"]] as const) {
      const directory = await createSyntheticDirectory();
      try {
        for (const name of names) {
          const path = win32.join(directory, name);
          await writeFile(path, '{"partial":true}', { encoding: "utf8", flag: "wx" });
          await protectSynthetic(path);
        }
        const before = await snapshotSyntheticTree(directory);
        await expect(
          openExistingWindowsBscTestnetPtaWbnbPoolLocalJournalAtSyntheticDirectoryForTests(
            directory
          )
        ).resolves.toMatchObject({ status: "blocked", state: null });
        expect(await snapshotSyntheticTree(directory)).toEqual(before);
      } finally {
        await cleanupSyntheticDirectory(directory);
      }
    }

    const directory = await createSyntheticDirectory();
    try {
      const first = win32.join(directory, "01-claim.v1.json");
      await writeFile(first, '{"partial":true}', { encoding: "utf8", flag: "wx" });
      await protectSynthetic(first);
      await link(first, win32.join(directory, "02-transition.v1.json"));
      const before = await snapshotSyntheticTree(directory);
      await expect(
        openExistingWindowsBscTestnetPtaWbnbPoolLocalJournalAtSyntheticDirectoryForTests(directory)
      ).resolves.toMatchObject({ status: "blocked", state: null });
      expect(await snapshotSyntheticTree(directory)).toEqual(before);
    } finally {
      await cleanupSyntheticDirectory(directory);
    }
  }, 45_000);

  it("blocks a reparse-point child without following or mutating it", async () => {
    const directory = await createSyntheticDirectory();
    const target = await createSyntheticDirectory();
    try {
      await symlink(target, win32.join(directory, "01-claim.v1.json"), "junction");
      const before = await snapshotSyntheticTree(directory);
      await expect(
        openExistingWindowsBscTestnetPtaWbnbPoolLocalJournalAtSyntheticDirectoryForTests(directory)
      ).resolves.toMatchObject({ status: "blocked", state: null });
      expect(await snapshotSyntheticTree(directory)).toEqual(before);
    } finally {
      await cleanupSyntheticDirectory(directory);
      await cleanupSyntheticDirectory(target);
    }
  }, 30_000);
});
