import { createHash } from "node:crypto";

import type { Message } from "@a2a-js/sdk";
import {
  A2AError,
  type AgentExecutor,
  type ExecutionEventBus,
  type RequestContext
} from "@a2a-js/sdk/server";

import { handleLpAnalysisA2a } from "./lpAnalysis.js";
import { handlePermissionAuditA2a, PERMISSION_AUDIT_SKILL } from "./permissionAudit.js";

/** A2A adapter exposing only the deterministic read-only LP analysis skill. */
export class LpRangeAnalysisExecutor implements AgentExecutor {
  execute = (context: RequestContext, eventBus: ExecutionEventBus): Promise<void> => {
    const data = inbound(context);
    let result: Record<string, unknown>;
    try {
      result =
        data === null
          ? {
              error: "INVALID_A2A_ENVELOPE",
              message: "Exactly one structured data part and no other parts are required.",
              executionEnabled: false
            }
          : data.skill === "analyze_lp_range"
            ? { ...handleLpAnalysisA2a(data) }
            : data.skill === PERMISSION_AUDIT_SKILL
              ? { ...handlePermissionAuditA2a(data) }
              : {
                  error: "UNKNOWN_SKILL",
                  skills: ["analyze_lp_range", PERMISSION_AUDIT_SKILL],
                  executionEnabled: false
                };
    } catch (error) {
      const name = error instanceof Error ? error.constructor.name : "Error";
      throw A2AError.internalError(`${name}: deterministic analysis failed`);
    }
    reply(eventBus, context, result);
    return Promise.resolve();
  };

  cancelTask = (taskId: string, eventBus: ExecutionEventBus): Promise<void> => {
    void taskId;
    void eventBus;
    return Promise.reject(A2AError.unsupportedOperation("cancel"));
  };
}

function inbound(context: RequestContext): Record<string, unknown> | null {
  const parts = context.userMessage.parts;
  if (parts.length !== 1 || parts[0]?.kind !== "data") return null;
  return parts[0].data;
}

function reply(
  eventBus: ExecutionEventBus,
  context: RequestContext,
  data: Record<string, unknown>
): void {
  const messageId = `lp-range-${createHash("sha256")
    .update(context.userMessage.messageId)
    .update("\0")
    .update(JSON.stringify(data))
    .digest("hex")}`;
  const message: Message = {
    kind: "message",
    role: "agent",
    messageId,
    parts: [{ kind: "data", data }],
    contextId: context.contextId,
    taskId: context.taskId
  };
  eventBus.publish(message);
  eventBus.finished();
}
