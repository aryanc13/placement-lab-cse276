import { predict } from "./predict.mjs";

const fields = {
  cgpa: ["CGPA", 4, 10, .01],
  aptitude_score: ["Aptitude score", 0, 100, 1],
  coding_score: ["Coding score", 0, 100, 1],
  communication_score: ["Communication score", 0, 100, 1],
  internships: ["Internships", 0, 3, 1],
  projects: ["Projects", 0, 6, 1],
  certifications: ["Certifications", 0, 5, 1],
  backlogs: ["Backlogs", 0, 5, 1],
  specialization: ["Specialization"],
  placement_training: ["Placement training"]
};

const node = id => document.getElementById(id);
const percent = x => (100 * x).toFixed(1) + "%";

function element(tag, text, className) {
  const item = document.createElement(tag);
  if (text !== undefined) item.textContent = text;
  if (className) item.className = className;
  return item;
}

function bar(value, className) {
  const track = element("div", undefined, "track");
  const fill = element("span", undefined, className);
  fill.style.width = (100 * Math.max(0, Math.min(1, value))) + "%";
  track.setAttribute("aria-hidden", "true");
  track.append(fill);
  return track;
}

function drawCurve(model, profile, key, scenarioValue) {
  const canvas = node("curve");
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;
  const resolution = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * resolution);
  canvas.height = Math.round(height * resolution);
  const context = canvas.getContext("2d");
  context.scale(resolution, resolution);
  const [label, min, max] = fields[key];
  const bounds = { left: 36, right: width - 12, top: 10, bottom: height - 22 };
  const x = value => bounds.left + (bounds.right - bounds.left) * (value - min) / (max - min);
  const y = probability => bounds.bottom - probability * (bounds.bottom - bounds.top);

  context.font = "10px monospace";
  context.fillStyle = "#ddd0ea";
  context.textAlign = "right";
  for (const level of [0, .25, .5, .75, 1]) {
    context.strokeStyle = level === .5 ? "#7d6b95" : "#4c405d";
    context.beginPath();
    context.moveTo(bounds.left, y(level));
    context.lineTo(bounds.right, y(level));
    context.stroke();
    context.fillText(Math.round(level * 100) + "%", bounds.left - 5, y(level) + 3);
  }
  context.textAlign = "center";
  for (const value of [min, (min + max) / 2, max]) {
    context.fillText(String(value), x(value), height - 6);
  }

  const numberOfPoints = 70;
  const points = Array.from({ length: numberOfPoints }, (_, index) => {
    const value = min + (max - min) * index / (numberOfPoints - 1);
    return [x(value), y(predict(model, { ...profile, [key]: value }))];
  });
  const path = new Path2D();
  points.forEach(([px, py], i) => i ? path.lineTo(px, py) : path.moveTo(px, py));
  const area = new Path2D(path);
  area.lineTo(bounds.right, bounds.bottom);
  area.lineTo(bounds.left, bounds.bottom);
  area.closePath();
  const gradient = context.createLinearGradient(0, bounds.top, 0, bounds.bottom);
  gradient.addColorStop(0, "#a987ed60");
  gradient.addColorStop(1, "#a987ed08");
  context.fillStyle = gradient;
  context.fill(area);
  context.strokeStyle = "#c7b6fc";
  context.lineWidth = 2;
  context.stroke(path);

  for (const [value, color, radius] of [[profile[key], "#c7b6fc", 5], [scenarioValue, "#dfef85", 3.3]]) {
    const estimate = predict(model, { ...profile, [key]: value });
    context.fillStyle = color;
    context.beginPath();
    context.arc(x(value), y(estimate), radius, 0, Math.PI * 2);
    context.fill();
  }
  canvas.setAttribute("aria-label", label + " curve, from " + percent(predict(model, { ...profile, [key]: min })) +
    " at " + min + " to " + percent(predict(model, { ...profile, [key]: max })) + " at " + max);
}

