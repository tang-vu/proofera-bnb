# Task 02 permission-audit declarations

`38046f87b87c-126555555.json` is the active frozen declaration. It binds source
release `38046f87b87c27fc3a44b3855cc7e54a10e21d8a`, Agent `1825`, the verified
paid hire, bundle SHA-256
`c50a2defc62a996cab8a8bf51be2b8b2bbe44cc007ea01e6d1512d7257a8f0cb`,
reviewer-held answer-key digest
`61494b199b7b41b30eee370fe6736d864671439c65b2acfbee107c5ea9efdbeb`
and future BSC-testnet randomness block `126555555`. It was committed and
published before that block. Run order, both timed runs, adjudication and a
result remain absent.

`926a21b6852e-126554408.json` was also published before its randomness block,
but the source release was superseded before either lane ran so the public
agent package could satisfy its independent lint gate. It remains immutable
non-result preparation and must not be used for a pair.

Neither declaration is a receipt, performance result or advantage claim. A
`.run-order.json` may be added only after both fixed RPCs observe the active
randomness block with at least 12 confirmations and agree on its hash and
timestamp.
