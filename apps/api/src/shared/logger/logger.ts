import { createLogger } from '@tasks-platform/shared';

import { getRequestId } from './request-context.js';

/** Same base setup (level, redaction, pretty-printing) as every other process, plus the api's own requestId mixin. See packages/shared/src/logger/logger.ts. */
export const logger = createLogger({
  mixin() {
    const requestId = getRequestId();
    return requestId ? { requestId } : {};
  },
});
