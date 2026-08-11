import { createHash } from "node:crypto";

import type { DataPart, Message } from "@a2a-js/sdk";
import {
  A2AError,
  type AgentExecutor,
  type ExecutionEventBus,
  type RequestContext
} from "@a2a-js/sdk/server";

import { handleYieldAnalysisA2a } from "./yieldAnalysis.js";

export class YieldAnalysisExecutor implements AgentExecutor {
  execute = (context: RequestContext, eventBus: ExecutionEventBus): Promise<void> => {
    const data = inbound(context);
    let result: Record<string, unknown>;
    try {
      result =
        data === null
          ? {
              error: "INVALID_A2A_ENVELOPE",
              message: "Exactly one structured data part is required.",
              executionEnabled: false
            }
          : data.skill === "analyze_yield_opportunities"
            ? { ...handleYieldAnalysisA2a(data) }
            : {
                error: "UNKNOWN_SKILL",
                skills: ["analyze_yield_opportunities"],
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
  const dataParts = parts.filter((part): part is DataPart => part.kind === "data");
  return dataParts.length === 1 ? (dataParts[0]?.data ?? null) : null;
}

function reply(
  eventBus: ExecutionEventBus,
  context: RequestContext,
  data: Record<string, unknown>
): void {
  const messageId = `yield-${createHash("sha256")
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
