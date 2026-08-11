import type { Message } from "@a2a-js/sdk";
import {
  A2AError,
  type AgentExecutor,
  type ExecutionEventBus,
  type RequestContext
} from "@a2a-js/sdk/server";
import { handleHealthFactorA2a } from "./healthFactorAnalysis.js";

/** Structured-only A2A executor with no model, wallet, signer, or network client. */
export class HealthFactorGuardianAgentExecutor implements AgentExecutor {
  execute = (context: RequestContext, eventBus: ExecutionEventBus): Promise<void> => {
    const data = inboundData(context);
    let result: Record<string, unknown>;
    try {
      result =
        data === null
          ? {
              error: "INVALID_ANALYSIS_INPUT",
              issues: [
                {
                  path: "parts",
                  message: "Exactly one structured data part and no additional parts are required."
                }
              ],
              sourceContentsVerified: false,
              freshnessAttestedByAgent: false,
              marketplaceEligible: false,
              activationEligible: false,
              executionEnabled: false
            }
          : { ...handleHealthFactorA2a(data) };
    } catch (error) {
      const name = error instanceof Error ? error.constructor.name : "Error";
      throw A2AError.internalError(`${name}: health-factor analysis failed`);
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

function inboundData(context: RequestContext): Record<string, unknown> | null {
  const parts = context.userMessage.parts;
  if (parts.length !== 1) return null;
  const [part] = parts;
  if (part?.kind !== "data") return null;
  return part.data;
}

function publishReply(
  eventBus: ExecutionEventBus,
  context: RequestContext,
  data: Record<string, unknown>
): void {
  const message: Message = {
    kind: "message",
    role: "agent",
    messageId: `${context.userMessage.messageId}:proofera-health-factor-analysis`,
    parts: [{ kind: "data", data }],
    contextId: context.contextId,
    taskId: context.taskId
  };
  eventBus.publish(message);
  eventBus.finished();
}
