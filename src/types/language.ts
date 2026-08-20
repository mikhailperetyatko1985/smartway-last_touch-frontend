export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;

export type Entries<T> = {
    [K in keyof T]: [K, T[K]];
}[keyof T][];

