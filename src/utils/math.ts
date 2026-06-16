export function computeDifferences(values: number[]): number[] {
  const n = values.length;
  if (n === 0) return [];
  if (n === 1) return [values[0]];

  const diffs: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    diffs.push(values[i + 1] - values[i]);
  }
  return diffs;
}

export function computeInitialDifferences(values: number[]): number[] {
  const order = values.length - 1;
  if (order <= 0) return values.slice();

  const columns: number[] = [values[0]];
  let current = values.slice();

  for (let k = 1; k <= order; k++) {
    current = computeDifferences(current);
    columns.push(current[0]);
  }

  return columns;
}

export function numberToDigits(value: number, numDigits: number): number[] {
  const digits: number[] = [];
  let v = Math.abs(value);
  for (let i = 0; i < numDigits; i++) {
    digits.push(v % 10);
    v = Math.floor(v / 10);
  }
  return digits;
}

export function digitsToNumber(digits: number[]): number {
  let value = 0;
  for (let i = digits.length - 1; i >= 0; i--) {
    value = value * 10 + digits[i];
  }
  return value;
}

export function generatePolynomialValues(
  coeffs: number[],
  startIndex: number,
  count: number
): number[] {
  const values: number[] = [];
  for (let x = startIndex; x < startIndex + count; x++) {
    let val = 0;
    for (let i = 0; i < coeffs.length; i++) {
      val += coeffs[i] * Math.pow(x, i);
    }
    values.push(val);
  }
  return values;
}

export interface DiffTableRow {
  x: number;
  values: number[];
}

export function computeDiffTableIndependent(
  initialValues: number[],
  order: number,
  maxSteps: number
): DiffTableRow[] {
  const rows: DiffTableRow[] = [];

  const firstRowValues: number[] = [];
  let currentLevel = initialValues.slice(0, order + 1);
  for (let k = 0; k <= order; k++) {
    firstRowValues.push(currentLevel[0]);
    if (k < order) {
      const nextLevel: number[] = [];
      for (let i = 0; i < currentLevel.length - 1; i++) {
        nextLevel.push(currentLevel[i + 1] - currentLevel[i]);
      }
      currentLevel = nextLevel;
    }
  }
  rows.push({ x: 0, values: firstRowValues });

  const diffValues = firstRowValues.slice();

  for (let step = 1; step <= maxSteps; step++) {
    for (let k = 0; k < order; k++) {
      diffValues[k] += diffValues[k + 1];
    }
    rows.push({ x: step, values: [...diffValues] });
  }

  return rows;
}
