/** Same keys as the reference locale `T`, any string values: a missing or extra key is a type error. */
export type Messages<T> = { [K in keyof T]: T[K] extends string ? string : Messages<T[K]> }
