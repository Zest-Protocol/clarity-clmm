import {
  Cl,
  ClarityType,
  type ClarityValue,
  cvToString,
} from '@stacks/transactions';

/** A Clarity value as plain JS: bigint, boolean, string, array, record, {ok}/{err}. */
export type Plain =
  | bigint
  | boolean
  | string
  | null
  | Plain[]
  | { [key: string]: Plain };

export function plain(cv: ClarityValue): Plain {
  switch (cv.type) {
    case ClarityType.UInt:
    case ClarityType.Int:
      return BigInt(cv.value);
    case ClarityType.BoolTrue:
      return true;
    case ClarityType.BoolFalse:
      return false;
    case ClarityType.OptionalNone:
      return null;
    case ClarityType.OptionalSome:
      return plain(cv.value);
    case ClarityType.ResponseOk:
      return { ok: plain(cv.value) };
    case ClarityType.ResponseErr:
      return { err: plain(cv.value) };
    case ClarityType.Tuple:
      return Object.fromEntries(
        Object.entries(cv.value).map(([k, v]) => [k, plain(v)]),
      );
    case ClarityType.List:
      return cv.value.map(plain);
    case ClarityType.PrincipalStandard:
    case ClarityType.PrincipalContract:
    case ClarityType.StringASCII:
    case ClarityType.StringUTF8:
      return cv.value;
    default:
      return cvToString(cv);
  }
}

/** Unwraps (ok v) and returns v, failing loudly on anything else. */
export function okOf(cv: ClarityValue): Plain {
  if (cv.type !== ClarityType.ResponseOk)
    throw new Error(`expected (ok ...), got ${cvToString(cv)}`);
  return plain(cv.value);
}

/** Unwraps (ok tuple) into a record of bigints. */
export function okRecord(cv: ClarityValue): Record<string, bigint> {
  const v = okOf(cv);
  if (v === null || typeof v !== 'object' || Array.isArray(v))
    throw new Error(`expected a tuple, got ${cvToString(cv)}`);
  const out: Record<string, bigint> = {};
  for (const [k, x] of Object.entries(v)) {
    if (typeof x !== 'bigint') throw new Error(`field ${k} is not an integer`);
    out[k] = x;
  }
  return out;
}

export function okUint(cv: ClarityValue): bigint {
  const v = okOf(cv);
  if (typeof v !== 'bigint')
    throw new Error(`expected uint, got ${cvToString(cv)}`);
  return v;
}

export function errCode(cv: ClarityValue): bigint {
  if (cv.type !== ClarityType.ResponseErr)
    throw new Error(`expected (err ...), got ${cvToString(cv)}`);
  return BigInt(cvToString(cv.value).replace(/^u/, ''));
}

export const U128_MAX = (1n << 128n) - 1n;
export { Cl };
