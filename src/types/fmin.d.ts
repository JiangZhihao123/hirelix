declare module "fmin" {
  type Objective = (x: number[], gradient: number[]) => number;
  type OptimizeResult = {
    x: number[];
    fx: number;
    fxprime: number[];
  };

  export function conjugateGradient(
    objective: Objective,
    initial: number[],
    options?: { maxIterations?: number; learnRate?: number },
  ): OptimizeResult;
}

