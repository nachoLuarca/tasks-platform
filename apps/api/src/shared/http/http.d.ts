import 'node:http';

import type { Role } from '@tasks-platform/contracts';

import type { CommentEntity } from '../../modules/comments/comments.types.js';
import type { LabelEntity } from '../../modules/labels/labels.types.js';
import type { ProjectEntity } from '../../modules/projects/projects.types.js';
import type { TaskEntity } from '../../modules/tasks/tasks.types.js';
import type { WebhookEndpointEntity } from '../../modules/webhooks/webhooks.types.js';
import type { AuthContext } from '../authorization/request-actor.js';

declare module 'node:http' {
  interface IncomingMessage {
    id: string;
    auth?: AuthContext;
    /**
     * Set by `requireMembership`. For a user, `membershipId`/`role` are the
     * caller's real Membership row. For an API key, there is no Membership
     * row -- both are `null`, and `requirePermission` checks the key's
     * scopes instead of a role.
     */
    membership?: { organizationId: string; membershipId: string | null; role: Role | null };
    /** Set by `requireProject` once `:projectId` is resolved and confirmed to belong to the organization. */
    project?: ProjectEntity;
    /** Set by `requireTask` once `:taskId` is resolved and confirmed to belong to the project. */
    task?: TaskEntity;
    /** Set by `requireComment` once `:commentId` is resolved and confirmed to belong to the task. */
    comment?: CommentEntity;
    /** Set by `requireLabel` once `:labelId` is resolved and confirmed to belong to the organization. */
    label?: LabelEntity;
    /** Set by `requireWebhook` once `:webhookId` is resolved and confirmed to belong to the organization. */
    webhook?: WebhookEndpointEntity;
  }
}

export {};
