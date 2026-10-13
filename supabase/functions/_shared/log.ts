// Structured log line for the AI Edge Functions. Callers pass ids, codes and
// counts only — never the request body, the model output, or anything from
// the environment.
export const logAi = (level, fn, fields) => {
  const line = JSON.stringify({ fn, ...fields });

  if (level === 'error') {
    console.error(line);
  } else {
    console.log(line);
  }
};
