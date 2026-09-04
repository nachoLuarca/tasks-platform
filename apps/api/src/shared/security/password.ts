import { randomBytes } from 'node:crypto';

import * as argon2 from 'argon2';

import { config } from '../config/index.js';

const hashOptions: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: config.argon2.memoryCostKib,
  timeCost: config.argon2.timeCost,
  parallelism: config.argon2.parallelism,
};

export function hashPassword(plainPassword: string): Promise<string> {
  return argon2.hash(plainPassword, hashOptions);
}

export function verifyPassword(hash: string, plainPassword: string): Promise<boolean> {
  return argon2.verify(hash, plainPassword);
}

/**
 * A valid Argon2id hash with no real password behind it, computed once at
 * startup with the same cost parameters as real users. Login uses this to
 * verify against when the email doesn't exist, so a non-existent account
 * takes the same time to reject as a wrong password - the response time
 * itself must not reveal whether the email is registered.
 */
export const dummyPasswordHash: Promise<string> = hashPassword(randomBytes(32).toString('hex'));
