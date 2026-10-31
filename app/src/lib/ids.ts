import { randomUUID } from 'expo-crypto';

/** New row id: a v4 UUID from the OS secure random source (expo-crypto). */
export function newId(): string {
  return randomUUID();
}