function showEvidence(model) {
  node("method").textContent = model.model + " · " + model.testRows.toLocaleString() + " held-out synthetic profiles";
  for (const [label, key] of Object.entries({ Accuracy: "accuracy", Precision: "precision", Recall: "recall", F1: "f1", "ROC AUC": "roc_auc" })) {
    const card = element("div");
    card.append(element("span", label), element("strong",
      key === "f1" || key === "roc_auc" ? model.metrics[key].toFixed(3) : percent(model.metrics[key])));
    node("metrics").append(card);
  }
  const highestDrop = Math.max(...model.importance.map(row => row.mean_f1_drop));
  for (const { feature: key, mean_f1_drop: drop } of model.importance.slice(0, 5)) {
    const row = element("li");
    row.append(element("span", fields[key][0]), bar(drop / highestDrop), element("strong", drop.toFixed(3)));
    node("importance").append(row);
  }
  for (const band of model.diagnostics.calibration) {
    const card = element("div", undefined, "band");
    card.append(element("strong", band.band), element("small", band.students + " profiles"),
      bar(band.mean_score, "estimated"), bar(band.observed_rate),
      element("small", percent(band.mean_score) + " / " + percent(band.observed_rate)));
    node("calibration").append(card);
  }

  function updateCutoff() {
    const cutoff = node("cutoff").valueAsNumber;
    const { tn, fp, fn, tp } = model.diagnostics.thresholds.find(row => row.cutoff === cutoff);
    node("cutoff-label").value = cutoff + "%";
    const rows = [["Not placed", tn, fp], ["Placed", fn, tp]].map(([name, no, yes]) => {
      const row = element("tr");
      const label = element("th", name);
      label.scope = "row";
      row.append(label, element("td", no), element("td", yes));
      return row;
    });
    node("matrix").replaceChildren(...rows);
    node("cutoff-note").textContent = fp + " false positives · " + fn + " missed placements";
  }
  node("cutoff").addEventListener("input", updateCutoff);
  updateCutoff();

  const scale = model.trainingComparison;
  for (const [n, accuracy, brier] of [
    [scale.earlier_train_rows, scale.earlier_accuracy, scale.earlier_brier],
    [scale.expanded_train_rows, scale.expanded_accuracy, scale.expanded_brier]
  ]) {
    const row = element("tr");
    const label = element("th", n.toLocaleString());
    label.scope = "row";
    row.append(label, element("td", percent(accuracy)), element("td", brier.toFixed(4)));
    node("training-results").append(row);
  }
  node("training-description").textContent =
    "Both Logistic Regression models were scored on the same holdout. Lower Brier scores mean smaller probability errors.";
  const [low, high] = scale.brier_reduction_ci95;
  node("training-interval").textContent = "Paired 95% interval for the Brier score reduction: " +
    low.toFixed(4) + " to " + high.toFixed(4) + ".";
}

async function main() {
  const response = await fetch("./model.json?v=12k");
  if (!response.ok) throw new Error("Model unavailable");
  const model = await response.json();
  const presets = {
    early: { ...model.sample, cgpa: 6.4, aptitude_score: 49, coding_score: 42,
      communication_score: 52, internships: 0, projects: 1, certifications: 0, backlogs: 2, placement_training: "No" },
    mid: model.midProfile,
    sample: model.sample
  };
  let profile = { ...model.sample };
  const form = node("profile");
  const feature = node("feature");
  const range = node("value");

  for (const [key, [label, min, max, step]] of Object.entries(fields)) {
    const container = element("div");
    const title = element("label", label);
    title.htmlFor = key;
    let input;
    if (min === undefined) {
      input = element("select");
      model.categories[model.categorical.indexOf(key)].forEach(value => input.add(new Option(value)));
    } else {
      input = element("input");
      Object.assign(input, { type: "number", min, max, step, required: true });
      feature.add(new Option(label, key));
    }
    Object.assign(input, { id: key, name: key, value: profile[key] });
    container.append(title, input);
    node("fields").append(container);
  }

  const scenarioProfile = () => ({ ...profile, [feature.value]: range.valueAsNumber });
  function update() {
    const base = predict(model, profile);
    const scenario = predict(model, scenarioProfile());
    const change = 100 * (scenario - base);
    node("applied").textContent = percent(base);
    node("scenario").textContent = percent(scenario);
    node("classification").textContent = base >= .5 ? "Placed at the 50% cutoff" : "Not placed at the 50% cutoff";
    node("difference").textContent = (change >= 0 ? "+" : "") + change.toFixed(1) + " percentage points";
    node("current").value = range.value;
    node("curve-caption").textContent = fields[feature.value][0] + " · other inputs held fixed";
    drawCurve(model, profile, feature.value, range.valueAsNumber);
  }
  function reset() {
    const [, min, max, step] = fields[feature.value];
    Object.assign(range, { min, max, step, value: profile[feature.value] });
    update();
  }
  const presetButtons = [...node("presets").querySelectorAll("button")];
  for (const button of presetButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.preset === "sample"));
    button.addEventListener("click", () => {
      profile = { ...presets[button.dataset.preset] };
      for (const [key, value] of Object.entries(profile)) node(key).value = value;
      for (const candidate of presetButtons) candidate.setAttribute("aria-pressed", String(candidate === button));
      reset();
    });
  }
  form.addEventListener("submit", event => {
    event.preventDefault();
    profile = Object.fromEntries([...new FormData(form)].map(([key, value]) =>
      [key, model.numeric.includes(key) ? Number(value) : value]
    ));
    for (const button of presetButtons) button.setAttribute("aria-pressed", "false");
    reset();
  });
  node("export").addEventListener("click", () => {
    const changed = scenarioProfile();
    const result = {
      model: model.model, dataset: "synthetic", changedInput: feature.value,
      applied: { profile, probability: predict(model, profile) },
      scenario: { profile: changed, probability: predict(model, changed) }
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }));
    const link = element("a");
    Object.assign(link, { href: url, download: "placement-comparison.json" });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  feature.value = "coding_score";
  feature.addEventListener("change", reset);
  range.addEventListener("input", update);
  showEvidence(model);
  node("status").hidden = true;
  node("dashboard").hidden = false;
  reset();
  new ResizeObserver(() => drawCurve(model, profile, feature.value, range.valueAsNumber)).observe(node("curve"));
}

main().catch(error => {
  node("dashboard").hidden = true;
  node("status").hidden = false;
  node("status").textContent = "The prediction model could not load. Reload this page to try again.";
  console.error(error);
});

