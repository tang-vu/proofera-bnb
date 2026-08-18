const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
const phaseLabel = document.querySelector("#phase-label");
const errorLabel = document.querySelector("#error-label");
const lpStart = document.querySelector("#lp-start");
const venusStart = document.querySelector("#venus-start");
const lpWorkspace = document.querySelector("#lp-workspace");
const venusWorkspace = document.querySelector("#venus-workspace");

async function api(path, body) {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined
        ? undefined
        : { "content-type": "application/json", "x-csrf-token": csrfToken },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "CEREMONY_REQUEST_FAILED");
  return result;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function confirmationForm(kind, conclusion) {
  return `
    <form id="${kind}-form">
      <div class="conclusion"><span>Kết luận có giới hạn</span><strong>${escapeHtml(conclusion)}</strong></div>
      <button type="submit">Tôi đã xem — xác nhận và ghi capture</button>
    </form>`;
}

function captureHtml(label, capture) {
  return `<p class="success">${escapeHtml(label)}: <code>${escapeHtml(capture.path)}</code><br />Commit: <code>${escapeHtml(capture.commitSha)}</code></p>`;
}

function renderLp(worksheet) {
  const p = worksheet.position;
  lpWorkspace.hidden = false;
  lpWorkspace.innerHTML = `
    <div class="facts">
      <div><span>Block</span><strong>${escapeHtml(worksheet.source.blockNumber)}</strong></div>
      <div><span>Tick range</span><strong>${p.lowerTick} ≤ ${p.currentTick} &lt; ${p.upperTick}</strong></div>
      <div><span>In range</span><strong>${p.inRange ? "true" : "false"}</strong></div>
      <div><span>Buffers</span><strong>${p.fromLowerTick} / ${p.toUpperExclusiveTick} ticks</strong></div>
      <div><span>Range width</span><strong>${p.rangeWidthTicks}</strong></div>
      <div><span>Economics</span><strong>missing → do not infer benefit</strong></div>
    </div>
    <details><summary>Exact source binding</summary><code>${escapeHtml(JSON.stringify(worksheet.source))}</code></details>
    ${confirmationForm("lp", "insufficient_evidence")}`;
  document.querySelector("#lp-form").addEventListener("submit", finishLp);
}

function renderVenus(worksheet) {
  const rows = worksheet.observations
    .map(
      (observation) =>
        `<tr><td>${escapeHtml(observation.blockNumber)}</td><td>${escapeHtml(observation.adjustedCollateralValueRaw)}</td><td>${escapeHtml(observation.debtValueRaw)}</td><td>${escapeHtml(observation.healthFactor?.decimalValueFloor ?? "unavailable")}</td></tr>`
    )
    .join("");
  venusWorkspace.hidden = false;
  venusWorkspace.innerHTML = `
    <p class="formula">${escapeHtml(worksheet.formula)}</p>
    <div class="table-wrap"><table><thead><tr><th>Block</th><th>Adjusted collateral</th><th>Debt</th><th>Health factor</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="facts">
      <div><span>Minimum HF</span><strong>${escapeHtml(worksheet.minimumHealthFactor?.decimalValueFloor ?? "unavailable")}</strong></div>
      <div><span>Alert threshold</span><strong>${escapeHtml(worksheet.thresholds.alertHealthFactorRaw)}</strong></div>
      <div><span>Intervention threshold</span><strong>${escapeHtml(worksheet.thresholds.interventionHealthFactorRaw)}</strong></div>
      <div><span>Window</span><strong>${worksheet.windowSeconds} seconds</strong></div>
    </div>
    ${confirmationForm("venus", "hold")}`;
  document.querySelector("#venus-form").addEventListener("submit", finishVenus);
}

async function withBusy(button, operation) {
  button.disabled = true;
  errorLabel.textContent = "";
  try {
    await operation();
  } catch (error) {
    errorLabel.textContent = error instanceof Error ? error.message : "CEREMONY_REQUEST_FAILED";
    button.disabled = false;
  }
}

lpStart.addEventListener("click", () =>
  withBusy(lpStart, async () => {
    phaseLabel.textContent = "Đang mở LP runner và đọc exact-hash slot0…";
    const result = await api("/api/lp/start", {});
    renderLp(result.worksheet);
    phaseLabel.textContent = "LP worksheet đã recompute — chỉ cần xem và xác nhận.";
  })
);

async function finishLp(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  await withBusy(button, async () => {
    phaseLabel.textContent = "Đang đóng capture LP, commit và push…";
    const result = await api("/api/lp/finish", {
      worksheetReviewed: true
    });
    lpWorkspace.innerHTML = captureHtml("LP capture đã lưu", result.capture);
    venusStart.disabled = false;
    phaseLabel.textContent = "LP hoàn tất. Đang tự mở Venus…";
    venusStart.click();
  });
}

venusStart.addEventListener("click", () =>
  withBusy(venusStart, async () => {
    phaseLabel.textContent = "Đang mở Venus runner và kiểm tra bốn RPC receipt…";
    const result = await api("/api/venus/start", {});
    renderVenus(result.worksheet);
    phaseLabel.textContent = "Venus worksheet đã recompute — chỉ cần xem và xác nhận.";
  })
);

async function finishVenus(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  await withBusy(button, async () => {
    phaseLabel.textContent = "Đang đóng capture Venus, commit và push…";
    const result = await api("/api/venus/finish", {
      worksheetReviewed: true
    });
    venusWorkspace.innerHTML = captureHtml("Venus capture đã lưu", result.capture);
    phaseLabel.textContent = "Hai manual baseline đã hoàn tất. Altana vẫn chờ authority thật.";
  });
}

api("/api/state")
  .then((state) => {
    phaseLabel.textContent =
      state.phase === "idle"
        ? "Sẵn sàng. Bắt đầu LP khi bạn đã chuẩn bị tự đánh giá."
        : state.phase;
    if (state.phase === "lp_active" && state.lpWorksheet) {
      lpStart.disabled = true;
      renderLp(state.lpWorksheet);
    }
    if (state.lpCapture) {
      lpStart.disabled = true;
      lpWorkspace.hidden = false;
      lpWorkspace.innerHTML = captureHtml("LP capture đã lưu", state.lpCapture);
    }
    if (state.phase === "lp_done") venusStart.disabled = false;
    if (state.phase === "venus_active" && state.venusWorksheet) {
      venusStart.disabled = true;
      renderVenus(state.venusWorksheet);
    }
    if (state.venusCapture) {
      venusStart.disabled = true;
      venusWorkspace.hidden = false;
      venusWorkspace.innerHTML = captureHtml("Venus capture đã lưu", state.venusCapture);
    }
    if (state.error) errorLabel.textContent = state.error;
    if (state.phase === "idle") lpStart.click();
  })
  .catch((error) => {
    errorLabel.textContent = error instanceof Error ? error.message : "CEREMONY_STATE_FAILED";
  });
