import 'node:http';

import type { Role } from '@tasks-platform/contracts';

import type { CommentEntity } from '../../modules/comments/comments.types.js';
import type { LabelEntity } from '../../modules/labels/labels.types.js';
import type { ProjectEntity } from '../../modules/projects/projects.types.js';
import type { TaskEntity } from '../../modules/tasks/tasks.types.js';

declare module 'node:http' {
  interface IncomingMessage {
    id: string;
    auth?: { userId: string };
    /** Set by `requireMembership` once the caller's role in the org is resolved. */
    membership?: { organizationId: string; membershipId: string; role: Role };
    /** Set by `requireProject` once `:projectId` is resolved and confirmed to belong to the organization. */
    project?: ProjectEntity;
    /** Set by `requireTask` once `:taskId` is resolved and confirmed to belong to the project. */
    task?: TaskEntity;
    /** Set by `requireComment` once `:commentId` is resolved and confirmed to belong to the task. */
    comment?: CommentEntity;
    /** Set by `requireLabel` once `:labelId` is resolved and confirmed to belong to the organization. */
    label?: LabelEntity;
  }
}

export {};
