import type OpenAI from 'openai';
import type { DashboardData } from './data';
import { INSTRUCTIONS } from './prompt';
import { TOOLS, runTool, type ToolLink } from './tools';

/**
 * One assistant turn: the model answers, calling the dashboard's tools as it
 * needs, and the text streams out as it is written.
 *
 * The loop is ours rather than the provider's: stream a response; if it asked
 * for tools, run them here, append their results and go again; stop when a
 * response asks for none. Nothing is stored at the provider (`store: false`),
 * so each turn sends the conversation it needs and nothing lingers there.
 *
 * With a reasoning model, its reasoning comes back encrypted and is passed
 * back within the turn — the only way to carry it without storing it.
 */

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type AssistantEvent =
  | { type: 'text'; delta: string }
  | { type: 'activity'; label: string }
  | { type: 'links'; links: ToolLink[] }
  | { type: 'done' }
  | { type: 'error'; message: string };

/** The part of the OpenAI client the loop uses, so tests can stand one in. */
export type ResponsesClient = Pick<OpenAI, 'responses'>;

export interface AssistantConfig {
  client: ResponsesClient;
  model: string;
  /** Set for a reasoning model: "low", "medium" or "high". */
  reasoningEffort?: 'low' | 'medium' | 'high';
  maxOutputTokens?: number;
  /** Tool rounds before the turn gives up. */
  maxRounds?: number;
}

const TOOL_PARAMS: OpenAI.Responses.FunctionTool[] = TOOLS.map((t) => ({
  type: 'function',
  name: t.name,
  description: t.description,
  parameters: t.parameters,
  strict: true,
}));

/** What the reader sees while a tool runs. */
function activityLabel(name: string, args: Record<string, unknown>): string {
  const where = typeof args.state === 'string' && args.state ? ` for ${args.state}` : '';
  switch (name) {
    case 'get_overview':
      return `Reading the figures${where}`;
    case 'compare_states':
      return 'Comparing states';
    case 'find_facilities':
      return `Searching facilities${where}`;
    case 'get_facility':
      return 'Looking up the facility';
    case 'cost_breakdown':
      return `Breaking down the costs${where}`;
    case 'list_interventions':
      return `Listing interventions${where}`;
    case 'run_scenario':
      return 'Running the scenario';
    case 'rank_states_for_scenario':
      return 'Running the scenario in each state';
    default:
      return 'Looking it up';
  }
}

export async function* runAssistant(
  config: AssistantConfig,
  data: DashboardData,
  messages: ChatMessage[],
  signal?: AbortSignal,
): AsyncGenerator<AssistantEvent> {
  const { client, model, reasoningEffort, maxOutputTokens = 1500, maxRounds = 6 } = config;
  const input: OpenAI.Responses.ResponseInputItem[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  const links = new Map<string, ToolLink>();

  for (let round = 0; round < maxRounds; round += 1) {
    const stream = await client.responses.create(
      {
        model,
        instructions: INSTRUCTIONS,
        input,
        tools: TOOL_PARAMS,
        parallel_tool_calls: true,
        store: false,
        stream: true,
        max_output_tokens: maxOutputTokens,
        ...(reasoningEffort
          ? { reasoning: { effort: reasoningEffort }, include: ['reasoning.encrypted_content'] }
          : {}),
      },
      { signal },
    );

    const output: OpenAI.Responses.ResponseOutputItem[] = [];
    for await (const event of stream) {
      switch (event.type) {
        case 'response.output_text.delta':
          yield { type: 'text', delta: event.delta };
          break;
        case 'response.output_item.done':
          output.push(event.item);
          break;
        case 'response.failed':
          yield {
            type: 'error',
            message: event.response.error?.message ?? 'The model could not answer.',
          };
          return;
        case 'error':
          yield { type: 'error', message: event.message };
          return;
        default:
          break;
      }
    }

    const calls = output.filter(
      (item): item is OpenAI.Responses.ResponseFunctionToolCall => item.type === 'function_call',
    );
    if (!calls.length) {
      if (links.size) yield { type: 'links', links: [...links.values()] };
      yield { type: 'done' };
      return;
    }

    // Everything the model produced goes back in — its tool calls, and with a
    // reasoning model, its encrypted reasoning — followed by each result.
    input.push(...(output as OpenAI.Responses.ResponseInputItem[]));
    for (const call of calls) {
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(call.arguments) as Record<string, unknown>;
      } catch {
        input.push({
          type: 'function_call_output',
          call_id: call.call_id,
          output: JSON.stringify({ error: 'Arguments were not valid JSON.' }),
        });
        continue;
      }
      yield { type: 'activity', label: activityLabel(call.name, args) };
      const result = runTool(data, call.name, args);
      for (const link of (result as { links?: ToolLink[] }).links ?? []) links.set(link.href, link);
      input.push({
        type: 'function_call_output',
        call_id: call.call_id,
        output: JSON.stringify(result),
      });
    }
  }

  yield {
    type: 'error',
    message:
      'That question needed more lookups than one answer allows. Try asking it in smaller parts.',
  };
}
