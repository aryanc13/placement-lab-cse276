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

async function main() {
  const response = await fetch("./model.json");
  if (!response.ok) throw new Error("Model unavailable");
  const model = await response.json();
  let profile = { ...model.sample };
  const form = node("profile");
  const feature = node("feature");
  const range = node("value");

  for (const [key, [label, min, max, step]] of Object.entries(fields)) {
    const container = document.createElement("div");
    const title = document.createElement("label");
    title.htmlFor = key;
    title.textContent = label;
    let input;
    if (min === undefined) {
      input = document.createElement("select");
      model.categories[model.categorical.indexOf(key)].forEach(value => input.add(new Option(value)));
    } else {
      input = document.createElement("input");
      Object.assign(input, { type: "number", min, max, step, required: true });
      feature.add(new Option(label, key));
    }
    Object.assign(input, { id: key, name: key, value: profile[key] });
    container.append(title, input);
    node("fields").append(container);
  }

  const update = () => {
    const base = predict(model, profile);
    const scenario = predict(model, { ...profile, [feature.value]: range.valueAsNumber });
    const change = 100 * (scenario - base);
    node("applied").textContent = percent(base);
    node("scenario").textContent = percent(scenario);
    node("classification").textContent = base >= .5 ? "Placed at the 50% cutoff" : "Not placed at the 50% cutoff";
    node("difference").textContent = (change >= 0 ? "+" : "") + change.toFixed(1) + " percentage points";
    node("current").value = range.value;
  };
  const reset = () => {
    const [, min, max, step] = fields[feature.value];
    Object.assign(range, { min, max, step, value: profile[feature.value] });
    update();
  };
  form.addEventListener("submit", event => {
    event.preventDefault();
    profile = Object.fromEntries([...new FormData(form)].map(([key, value]) =>
      [key, model.numeric.includes(key) ? Number(value) : value]
    ));
    reset();
  });
  feature.value = "coding_score";
  feature.addEventListener("change", reset);
  range.addEventListener("input", update);
  reset();

  node("method").textContent = model.model + " · " + model.testRows + " held-out synthetic profiles";
  for (const [label, key] of Object.entries({ Accuracy: "accuracy", Precision: "precision", Recall: "recall", F1: "f1", "ROC AUC": "roc_auc" })) {
    const card = document.createElement("div");
    const name = document.createElement("span");
    const value = document.createElement("strong");
    name.textContent = label;
    value.textContent = percent(model.metrics[key]);
    card.append(name, value);
    node("metrics").append(card);
  }
  for (const { feature: key, mean_f1_drop: drop } of model.importance.slice(0, 5)) {
    const row = document.createElement("li");
    row.textContent = fields[key][0] + " (" + drop.toFixed(3) + ")";
    node("importance").append(row);
  }
  const updateCutoff = () => {
    const cutoff = node("cutoff").valueAsNumber;
    const { tn, fp, fn, tp } = model.diagnostics.thresholds.find(row => row.cutoff === cutoff);
    node("cutoff-label").value = cutoff + "%";
    const rows = [["Not placed", tn, fp], ["Placed", fn, tp]].map(([name, no, yes]) => {
      const row = document.createElement("tr");
      for (const [index, value] of [name, no, yes].entries()) {
        const cell = document.createElement(index === 0 ? "th" : "td");
        if (index === 0) cell.scope = "row";
        cell.textContent = value;
        row.append(cell);
      }
      return row;
    });
    node("matrix").replaceChildren(...rows);
  };
  node("cutoff").addEventListener("input", updateCutoff);
  updateCutoff();
  node("status").hidden = true;
  node("dashboard").hidden = false;
}

main().catch(error => {
  node("status").textContent = "The prediction model could not load. Reload this page to try again.";
  console.error(error);
});
