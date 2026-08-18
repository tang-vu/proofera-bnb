# Pancake LP manual captures

The create-only manual CLI writes one canonical capture per frozen run ID here. No run exists yet.
The NDJSON event stream records positive operator-active segments, exactly one matching read-only
`slot0` RPC exchange, and the unedited canonical worksheet output. It cannot prove operator identity
or the absence of unreported tools; independent tool-log review remains required.

Procedure `v1.1.0` binds the exact OnFinality archive endpoint, provider label,
and human worksheet tool. Earlier declarations using `v1.0.0` must not be used
for a manual capture because their RPC tool metadata predates the archive
provider correction.
