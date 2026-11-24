export function predict(model, profile) {
  const numeric = model.numeric.map((key, index) => (profile[key] - model.means[index]) / model.scales[index]);
  const categorical = model.categorical.flatMap((key, index) =>
    model.categories[index].map(category => Number(profile[key] === category))
  );
  const score = [...numeric, ...categorical].reduce(
    (sum, value, index) => sum + value * model.weights[index], model.intercept
  );
  return 1 / (1 + Math.exp(-score));
}
