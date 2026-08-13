export const getPerformance = () => ({ disabled: true });

export const trace = () => ({
  putAttribute: () => {},
  putMetric: () => {},
  start: () => {},
  stop: () => {},
});
