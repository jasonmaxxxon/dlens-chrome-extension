export function createAsyncLock() {
  let chain = Promise.resolve();

  return function withLock<T>(task: () => Promise<T>): Promise<T> {
    const run = chain.catch(() => undefined).then(task);
    chain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };
}
