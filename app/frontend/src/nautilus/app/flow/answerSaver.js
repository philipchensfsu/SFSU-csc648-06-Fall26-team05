// Serialize writes per question. New edits replace queued text, while failures
// retain each question's newest value. A drain waits for every queued write.
export function createAnswerSaver(send, onStatus) {
  const queued = new Map();
  const running = new Map();
  const failures = new Map();
  const report = () => onStatus({
    pending: running.size + queued.size,
    failure: failures.values().next().value ?? null,
  });

  function pump(key) {
    if (running.has(key) || !queued.has(key)) return;
    const text = queued.get(key);
    queued.delete(key);
    failures.delete(key);
    const task = Promise.resolve().then(() => send(key, text)).then(
      () => failures.delete(key),
      (error) => failures.set(key, {
        key, text, message: error?.message || "Couldn’t save your answer.",
      }),
    ).finally(() => {
      running.delete(key);
      pump(key);
      report();
    });
    running.set(key, task);
    report();
  }

  return {
    save(key, text) {
      queued.set(key, text);
      pump(key);
      report();
    },
    hasUnsaved() {
      return Boolean(queued.size || running.size || failures.size);
    },
    async drain() {
      // Retry failures only once per explicit action. Newer queued edits win.
      for (const { key, text } of failures.values()) {
        if (!queued.has(key)) queued.set(key, text);
      }
      for (const key of queued.keys()) pump(key);
      while (running.size) await Promise.all([...running.values()]);
      if (failures.size) throw new Error(failures.values().next().value.message);
    },
  };
}
