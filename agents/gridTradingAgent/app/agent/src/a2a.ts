import type { DataPart, Message } from "@a2a-js/sdk";
import {
  A2AError,
  type AgentExecutor,
  type ExecutionEventBus,
  type RequestContext
} from "@a2a-js/sdk/server";
import { GRID_TRADING_SKILL, handleGridTradingA2a } from "./gridAnalysis.js";

/**
 * Structured-only A2A executor. Text parts are never interpreted as commands,
 * and this executor has no model, wallet, signing, or network client.
 */
export class GridTradingAgentExecutor implements AgentExecutor {
  execute = (context: RequestContext, eventBus: ExecutionEventBus): Promise<void> => {
    const data = inboundData(context);
    let result: Record<string, unknown>;
    try {
      result = { ...handleGridTradingA2a(data) };
    } catch {
      throw A2AError.internalError("Grid analysis failed");
    }
    publishReply(eventBus, context, result);
    return Promise.resolve();
  };

  cancelTask = (taskId: string, eventBus: ExecutionEventBus): Promise<void> => {
    void taskId;
    void eventBus;
    return Promise.reject(A2AError.unsupportedOperation("cancel"));
  };
}

function inboundData(context: RequestContext): Record<string, unknown> {
  const parts = context.userMessage.parts;
  const dataParts = parts.filter((part): part is DataPart => part.kind === "data");
  if (dataParts.length !== 1) {
    return {
      skill: null,
      hint:
        `send exactly one ${GRID_TRADING_SKILL} structured A2A data part; ` +
        "text and ambiguous multipart requests are not executed"
    };
  }
  return dataParts[0]?.data ?? { skill: null };
}

function publishReply(
  eventBus: ExecutionEventBus,
  context: RequestContext,
  data: Record<string, unknown>
): void {
  const message: Message = {
    kind: "message",
    role: "agent",
    messageId: `${context.userMessage.messageId}:proofera-grid-analysis`,
    parts: [{ kind: "data", data }],
    contextId: context.contextId,
    taskId: context.taskId
  };
  eventBus.publish(message);
  eventBus.finished();
}
